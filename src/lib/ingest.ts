import "server-only";

import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db";
import { localProvider } from "./ai/local";
import { analyseAmbiguity, qualityScore } from "./ai/engine/ambiguity";
import { chunkDocument } from "./ai/engine/text";
import { cleanDocumentText } from "./ai/engine/structure";
import { inferRelationships } from "./ai/engine/coverage";
import type { ConflictSubject } from "./ai/engine/conflict";
import {
  listConstraints,
  listRequirements,
  listStakeholders,
  getProject,
} from "./queries";
import type { DocumentKind, RequirementType } from "./types";

/**
 * Document ingestion.
 *
 * Runs the same pipeline the demo seed runs, on a document the user supplied.
 * Nothing about the analysis is different - which is the point. What you see in
 * the demo is what you get on your own material.
 *
 * Re-running conflict detection across the whole project after each ingest is
 * deliberate and is the reason this cannot be a per-document operation: the
 * conflicts worth finding are precisely the ones between a new document and an
 * old one.
 */

/** Text formats this build can read without a parsing dependency. */
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "log", "eml", "json"]);

/** Formats the architecture supports but this build has no parser for. */
const BINARY_EXTENSIONS: Record<string, string> = {
  docx: "DOCX text extraction needs a parser (mammoth). The pipeline below is format-agnostic, so adding one is a single function.",
  doc: "Legacy .doc is not readable without a converter. Save as .docx or paste the text.",
  msg: "Outlook .msg needs a parser. Export the thread as plain text instead.",
};

/** Built at runtime so no control character appears in this source file. */
const NUL = String.fromCharCode(0);

export const MAX_UPLOAD_BYTES = Number(process.env.REQUIREIQ_MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024);

export class IngestError extends Error {
  constructor(
    message: string,
    /** True when the format is architecturally supported but not in this build. */
    readonly unsupportedFormat = false,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export interface IngestResult {
  documentId: string;
  title: string;
  chunks: number;
  requirements: number;
  constraints: number;
  findings: number;
  newConflicts: number;
  /** Sentences that looked obligation-like but were rejected, with reasons. */
  rejected: Array<{ sentence: string; reason: string }>;
}

/**
 * Turns an uploaded file into text.
 *
 * The seam that keeps format support out of the analysis path: everything
 * downstream takes a string, so supporting PDF means implementing this one
 * branch and nothing else.
 */
export async function extractText(filename: string, bytes: Uint8Array): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    const { extractPdfText, PdfExtractionError } = await import("./pdf");
    try {
      const { text } = await extractPdfText(bytes);
      return text;
    } catch (error) {
      if (error instanceof PdfExtractionError) throw new IngestError(error.message);
      throw error;
    }
  }

  const unsupported = BINARY_EXTENSIONS[extension];
  if (unsupported) throw new IngestError(unsupported, true);

  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new IngestError(
      `"${extension || "no extension"}" is not a format this build reads. Supported: ${[...TEXT_EXTENSIONS, "pdf"].sort().join(", ")}.`,
      true,
    );
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  // A NUL byte in the first kilobyte means this is binary content wearing a
  // text extension. Feeding that to the analyser produces garbage requirements.
  if (text.slice(0, 1024).includes(NUL)) {
    throw new IngestError("This file looks like binary content with a text extension.");
  }
  if (text.trim().length < 40) {
    throw new IngestError("There is not enough text in this file to analyse.");
  }
  return text.replace(/\r\n/g, "\n");
}

/** Reads a document kind from the filename and content, defaulting honestly. */
export function inferKind(filename: string, content: string): DocumentKind {
  const name = filename.toLowerCase();
  const head = content.slice(0, 600).toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".tsv")) return "csv";
  if (/^from:\s/m.test(head) || name.includes("email") || name.endsWith(".eml")) return "email";
  if (name.includes("transcript") || /\b(transcribed|facilitator)\b/.test(head)) return "transcript";
  if (name.includes("notes") || name.includes("minutes") || head.includes("attendees:")) return "meeting_notes";
  if (name.includes("spec") || name.includes("requirement")) return "specification";
  if (name.includes("policy") || name.includes("standard")) return "policy";
  return "other";
}

export function ingestDocument(input: {
  projectId: string;
  title: string;
  filename: string;
  content: string;
  kind?: DocumentKind;
  author?: string | null;
  capturedAt?: string;
}): IngestResult {
  const project = getProject(input.projectId);
  if (!project) throw new IngestError("That project does not exist.");

  // Store what the analyser actually read. The chunker cleans before computing
  // offsets, so persisting the raw text would leave every citation pointing a
  // few hundred characters off. Cleaning is idempotent, so the chunker's own
  // second pass is a no-op.
  const content = cleanDocumentText(input.content);

  const db = getDb();
  const stakeholders = listStakeholders(input.projectId);
  const documentId = `doc_${randomUUID()}`;
  const kind = input.kind ?? inferKind(input.filename, input.content);
  const capturedAt = input.capturedAt ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const postBaseline = Date.parse(capturedAt) > Date.parse(project.baselineDate);

  const result = localProvider.extract({
    document: {
      id: documentId,
      projectId: input.projectId,
      title: input.title,
      kind,
      filename: input.filename,
      author: input.author ?? null,
      capturedAt,
      status: "analysed",
      wordCount: content.split(/\s+/).length,
      content,
      uploadedAt: now,
      userUploaded: true,
    },
    stakeholders,
  });

  let requirementCount = 0;
  let constraintCount = 0;
  let findingCount = 0;
  let chunkCount = 0;

  transaction(() => {
    db.prepare(
      `INSERT INTO documents (id, project_id, title, kind, filename, author, captured_at, status, word_count, content, uploaded_at, user_uploaded)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'analysed', ?, ?, ?, 1)`,
    ).run(
      documentId,
      input.projectId,
      input.title,
      kind,
      input.filename,
      input.author ?? null,
      capturedAt,
      content.split(/\s+/).length,
      content,
      now,
    );

    const chunkIds = new Map<number, string>();
    const insertChunk = db.prepare(
      `INSERT INTO document_chunks (id, document_id, project_id, ordinal, locator, text, start_offset, end_offset)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of chunkDocument(content)) {
      const chunkId = `chk_${documentId}_${chunk.ordinal}`;
      chunkIds.set(chunk.ordinal, chunkId);
      insertChunk.run(
        chunkId,
        documentId,
        input.projectId,
        chunk.ordinal,
        chunk.locator,
        chunk.text,
        chunk.start,
        chunk.end,
      );
      chunkCount += 1;
    }

    // Reference numbers continue the existing sequence so they stay readable
    // and never collide with a seeded record.
    const maxRef = db
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(ref, 5) AS INTEGER)), 1000) AS n FROM requirements WHERE project_id = ?`,
      )
      .get(input.projectId) as { n: number };
    let requirementSeq = Number(maxRef.n);

    const maxCon = db
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(ref, 5) AS INTEGER)), 0) AS n FROM constraints_tbl WHERE project_id = ?`,
      )
      .get(input.projectId) as { n: number };
    let constraintSeq = Number(maxCon.n);

    const insertEvidence = db.prepare(
      `INSERT INTO evidence (id, project_id, subject_type, subject_id, document_id, chunk_id, quote, locator, start_offset, end_offset, stakeholder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAudit = db.prepare(
      `INSERT INTO audit_events (id, project_id, subject_type, subject_id, action, detail, actor, actor_kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'RequireIQ analysis engine', 'ai', ?)`,
    );

    for (const extracted of result.requirements) {
      requirementSeq += 1;
      const id = `req_${requirementSeq}`;
      const findings = analyseAmbiguity(extracted.statement);

      db.prepare(
        `INSERT INTO requirements (id, project_id, ref, statement, original_statement, type, priority, status,
          provenance, confidence, rationale, classification_evidence, owner_stakeholder_id, acceptance_criteria,
          post_baseline, quality_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', 'ai_analysis', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.projectId,
        `REQ-${requirementSeq}`,
        extracted.statement,
        extracted.statement,
        extracted.type,
        extracted.priority,
        extracted.confidence,
        extracted.rationale,
        extracted.classificationEvidence,
        extracted.ownerStakeholderId,
        extracted.acceptanceCriteria,
        postBaseline ? 1 : 0,
        qualityScore(findings),
        now,
        now,
      );

      insertEvidence.run(
        `ev_${randomUUID()}`,
        input.projectId,
        "requirement",
        id,
        documentId,
        chunkIds.get(extracted.evidence.chunkOrdinal) ?? null,
        extracted.evidence.quote,
        extracted.evidence.locator,
        extracted.evidence.startOffset,
        extracted.evidence.endOffset,
        extracted.evidence.stakeholderId,
      );

      insertAudit.run(
        `aud_${randomUUID()}`,
        input.projectId,
        "requirement",
        id,
        "extracted",
        `Extracted from ${input.title} (${extracted.evidence.locator}) at ${Math.round(extracted.confidence * 100)}% confidence.`,
        now,
      );

      const insertAmbiguity = db.prepare(
        `INSERT INTO ambiguities (id, project_id, requirement_id, kind, severity, span, span_start, span_end, explanation, suggestion, resolved, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      );
      for (const finding of findings) {
        insertAmbiguity.run(
          `amb_${randomUUID()}`,
          input.projectId,
          id,
          finding.kind,
          finding.severity,
          finding.span,
          finding.spanStart,
          finding.spanEnd,
          finding.explanation,
          finding.suggestion,
          now,
        );
        findingCount += 1;
      }
      requirementCount += 1;
    }

    for (const extracted of result.constraints) {
      constraintSeq += 1;
      const id = `con_${String(constraintSeq).padStart(2, "0")}`;
      db.prepare(
        `INSERT INTO constraints_tbl (id, project_id, ref, statement, category, value, unit, owner_stakeholder_id, provenance, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'source', ?)`,
      ).run(
        id,
        input.projectId,
        `CON-${String(constraintSeq).padStart(2, "0")}`,
        extracted.statement,
        extracted.category,
        extracted.value,
        extracted.unit,
        extracted.ownerStakeholderId,
        now,
      );
      insertEvidence.run(
        `ev_${randomUUID()}`,
        input.projectId,
        "constraint",
        id,
        documentId,
        chunkIds.get(extracted.evidence.chunkOrdinal) ?? null,
        extracted.evidence.quote,
        extracted.evidence.locator,
        extracted.evidence.startOffset,
        extracted.evidence.endOffset,
        extracted.evidence.stakeholderId,
      );
      constraintCount += 1;
    }

    insertAudit.run(
      `aud_${randomUUID()}`,
      input.projectId,
      "document",
      documentId,
      "ingested",
      `"${input.title}" ingested: ${chunkCount} chunks, ${requirementCount} requirements, ${constraintCount} constraints, ${findingCount} quality findings. ${result.rejected.length} candidate sentences rejected.`,
      now,
    );
  });

  const newConflicts = refreshConflicts(input.projectId);
  refreshRelationships(input.projectId);

  return {
    documentId,
    title: input.title,
    chunks: chunkCount,
    requirements: requirementCount,
    constraints: constraintCount,
    findings: findingCount,
    newConflicts,
    rejected: result.rejected.slice(0, 8),
  };
}

/**
 * Re-runs conflict detection over the whole project.
 *
 * Existing conflicts keep their id, their status and their resolution note - a
 * reviewer's decision must survive an ingest. Only genuinely new tensions are
 * inserted, and conflicts whose underlying records have gone are removed.
 */
export function refreshConflicts(projectId: string): number {
  const db = getDb();
  const stakeholderTeams = new Map(listStakeholders(projectId).map((s) => [s.id, s.team]));

  const subjects: ConflictSubject[] = [
    ...listRequirements(projectId).map((r) => ({
      id: r.id,
      ref: r.ref,
      type: "requirement" as const,
      statement: r.statement,
      team: r.ownerStakeholderId ? stakeholderTeams.get(r.ownerStakeholderId) ?? null : null,
    })),
    ...listConstraints(projectId).map((c) => ({
      id: c.id,
      ref: c.ref,
      type: "constraint" as const,
      statement: c.statement,
      team: c.ownerStakeholderId ? stakeholderTeams.get(c.ownerStakeholderId) ?? null : null,
      category: c.category,
    })),
  ];

  const detected = localProvider.detectConflicts(subjects);
  const existing = db.prepare("SELECT id, ref, left_id, right_id FROM conflicts WHERE project_id = ?").all(projectId) as Array<{
    id: string;
    ref: string;
    left_id: string;
    right_id: string;
  }>;
  const existingPairs = new Set(existing.map((c) => [c.left_id, c.right_id].sort().join("::")));

  const maxRef = existing.reduce((max, c) => Math.max(max, Number(c.ref.split("-")[1] ?? 0)), 0);
  let sequence = maxRef;
  let added = 0;
  const now = new Date().toISOString();

  transaction(() => {
    for (const conflict of detected) {
      const key = [conflict.leftId, conflict.rightId].sort().join("::");
      if (existingPairs.has(key)) continue;

      sequence += 1;
      const id = `cfl_${randomUUID()}`;
      db.prepare(
        `INSERT INTO conflicts (id, project_id, ref, title, kind, severity, status, detector, explanation,
          validation_question, left_type, left_id, right_type, right_id, confidence, impacted_teams,
          resolution_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).run(
        id,
        projectId,
        `CFL-${String(sequence).padStart(2, "0")}`,
        conflict.title,
        conflict.kind,
        conflict.severity,
        conflict.detector,
        conflict.explanation,
        conflict.validationQuestion,
        conflict.leftType,
        conflict.leftId,
        conflict.rightType,
        conflict.rightId,
        conflict.confidence,
        conflict.impactedTeams.join(", "),
        now,
        now,
      );

      db.prepare(
        `INSERT INTO audit_events (id, project_id, subject_type, subject_id, action, detail, actor, actor_kind, created_at)
         VALUES (?, ?, 'conflict', ?, 'detected', ?, 'RequireIQ analysis engine', 'ai', ?)`,
      ).run(
        `aud_${randomUUID()}`,
        projectId,
        id,
        `${conflict.detector} fired after ingestion, at ${Math.round(conflict.confidence * 100)}% confidence.`,
        now,
      );
      added += 1;
    }
  });

  return added;
}

/** Rebuilds inferred (non-conflict) relationship edges from the current register. */
function refreshRelationships(projectId: string): void {
  const db = getDb();
  const requirements = listRequirements(projectId).map((r) => ({
    id: r.id,
    statement: r.statement,
    type: r.type as RequirementType,
  }));

  transaction(() => {
    // Contradiction edges come from conflicts and are owned by that table, so
    // only the inferred edges are rebuilt here.
    db.prepare("DELETE FROM relationships WHERE project_id = ? AND kind != 'contradicts'").run(projectId);
    const insert = db.prepare(
      `INSERT INTO relationships (id, project_id, source_type, source_id, target_type, target_id, kind, rationale, strength, provenance)
       VALUES (?, ?, 'requirement', ?, 'requirement', ?, ?, ?, ?, 'ai_analysis')`,
    );
    for (const rel of inferRelationships(requirements)) {
      insert.run(
        `rel_${randomUUID()}`,
        projectId,
        rel.sourceId,
        rel.targetId,
        rel.kind,
        rel.rationale,
        rel.strength,
      );
    }
  });
}
