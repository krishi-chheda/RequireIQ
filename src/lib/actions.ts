import "server-only";

import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db";
import { analyseAmbiguity, qualityScore } from "./ai/engine/ambiguity";
import { describeStatement } from "./ai/engine/extract";
import type { ConflictStatus, ReviewStatus } from "./types";

/**
 * Write model.
 *
 * Two invariants hold across every function here:
 *
 *  1. Nothing the analysis engine produced is mutated in place without an audit
 *     event recording who changed it and what it said before.
 *  2. A human action always moves provenance to `human`. The register's
 *     authority comes from a person having looked at it, not from the model
 *     having been confident.
 */

const now = (): string => new Date().toISOString();

function writeAudit(
  projectId: string,
  subjectType: string,
  subjectId: string,
  action: string,
  detail: string,
  actor: string,
  actorKind: "ai" | "human" | "system" = "human",
): void {
  getDb()
    .prepare(
      `INSERT INTO audit_events (id, project_id, subject_type, subject_id, action, detail, actor, actor_kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(`aud_${randomUUID()}`, projectId, subjectType, subjectId, action, detail, actor, actorKind, now());
}

export type ReviewDecision = "approved" | "rejected" | "needs_clarification";

const DECISION_STATUS: Record<ReviewDecision, ReviewStatus> = {
  approved: "approved",
  rejected: "rejected",
  needs_clarification: "needs_clarification",
};

/** Records a human review decision against a requirement. */
export function recordReview(
  requirementId: string,
  decision: ReviewDecision,
  note: string,
  reviewer: string,
): void {
  const db = getDb();
  const row = db.prepare("SELECT project_id, ref FROM requirements WHERE id = ?").get(requirementId) as
    | { project_id: string; ref: string }
    | undefined;
  if (!row) throw new Error(`Requirement ${requirementId} not found`);

  transaction(() => {
    db.prepare("UPDATE requirements SET status = ?, provenance = 'human', updated_at = ? WHERE id = ?").run(
      DECISION_STATUS[decision],
      now(),
      requirementId,
    );
    db.prepare(
      `INSERT INTO reviews (id, project_id, requirement_id, decision, note, reviewer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(`rev_${randomUUID()}`, row.project_id, requirementId, decision, note, reviewer, now());

    writeAudit(
      row.project_id,
      "requirement",
      requirementId,
      decision,
      note || `${row.ref} marked ${decision.replace(/_/g, " ")} with no note.`,
      reviewer,
    );
  });
}

/**
 * Applies a human edit to a requirement statement.
 *
 * The original is preserved, quality analysis is re-run against the new wording
 * (so a fix visibly clears its own findings), and the change is audited. The
 * requirement does not become approved by being edited - that stays a separate,
 * explicit decision.
 */
export function editRequirement(requirementId: string, statement: string, reviewer: string): void {
  const trimmed = statement.trim();
  if (trimmed.length < 10) throw new Error("A requirement statement must be at least 10 characters");
  if (trimmed.length > 1000) throw new Error("A requirement statement must be under 1000 characters");

  const db = getDb();
  const row = db
    .prepare(
      `SELECT project_id, ref, statement, type, priority, rationale, classification_evidence,
              binds_on, binds_on_evidence, acceptance_criteria
         FROM requirements WHERE id = ?`,
    )
    .get(requirementId) as
    | {
        project_id: string;
        ref: string;
        statement: string;
        type: string;
        priority: string;
        rationale: string;
        classification_evidence: string;
        binds_on: string | null;
        binds_on_evidence: string | null;
        acceptance_criteria: string | null;
      }
    | undefined;
  if (!row) throw new Error(`Requirement ${requirementId} not found`);
  if (row.statement === trimmed) return;

  const findings = analyseAmbiguity(trimmed);
  // Every stored field that quotes the statement is re-derived from the new
  // text in the same UPDATE. A field left behind here does not merely age: it
  // quotes words that are no longer on the page, next to the text that
  // disproves it. `acceptance_criteria` has no per-field provenance column, but
  // `deriveAcceptanceCriteria` only ever returns the statement verbatim or
  // null - so a copy of the OLD statement is a derived one and is refreshed,
  // and anything else was typed by a reviewer and is left alone.
  const described = describeStatement(trimmed);
  const acceptanceCriteria =
    row.acceptance_criteria === row.statement ? described.acceptanceCriteria : row.acceptance_criteria;

  // The module invariant (see the header) is that nothing the engine produced
  // changes without an audit event saying what it said before. Re-derivation
  // moves `priority` and `type`, which move project counts, so every derived
  // field that actually changed is named in the audit detail.
  const derivedChanges = (
    [
      ["Priority", row.priority, described.priority],
      ["Type", row.type, described.type],
      ["Binds on", row.binds_on, described.bindsOn],
      ["Acceptance criteria", row.acceptance_criteria, acceptanceCriteria],
      ["Rationale", row.rationale, described.rationale],
      ["Classification evidence", row.classification_evidence, described.classificationEvidence],
      ["Binds-on evidence", row.binds_on_evidence, described.bindsOnEvidence],
    ] as ReadonlyArray<readonly [string, string | null, string | null]>
  )
    .filter(([, before, after]) => before !== after)
    .map(
      ([label, before, after]) =>
        `${label} "${truncate(before ?? "none", 120)}" to "${truncate(after ?? "none", 120)}"`,
    );

  transaction(() => {
    db.prepare(
      `UPDATE requirements SET statement = ?, type = ?, priority = ?, rationale = ?, classification_evidence = ?,
         binds_on = ?, binds_on_evidence = ?, acceptance_criteria = ?, quality_score = ?,
         provenance = 'human', status = 'in_review', updated_at = ?
       WHERE id = ?`,
    ).run(
      trimmed,
      described.type,
      described.priority,
      described.rationale,
      described.classificationEvidence,
      described.bindsOn,
      described.bindsOnEvidence,
      acceptanceCriteria,
      qualityScore(findings),
      now(),
      requirementId,
    );

    // Old findings referred to spans in the old text, so they are replaced
    // wholesale rather than merged. Re-analysis is what makes a rewrite
    // visibly close its own findings in the UI.
    db.prepare("DELETE FROM ambiguities WHERE requirement_id = ?").run(requirementId);
    const insert = db.prepare(
      `INSERT INTO ambiguities (id, project_id, requirement_id, kind, severity, span, span_start, span_end, explanation, suggestion, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    );
    for (const finding of findings) {
      insert.run(
        `amb_${randomUUID()}`,
        row.project_id,
        requirementId,
        finding.kind,
        finding.severity,
        finding.span,
        finding.spanStart,
        finding.spanEnd,
        finding.explanation,
        finding.suggestion,
        now(),
      );
    }

    db.prepare(
      `INSERT INTO reviews (id, project_id, requirement_id, decision, note, reviewer, created_at)
       VALUES (?, ?, ?, 'edited', ?, ?, ?)`,
    ).run(
      `rev_${randomUUID()}`,
      row.project_id,
      requirementId,
      `Statement rewritten. Quality findings re-run: ${findings.length} remaining.`,
      reviewer,
      now(),
    );

    writeAudit(
      row.project_id,
      "requirement",
      requirementId,
      "edited",
      `Statement changed from "${truncate(row.statement, 120)}" to "${truncate(trimmed, 120)}". Re-analysis left ${findings.length} quality finding${findings.length === 1 ? "" : "s"}.${
        derivedChanges.length ? ` Re-derived from the new wording: ${derivedChanges.join("; ")}.` : ""
      }`,
      reviewer,
    );
  });
}

/** Assigns or clears the named business owner of a requirement. */
export function assignOwner(requirementId: string, stakeholderId: string | null, reviewer: string): void {
  const db = getDb();
  const row = db.prepare("SELECT project_id, ref FROM requirements WHERE id = ?").get(requirementId) as
    | { project_id: string; ref: string }
    | undefined;
  if (!row) throw new Error(`Requirement ${requirementId} not found`);

  let ownerName = "nobody";
  if (stakeholderId) {
    const person = db.prepare("SELECT name, role FROM stakeholders WHERE id = ?").get(stakeholderId) as
      | { name: string; role: string }
      | undefined;
    if (!person) throw new Error(`Stakeholder ${stakeholderId} not found`);
    ownerName = `${person.name} (${person.role})`;
  }

  transaction(() => {
    db.prepare("UPDATE requirements SET owner_stakeholder_id = ?, updated_at = ? WHERE id = ?").run(
      stakeholderId,
      now(),
      requirementId,
    );
    writeAudit(row.project_id, "requirement", requirementId, "owner_assigned", `Business owner set to ${ownerName}.`, reviewer);
  });
}

/** Records the acceptance criteria a reviewer agreed with the business owner. */
export function setAcceptanceCriteria(requirementId: string, criteria: string, reviewer: string): void {
  const trimmed = criteria.trim();
  if (trimmed.length > 2000) throw new Error("Acceptance criteria must be under 2000 characters");

  const db = getDb();
  const row = db.prepare("SELECT project_id FROM requirements WHERE id = ?").get(requirementId) as
    | { project_id: string }
    | undefined;
  if (!row) throw new Error(`Requirement ${requirementId} not found`);

  transaction(() => {
    db.prepare("UPDATE requirements SET acceptance_criteria = ?, updated_at = ? WHERE id = ?").run(
      trimmed || null,
      now(),
      requirementId,
    );
    // Resolving the acceptance-criteria finding is the point of the action, so
    // it happens here rather than waiting for a re-analysis pass.
    db.prepare(
      "UPDATE ambiguities SET resolved = 1 WHERE requirement_id = ? AND kind = 'missing_acceptance_criteria'",
    ).run(requirementId);
    writeAudit(
      row.project_id,
      "requirement",
      requirementId,
      trimmed ? "acceptance_criteria_set" : "acceptance_criteria_cleared",
      trimmed ? `Acceptance criteria recorded: "${truncate(trimmed, 200)}"` : "Acceptance criteria cleared.",
      reviewer,
    );
  });
}

/** Marks a single quality finding as resolved without changing the statement. */
export function resolveAmbiguity(ambiguityId: string, reviewer: string): void {
  const db = getDb();
  const row = db
    .prepare("SELECT project_id, requirement_id, kind, span FROM ambiguities WHERE id = ?")
    .get(ambiguityId) as { project_id: string; requirement_id: string; kind: string; span: string } | undefined;
  if (!row) throw new Error(`Finding ${ambiguityId} not found`);

  transaction(() => {
    db.prepare("UPDATE ambiguities SET resolved = 1 WHERE id = ?").run(ambiguityId);
    writeAudit(
      row.project_id,
      "requirement",
      row.requirement_id,
      "finding_resolved",
      `Quality finding (${row.kind.replace(/_/g, " ")}) on "${truncate(row.span, 80)}" marked resolved without a wording change.`,
      reviewer,
    );
  });
}

export type ConflictAction = "accepted" | "dismissed" | "needs_clarification" | "resolved";

/**
 * Records the outcome of a human investigation into a conflict.
 *
 * Any terminal outcome also closes the risk the conflict generated, so the risk
 * register and the conflict queue cannot drift apart.
 */
export function resolveConflict(
  conflictId: string,
  action: ConflictAction,
  note: string,
  reviewer: string,
): void {
  const db = getDb();
  const row = db.prepare("SELECT project_id, ref, title FROM conflicts WHERE id = ?").get(conflictId) as
    | { project_id: string; ref: string; title: string }
    | undefined;
  if (!row) throw new Error(`Conflict ${conflictId} not found`);

  const status: ConflictStatus = action;

  transaction(() => {
    db.prepare("UPDATE conflicts SET status = ?, resolution_note = ?, updated_at = ? WHERE id = ?").run(
      status,
      note || null,
      now(),
      conflictId,
    );

    if (action === "dismissed" || action === "resolved") {
      db.prepare("UPDATE risks SET status = 'mitigated' WHERE conflict_id = ?").run(conflictId);
    } else if (action === "accepted") {
      db.prepare("UPDATE risks SET status = 'accepted' WHERE conflict_id = ?").run(conflictId);
    }

    writeAudit(
      row.project_id,
      "conflict",
      conflictId,
      action,
      note || `${row.ref} marked ${action.replace(/_/g, " ")} with no note.`,
      reviewer,
    );
  });
}

/** Creates a decision record, optionally linked to the conflict that prompted it. */
export function recordDecision(
  projectId: string,
  title: string,
  detail: string,
  decidedBy: string,
  conflictId: string | null,
  requirementId: string | null,
): void {
  if (!title.trim()) throw new Error("A decision needs a title");

  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE project_id = ?").get(projectId) as { n: number };
  const ref = `DEC-${String(Number(count.n) + 1).padStart(2, "0")}`;

  transaction(() => {
    db.prepare(
      `INSERT INTO decisions (id, project_id, ref, title, detail, decided_by, decided_at, requirement_id, conflict_id, provenance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'human')`,
    ).run(`dec_${randomUUID()}`, projectId, ref, title.trim(), detail.trim(), decidedBy, now(), requirementId, conflictId);

    writeAudit(
      projectId,
      conflictId ? "conflict" : "project",
      conflictId ?? projectId,
      "decision_recorded",
      `${ref}: ${title.trim()}`,
      decidedBy,
    );
  });
}

/** Updates the status of a risk. */
export function setRiskStatus(riskId: string, status: "open" | "mitigated" | "accepted", reviewer: string): void {
  const db = getDb();
  const row = db.prepare("SELECT project_id, ref FROM risks WHERE id = ?").get(riskId) as
    | { project_id: string; ref: string }
    | undefined;
  if (!row) throw new Error(`Risk ${riskId} not found`);

  transaction(() => {
    db.prepare("UPDATE risks SET status = ? WHERE id = ?").run(status, riskId);
    writeAudit(row.project_id, "risk", riskId, `risk_${status}`, `${row.ref} marked ${status}.`, reviewer);
  });
}

/** Updates the status of a coverage gap. */
export function setGapStatus(
  gapId: string,
  status: "open" | "addressed" | "dismissed",
  reviewer: string,
): void {
  const db = getDb();
  const row = db.prepare("SELECT project_id, area FROM coverage_gaps WHERE id = ?").get(gapId) as
    | { project_id: string; area: string }
    | undefined;
  if (!row) throw new Error(`Gap ${gapId} not found`);

  transaction(() => {
    db.prepare("UPDATE coverage_gaps SET status = ? WHERE id = ?").run(status, gapId);
    writeAudit(row.project_id, "coverage_gap", gapId, `gap_${status}`, `"${row.area}" marked ${status}.`, reviewer);
  });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}
