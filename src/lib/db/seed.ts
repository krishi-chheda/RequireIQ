import "server-only";

import { openDb, setMeta, transaction } from "./connection";
import { DEMO_CORPUS } from "@/lib/demo/corpus";
import { localProvider } from "@/lib/ai/local";
import { analyseAmbiguity, qualityScore } from "@/lib/ai/engine/ambiguity";
import { inferRelationships } from "@/lib/ai/engine/coverage";
import { chunkDocument } from "@/lib/ai/engine/text";
import { cleanDocumentText } from "@/lib/ai/engine/structure";
import type { ConflictSubject } from "@/lib/ai/engine/conflict";
import type {
  DocumentKind,
  RequirementType,
  Severity,
  Stakeholder,
} from "@/lib/types";

/**
 * Seeds the Meridian Bank demo engagement.
 *
 * Critically, the seed does not insert a hand-written register. It ingests the
 * fifteen documents in `demo-data/` and runs the real pipeline over them:
 * chunk, extract, classify, analyse quality, detect conflicts, detect gaps,
 * infer relationships. Everything the product displays was derived from source
 * text at seed time by the same code that would run on a document you upload.
 *
 * That is why the planted problems in the corpus are a meaningful test: if the
 * engine regresses, the demo visibly loses findings.
 */

const PROJECT_ID = "prj_meridian_onboarding";
const ANALYST = "RequireIQ analysis engine";

export function seedDatabase(): void {
  const db = openDb();
  const now = new Date("2026-08-15T09:00:00Z");
  let clock = 0;
  /** Monotonic timestamps so the audit trail reads in a sensible order. */
  const tick = (): string => new Date(now.getTime() + clock++ * 1000).toISOString();

  transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, key, name, client, description, phase, baseline_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      PROJECT_ID,
      "MER-ONB",
      "Customer Onboarding Platform",
      "Meridian Bank plc",
      "Replacement of branch-first personal current account origination with a digital-first onboarding platform. Discovery ran 8 June to 14 August 2026 across twelve stakeholder workshops; build commenced 1 September 2026 against a committed go-live of 2 March 2027.",
      "Build - discovery register under review",
      "2026-07-24",
      tick(),
    );

    // ---- Stakeholders ----------------------------------------------------
    const stakeholderRegister = DEMO_CORPUS.find((d) => d.kind === "csv");
    const stakeholders: Stakeholder[] = [];
    if (stakeholderRegister) {
      const [header, ...rows] = stakeholderRegister.content.trim().split("\n");
      const columns = (header ?? "").split(",").map((c) => c.trim());
      rows.forEach((row, i) => {
        const cells = splitCsvRow(row);
        const record = Object.fromEntries(columns.map((col, idx) => [col, cells[idx] ?? ""]));
        const influence = record.influence === "high" || record.influence === "low" ? record.influence : "medium";
        stakeholders.push({
          id: `stk_${String(i + 1).padStart(2, "0")}`,
          projectId: PROJECT_ID,
          name: record.name ?? "",
          role: record.role ?? "",
          org: record.org ?? "",
          team: record.team ?? "",
          email: record.email ?? "",
          influence,
        });
      });
    }

    const insertStakeholder = db.prepare(
      `INSERT INTO stakeholders (id, project_id, name, role, org, team, email, influence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const person of stakeholders) {
      insertStakeholder.run(
        person.id,
        person.projectId,
        person.name,
        person.role,
        person.org,
        person.team,
        person.email,
        person.influence,
      );
    }
    const teamById = new Map(stakeholders.map((s) => [s.id, s.team]));

    // ---- Documents and chunks -------------------------------------------
    const insertDocument = db.prepare(
      `INSERT INTO documents (id, project_id, title, kind, filename, author, captured_at, status, word_count, content, uploaded_at, user_uploaded)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'analysed', ?, ?, ?, 0)`,
    );
    const insertChunk = db.prepare(
      `INSERT INTO document_chunks (id, document_id, project_id, ordinal, locator, text, start_offset, end_offset)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Clean once here so every downstream use - the stored document row, the
    // chunk offsets and the extraction pass - agrees on the same text. Task 5
    // made the chunker clean before computing offsets; storing raw text here
    // would leave the demo's own citations pointing a few characters off.
    const documents = DEMO_CORPUS.map((doc, i) => ({
      ...doc,
      id: `doc_${String(i + 1).padStart(2, "0")}`,
      content: cleanDocumentText(doc.content),
    }));

    const chunkIdByDocOrdinal = new Map<string, string>();
    for (const doc of documents) {
      insertDocument.run(
        doc.id,
        PROJECT_ID,
        doc.title,
        doc.kind,
        doc.filename,
        doc.author,
        doc.capturedAt,
        doc.content.split(/\s+/).length,
        doc.content,
        tick(),
      );

      for (const chunk of chunkDocument(doc.content)) {
        const chunkId = `chk_${doc.id}_${chunk.ordinal}`;
        chunkIdByDocOrdinal.set(`${doc.id}:${chunk.ordinal}`, chunkId);
        insertChunk.run(
          chunkId,
          doc.id,
          PROJECT_ID,
          chunk.ordinal,
          chunk.locator,
          chunk.text,
          chunk.start,
          chunk.end,
        );
      }
    }

    // ---- Extraction -------------------------------------------------------
    const insertRequirement = db.prepare(
      `INSERT INTO requirements (id, project_id, ref, statement, original_statement, type, priority, status,
        provenance, confidence, rationale, classification_evidence, owner_stakeholder_id, acceptance_criteria,
        post_baseline, quality_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertConstraint = db.prepare(
      `INSERT INTO constraints_tbl (id, project_id, ref, statement, category, value, unit, owner_stakeholder_id, provenance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'source', ?)`,
    );
    const insertEvidence = db.prepare(
      `INSERT INTO evidence (id, project_id, subject_type, subject_id, document_id, chunk_id, quote, locator, start_offset, end_offset, stakeholder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAudit = db.prepare(
      `INSERT INTO audit_events (id, project_id, subject_type, subject_id, action, detail, actor, actor_kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAmbiguity = db.prepare(
      `INSERT INTO ambiguities (id, project_id, requirement_id, kind, severity, span, span_start, span_end, explanation, suggestion, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    );

    const baseline = Date.parse("2026-07-24");
    let requirementSeq = 1000;
    let constraintSeq = 0;
    let evidenceSeq = 0;
    let auditSeq = 0;
    let ambiguitySeq = 0;

    const subjects: ConflictSubject[] = [];
    const requirementRows: Array<{
      id: string;
      ref: string;
      statement: string;
      type: RequirementType;
    }> = [];

    for (const doc of documents) {
      if (doc.kind === "csv") continue;

      const result = localProvider.extract({
        document: {
          id: doc.id,
          projectId: PROJECT_ID,
          title: doc.title,
          kind: doc.kind as DocumentKind,
          filename: doc.filename,
          author: doc.author,
          capturedAt: doc.capturedAt,
          status: "analysed",
          wordCount: doc.content.split(/\s+/).length,
          content: doc.content,
          uploadedAt: doc.capturedAt,
          userUploaded: false,
        },
        stakeholders,
      });

      const postBaseline = Date.parse(doc.capturedAt) > baseline;

      for (const extracted of result.requirements) {
        requirementSeq += 1;
        const id = `req_${requirementSeq}`;
        const ref = `REQ-${requirementSeq}`;
        const findings = analyseAmbiguity(extracted.statement);

        insertRequirement.run(
          id,
          PROJECT_ID,
          ref,
          extracted.statement,
          extracted.statement,
          extracted.type,
          extracted.priority,
          "proposed",
          "ai_analysis",
          extracted.confidence,
          extracted.rationale,
          extracted.classificationEvidence,
          extracted.ownerStakeholderId,
          extracted.acceptanceCriteria,
          postBaseline ? 1 : 0,
          qualityScore(findings),
          tick(),
          tick(),
        );

        evidenceSeq += 1;
        insertEvidence.run(
          `ev_${evidenceSeq}`,
          PROJECT_ID,
          "requirement",
          id,
          doc.id,
          chunkIdByDocOrdinal.get(`${doc.id}:${extracted.evidence.chunkOrdinal}`) ?? null,
          extracted.evidence.quote,
          extracted.evidence.locator,
          extracted.evidence.startOffset,
          extracted.evidence.endOffset,
          extracted.evidence.stakeholderId,
        );

        auditSeq += 1;
        insertAudit.run(
          `aud_${auditSeq}`,
          PROJECT_ID,
          "requirement",
          id,
          "extracted",
          `Extracted from ${doc.title} (${extracted.evidence.locator}) at ${Math.round(extracted.confidence * 100)}% confidence. ${extracted.classificationEvidence}`,
          ANALYST,
          "ai",
          tick(),
        );

        for (const finding of findings) {
          ambiguitySeq += 1;
          insertAmbiguity.run(
            `amb_${ambiguitySeq}`,
            PROJECT_ID,
            id,
            finding.kind,
            finding.severity,
            finding.span,
            finding.spanStart,
            finding.spanEnd,
            finding.explanation,
            finding.suggestion,
            tick(),
          );
        }

        subjects.push({
          id,
          ref,
          type: "requirement",
          statement: extracted.statement,
          team: extracted.ownerStakeholderId ? teamById.get(extracted.ownerStakeholderId) ?? null : null,
        });
        requirementRows.push({ id, ref, statement: extracted.statement, type: extracted.type });
      }

      for (const extracted of result.constraints) {
        constraintSeq += 1;
        const id = `con_${String(constraintSeq).padStart(2, "0")}`;
        const ref = `CON-${String(constraintSeq).padStart(2, "0")}`;

        insertConstraint.run(
          id,
          PROJECT_ID,
          ref,
          extracted.statement,
          extracted.category,
          extracted.value,
          extracted.unit,
          extracted.ownerStakeholderId,
          tick(),
        );

        evidenceSeq += 1;
        insertEvidence.run(
          `ev_${evidenceSeq}`,
          PROJECT_ID,
          "constraint",
          id,
          doc.id,
          chunkIdByDocOrdinal.get(`${doc.id}:${extracted.evidence.chunkOrdinal}`) ?? null,
          extracted.evidence.quote,
          extracted.evidence.locator,
          extracted.evidence.startOffset,
          extracted.evidence.endOffset,
          extracted.evidence.stakeholderId,
        );

        subjects.push({
          id,
          ref,
          type: "constraint",
          statement: extracted.statement,
          team: extracted.ownerStakeholderId ? teamById.get(extracted.ownerStakeholderId) ?? null : null,
          category: extracted.category,
        });
      }
    }

    // ---- Conflicts --------------------------------------------------------
    const insertConflict = db.prepare(
      `INSERT INTO conflicts (id, project_id, ref, title, kind, severity, status, detector, explanation,
        validation_question, left_type, left_id, right_type, right_id, confidence, impacted_teams,
        resolution_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    );

    const conflicts = localProvider.detectConflicts(subjects);
    const conflictIds: string[] = [];
    conflicts.forEach((conflict, i) => {
      const id = `cfl_${String(i + 1).padStart(2, "0")}`;
      const ref = `CFL-${String(i + 1).padStart(2, "0")}`;
      conflictIds.push(id);

      insertConflict.run(
        id,
        PROJECT_ID,
        ref,
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
        tick(),
        tick(),
      );

      auditSeq += 1;
      insertAudit.run(
        `aud_${auditSeq}`,
        PROJECT_ID,
        "conflict",
        id,
        "detected",
        `${conflict.detector} fired at ${Math.round(conflict.confidence * 100)}% confidence, severity ${conflict.severity}.`,
        ANALYST,
        "ai",
        tick(),
      );

      // A conflict is also a contradiction edge in the requirement graph.
      db.prepare(
        `INSERT INTO relationships (id, project_id, source_type, source_id, target_type, target_id, kind, rationale, strength, provenance)
         VALUES (?, ?, ?, ?, ?, ?, 'contradicts', ?, ?, 'ai_analysis')`,
      ).run(
        `rel_cfl_${i}`,
        PROJECT_ID,
        conflict.leftType,
        conflict.leftId,
        conflict.rightType,
        conflict.rightId,
        `${ref}: ${conflict.title}`,
        conflict.confidence,
      );
    });

    // ---- Relationships ----------------------------------------------------
    const insertRelationship = db.prepare(
      `INSERT INTO relationships (id, project_id, source_type, source_id, target_type, target_id, kind, rationale, strength, provenance)
       VALUES (?, ?, 'requirement', ?, 'requirement', ?, ?, ?, ?, 'ai_analysis')`,
    );
    inferRelationships(requirementRows).forEach((rel, i) => {
      insertRelationship.run(
        `rel_${String(i + 1).padStart(3, "0")}`,
        PROJECT_ID,
        rel.sourceId,
        rel.targetId,
        rel.kind,
        rel.rationale,
        rel.strength,
      );
    });

    // ---- Coverage gaps ----------------------------------------------------
    const insertGap = db.prepare(
      `INSERT INTO coverage_gaps (id, project_id, area, expectation, reason, severity, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    );
    const gaps = localProvider.detectGaps(subjects.map((s) => s.statement));
    gaps.forEach((gap, i) => {
      insertGap.run(`gap_${String(i + 1).padStart(2, "0")}`, PROJECT_ID, gap.area, gap.expectation, gap.reason, gap.severity, tick());
    });

    // ---- Risks ------------------------------------------------------------
    // Risks are derived from findings that already exist rather than invented,
    // so every risk can be traced to the record that produced it.
    const insertRisk = db.prepare(
      `INSERT INTO risks (id, project_id, ref, category, title, description, severity, likelihood, mitigation, status, requirement_id, conflict_id, provenance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, 'ai_analysis', ?)`,
    );
    let riskSeq = 0;
    const addRisk = (
      category: string,
      title: string,
      description: string,
      severity: Severity,
      likelihood: "low" | "medium" | "high",
      mitigation: string,
      requirementId: string | null,
      conflictId: string | null,
    ): void => {
      riskSeq += 1;
      insertRisk.run(
        `rsk_${String(riskSeq).padStart(2, "0")}`,
        PROJECT_ID,
        `RSK-${String(riskSeq).padStart(2, "0")}`,
        category,
        title,
        description,
        severity,
        likelihood,
        mitigation,
        requirementId,
        conflictId,
        tick(),
      );
    };

    conflicts.forEach((conflict, i) => {
      addRisk(
        "conflict",
        conflict.title,
        `${firstLine(conflict.explanation)} Unresolved, this reaches build as a decision the engineering team will make by default rather than by agreement.`,
        conflict.severity,
        conflict.severity === "critical" || conflict.severity === "high" ? "high" : "medium",
        conflict.validationQuestion,
        null,
        conflictIds[i] ?? null,
      );
    });

    const unowned = db
      .prepare(`SELECT id, ref, statement FROM requirements WHERE project_id = ? AND owner_stakeholder_id IS NULL`)
      .all(PROJECT_ID) as Array<{ id: string; ref: string; statement: string }>;
    for (const requirement of unowned) {
      addRisk(
        "ownership",
        `${requirement.ref} has no identifiable business owner`,
        `"${truncate(requirement.statement, 180)}" was captured without an attributable requester. There is nobody to agree acceptance criteria or to approve the requirement for build.`,
        "medium",
        "high",
        "Identify and confirm a named business owner before the register is issued for sign-off, or remove the requirement from scope.",
        requirement.id,
        null,
      );
    }

    const noAcceptance = db
      .prepare(
        `SELECT id, ref, statement FROM requirements
         WHERE project_id = ? AND priority = 'must' AND acceptance_criteria IS NULL
         ORDER BY quality_score ASC LIMIT 6`,
      )
      .all(PROJECT_ID) as Array<{ id: string; ref: string; statement: string }>;
    for (const requirement of noAcceptance) {
      addRisk(
        "acceptance_criteria",
        `${requirement.ref} is binding but has no acceptance criteria`,
        `"${truncate(requirement.statement, 180)}" is a must-have requirement with no stated test. It cannot be accepted or rejected at UAT without a reviewer inventing the criteria on the day.`,
        "high",
        "high",
        "Agree the acceptance test with the named business owner and record it against the requirement before build starts.",
        requirement.id,
        null,
      );
    }

    const postBaselineCount = db
      .prepare(`SELECT COUNT(*) AS n FROM requirements WHERE project_id = ? AND post_baseline = 1`)
      .get(PROJECT_ID) as { n: number };
    if (postBaselineCount.n > 0) {
      addRisk(
        "scope_creep",
        `${postBaselineCount.n} requirements introduced after the scope baseline`,
        `The scope baseline was agreed on 24 July 2026. ${postBaselineCount.n} requirements entered the register after that date without passing through change control, and the capacity, cost and schedule commitments were all set before they arrived.`,
        "high",
        "high",
        "Put every post-baseline requirement through change control and restate the affected non-functional targets, or formally defer them to a later release.",
        null,
        null,
      );
    }

    for (const gap of gaps.filter((g) => g.severity === "high")) {
      addRisk(
        "coverage_gap",
        `Unspecified: ${gap.area}`,
        gap.reason,
        gap.severity,
        "medium",
        gap.expectation,
        null,
        null,
      );
    }

    const highAmbiguity = db
      .prepare(
        `SELECT r.id, r.ref, r.statement, COUNT(a.id) AS findings
         FROM requirements r JOIN ambiguities a ON a.requirement_id = r.id
         WHERE r.project_id = ? AND a.severity = 'high' AND a.resolved = 0
         GROUP BY r.id ORDER BY findings DESC, r.quality_score ASC LIMIT 4`,
      )
      .all(PROJECT_ID) as Array<{ id: string; ref: string; statement: string; findings: number }>;
    for (const requirement of highAmbiguity) {
      addRisk(
        "ambiguity",
        `${requirement.ref} carries ${requirement.findings} high-severity quality findings`,
        `"${truncate(requirement.statement, 180)}" cannot be implemented consistently as written. Two engineers reading it would build different things and both could argue they had met it.`,
        "high",
        "high",
        "Rewrite with the business owner using the suggested measurable form, then re-baseline the requirement.",
        requirement.id,
        null,
      );
    }

    // ---- Decisions --------------------------------------------------------
    // Two decisions actually recorded in the source corpus. Nothing invented.
    db.prepare(
      `INSERT INTO decisions (id, project_id, ref, title, detail, decided_by, decided_at, requirement_id, conflict_id, provenance)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'source')`,
    ).run(
      "dec_01",
      PROJECT_ID,
      "DEC-01",
      "Scope baseline agreed",
      "The engagement brief fixed the scope baseline at 24 July 2026. Anything added after that date passes through the change control process in section 7 of the master services agreement.",
      "Steering committee",
      "2026-07-24",
    );
    db.prepare(
      `INSERT INTO decisions (id, project_id, ref, title, detail, decided_by, decided_at, requirement_id, conflict_id, provenance)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'source')`,
    ).run(
      "dec_02",
      PROJECT_ID,
      "DEC-02",
      "Go-live date committed to the board",
      "The steering committee confirmed 2 March 2027 as the go-live date and communicated it to the group executive. Compliance raised a sequencing objection on the same day; the date was left standing as the planning assumption.",
      "Daniel Okafor, Head of Retail Product",
      "2026-08-11",
    );

    auditSeq += 1;
    insertAudit.run(
      `aud_${auditSeq}`,
      PROJECT_ID,
      "project",
      PROJECT_ID,
      "analysed",
      `Ingested ${documents.length} documents, extracted ${requirementRows.length} requirements and ${constraintSeq} constraints, detected ${conflicts.length} conflicts, ${ambiguitySeq} quality findings and ${gaps.length} coverage gaps.`,
      ANALYST,
      "ai",
      tick(),
    );

    setMeta("seeded_at", new Date().toISOString());
    setMeta("schema_version", "1");
    setMeta("demo_project_id", PROJECT_ID);
  });
}

/** Minimal CSV row split. The register has no quoted commas; this asserts that. */
function splitCsvRow(row: string): string[] {
  if (row.includes('"')) {
    throw new Error("Quoted CSV fields are not supported by the demo stakeholder register parser");
  }
  return row.split(",").map((cell) => cell.trim());
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}

function firstLine(text: string): string {
  return text.split("\n")[0] ?? text;
}

export { PROJECT_ID as DEMO_PROJECT_ID };
