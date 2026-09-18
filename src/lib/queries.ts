import "server-only";

import { getDb } from "./db";
import type { ProjectContext } from "./ai/provider";
import type { BindsOn } from "./ai/engine/binds-on";
import type {
  Ambiguity,
  AmbiguityKind,
  AuditEvent,
  Conflict,
  ConflictKind,
  ConflictStatus,
  Constraint,
  CoverageGap,
  Decision,
  DocumentChunk,
  DocumentKind,
  Evidence,
  Priority,
  Project,
  Provenance,
  Relationship,
  RelationshipKind,
  Requirement,
  RequirementType,
  Review,
  ReviewStatus,
  Risk,
  RiskCategory,
  Severity,
  SourceDocument,
  Stakeholder,
} from "./types";

/**
 * Read model.
 *
 * Every screen reads through this module. Rows come back from SQLite in
 * snake_case; the mappers below are the single place that knows that, so the
 * rest of the application only ever sees the domain types.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const bool = (v: unknown): boolean => num(v) === 1;

function mapProject(row: Row): Project {
  return {
    id: str(row.id),
    key: str(row.key),
    name: str(row.name),
    client: str(row.client),
    description: str(row.description),
    phase: str(row.phase),
    baselineDate: str(row.baseline_date),
    createdAt: str(row.created_at),
  };
}

function mapStakeholder(row: Row): Stakeholder {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    name: str(row.name),
    role: str(row.role),
    org: str(row.org),
    team: str(row.team),
    email: str(row.email),
    influence: str(row.influence) as Stakeholder["influence"],
  };
}

function mapDocument(row: Row): SourceDocument {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    title: str(row.title),
    kind: str(row.kind) as DocumentKind,
    filename: str(row.filename),
    author: strOrNull(row.author),
    capturedAt: str(row.captured_at),
    status: str(row.status) as SourceDocument["status"],
    wordCount: num(row.word_count),
    content: str(row.content),
    uploadedAt: str(row.uploaded_at),
    userUploaded: bool(row.user_uploaded),
  };
}

function mapRequirement(row: Row): Requirement {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    ref: str(row.ref),
    statement: str(row.statement),
    originalStatement: str(row.original_statement),
    type: str(row.type) as RequirementType,
    priority: str(row.priority) as Priority,
    status: str(row.status) as ReviewStatus,
    provenance: str(row.provenance) as Provenance,
    confidence: num(row.confidence),
    rationale: str(row.rationale),
    classificationEvidence: str(row.classification_evidence),
    ownerStakeholderId: strOrNull(row.owner_stakeholder_id),
    acceptanceCriteria: strOrNull(row.acceptance_criteria),
    postBaseline: bool(row.post_baseline),
    qualityScore: num(row.quality_score),
    bindsOn: str(row.binds_on) as BindsOn,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function mapConstraint(row: Row): Constraint {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    ref: str(row.ref),
    statement: str(row.statement),
    category: str(row.category) as Constraint["category"],
    value: row.value == null ? null : num(row.value),
    unit: strOrNull(row.unit),
    ownerStakeholderId: strOrNull(row.owner_stakeholder_id),
    provenance: str(row.provenance) as Provenance,
    createdAt: str(row.created_at),
  };
}

function mapConflict(row: Row): Conflict {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    ref: str(row.ref),
    title: str(row.title),
    kind: str(row.kind) as ConflictKind,
    severity: str(row.severity) as Severity,
    status: str(row.status) as ConflictStatus,
    detector: str(row.detector),
    explanation: str(row.explanation),
    validationQuestion: str(row.validation_question),
    leftType: str(row.left_type) as Conflict["leftType"],
    leftId: str(row.left_id),
    rightType: str(row.right_type) as Conflict["rightType"],
    rightId: str(row.right_id),
    confidence: num(row.confidence),
    impactedTeams: str(row.impacted_teams),
    resolutionNote: strOrNull(row.resolution_note),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function mapAmbiguity(row: Row): Ambiguity {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    requirementId: str(row.requirement_id),
    kind: str(row.kind) as AmbiguityKind,
    severity: str(row.severity) as Severity,
    span: str(row.span),
    spanStart: num(row.span_start),
    spanEnd: num(row.span_end),
    explanation: str(row.explanation),
    suggestion: str(row.suggestion),
    resolved: bool(row.resolved),
    createdAt: str(row.created_at),
  };
}

function mapRisk(row: Row): Risk {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    ref: str(row.ref),
    category: str(row.category) as RiskCategory,
    title: str(row.title),
    description: str(row.description),
    severity: str(row.severity) as Severity,
    likelihood: str(row.likelihood) as Risk["likelihood"],
    mitigation: str(row.mitigation),
    status: str(row.status) as Risk["status"],
    requirementId: strOrNull(row.requirement_id),
    conflictId: strOrNull(row.conflict_id),
    provenance: str(row.provenance) as Provenance,
    createdAt: str(row.created_at),
  };
}

function mapEvidence(row: Row): Evidence {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    subjectType: str(row.subject_type) as Evidence["subjectType"],
    subjectId: str(row.subject_id),
    documentId: str(row.document_id),
    chunkId: strOrNull(row.chunk_id),
    quote: str(row.quote),
    locator: str(row.locator),
    startOffset: num(row.start_offset),
    endOffset: num(row.end_offset),
    stakeholderId: strOrNull(row.stakeholder_id),
  };
}

function mapRelationship(row: Row): Relationship {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    sourceType: str(row.source_type) as Relationship["sourceType"],
    sourceId: str(row.source_id),
    targetType: str(row.target_type) as Relationship["targetType"],
    targetId: str(row.target_id),
    kind: str(row.kind) as RelationshipKind,
    rationale: str(row.rationale),
    strength: num(row.strength),
    provenance: str(row.provenance) as Provenance,
  };
}

function mapAudit(row: Row): AuditEvent {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    subjectType: str(row.subject_type),
    subjectId: str(row.subject_id),
    action: str(row.action),
    detail: str(row.detail),
    actor: str(row.actor),
    actorKind: str(row.actor_kind) as AuditEvent["actorKind"],
    createdAt: str(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function listProjects(): Project[] {
  return (getDb().prepare("SELECT * FROM projects ORDER BY created_at").all() as Row[]).map(mapProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
  return row ? mapProject(row) : null;
}

export interface ProjectHealth {
  /** 0-100. Derived from the four deductions below, never from a hidden model. */
  score: number;
  band: "healthy" | "watch" | "at_risk" | "critical";
  deductions: Array<{ label: string; points: number; detail: string }>;
}

export interface ProjectSummary {
  project: Project;
  requirements: number;
  approved: number;
  awaitingReview: number;
  rejected: number;
  openConflicts: number;
  criticalConflicts: number;
  openAmbiguities: number;
  highAmbiguities: number;
  missingAcceptance: number;
  unowned: number;
  openRisks: number;
  highRisks: number;
  coverageGaps: number;
  postBaseline: number;
  documents: number;
  words: number;
  stakeholders: number;
  health: ProjectHealth;
}

/**
 * The dashboard read.
 *
 * Health is a transparent deduction from a perfect score, and each deduction is
 * returned with the count that caused it. A number a partner cannot explain to
 * a client is a number that does not belong on a status report.
 */
export function getProjectSummary(projectId: string): ProjectSummary | null {
  const project = getProject(projectId);
  if (!project) return null;
  const db = getDb();

  const one = (sql: string, ...params: Array<string | number>): number => {
    const row = db.prepare(sql).get(projectId, ...params) as { n: number } | undefined;
    return row ? num(row.n) : 0;
  };

  const requirements = one("SELECT COUNT(*) AS n FROM requirements WHERE project_id = ?");
  const approved = one("SELECT COUNT(*) AS n FROM requirements WHERE project_id = ? AND status = 'approved'");
  const rejected = one("SELECT COUNT(*) AS n FROM requirements WHERE project_id = ? AND status = 'rejected'");
  const awaitingReview = one(
    "SELECT COUNT(*) AS n FROM requirements WHERE project_id = ? AND status IN ('proposed','in_review')",
  );
  const openConflicts = one(
    "SELECT COUNT(*) AS n FROM conflicts WHERE project_id = ? AND status IN ('open','needs_clarification')",
  );
  const criticalConflicts = one(
    "SELECT COUNT(*) AS n FROM conflicts WHERE project_id = ? AND status IN ('open','needs_clarification') AND severity IN ('high','critical')",
  );
  const openAmbiguities = one("SELECT COUNT(*) AS n FROM ambiguities WHERE project_id = ? AND resolved = 0");
  const highAmbiguities = one(
    "SELECT COUNT(*) AS n FROM ambiguities WHERE project_id = ? AND resolved = 0 AND severity IN ('high','critical')",
  );
  const missingAcceptance = one(
    "SELECT COUNT(*) AS n FROM requirements WHERE project_id = ? AND priority = 'must' AND acceptance_criteria IS NULL AND status != 'rejected'",
  );
  const unowned = one(
    "SELECT COUNT(*) AS n FROM requirements WHERE project_id = ? AND owner_stakeholder_id IS NULL AND status != 'rejected'",
  );
  const openRisks = one("SELECT COUNT(*) AS n FROM risks WHERE project_id = ? AND status = 'open'");
  const highRisks = one(
    "SELECT COUNT(*) AS n FROM risks WHERE project_id = ? AND status = 'open' AND severity IN ('high','critical')",
  );
  const coverageGaps = one("SELECT COUNT(*) AS n FROM coverage_gaps WHERE project_id = ? AND status = 'open'");
  const postBaseline = one("SELECT COUNT(*) AS n FROM requirements WHERE project_id = ? AND post_baseline = 1");
  const documents = one("SELECT COUNT(*) AS n FROM documents WHERE project_id = ?");
  const stakeholders = one("SELECT COUNT(*) AS n FROM stakeholders WHERE project_id = ?");
  const words = one("SELECT COALESCE(SUM(word_count), 0) AS n FROM documents WHERE project_id = ?");

  const active = Math.max(1, requirements - rejected);
  const requirementsInConflict = one(
    `SELECT COUNT(DISTINCT id) AS n FROM requirements
     WHERE project_id = ? AND id IN (
       SELECT left_id FROM conflicts WHERE project_id = ? AND status IN ('open','needs_clarification')
       UNION SELECT right_id FROM conflicts WHERE project_id = ? AND status IN ('open','needs_clarification')
     )`,
    projectId,
    projectId,
  );

  // Each deduction is a proportion of the register, not a saturating counter.
  // That matters twice over: the score stays explainable to a client ("a fifth
  // of your binding requirements have no test"), and it moves visibly when a
  // reviewer resolves something, which a capped counter would not.
  const share = (numerator: number, denominator: number): number =>
    denominator <= 0 ? 0 : Math.min(1, numerator / denominator);

  const conflictWeight = criticalConflicts * 2 + (openConflicts - criticalConflicts);
  const deductions = [
    {
      label: "Unresolved conflicts",
      points: Math.round(30 * share(conflictWeight, 12)),
      detail: openConflicts
        ? `${openConflicts} open, ${criticalConflicts} at high or critical severity, touching ${requirementsInConflict} requirement${requirementsInConflict === 1 ? "" : "s"}. Each is a decision the build team will otherwise make by default.`
        : "No open conflicts.",
    },
    {
      label: "Requirements without acceptance criteria",
      points: Math.round(25 * share(missingAcceptance, active)),
      detail: `${missingAcceptance} of ${active} active requirements are binding but have no stated test.`,
    },
    {
      label: "Unresolved quality findings",
      points: Math.round(25 * share(highAmbiguities, active)),
      detail: `${highAmbiguities} high-severity findings across the register, from ${openAmbiguities} findings in total.`,
    },
    {
      label: "Governance gaps",
      points: Math.round(20 * share(unowned + postBaseline + coverageGaps, active)),
      detail: `${unowned} requirements without an owner, ${postBaseline} added after the scope baseline, ${coverageGaps} unspecified topics.`,
    },
  ];

  const score = Math.max(0, 100 - deductions.reduce((total, d) => total + d.points, 0));
  const band: ProjectHealth["band"] =
    score >= 80 ? "healthy" : score >= 60 ? "watch" : score >= 35 ? "at_risk" : "critical";

  return {
    project,
    requirements,
    approved,
    awaitingReview,
    rejected,
    openConflicts,
    criticalConflicts,
    openAmbiguities,
    highAmbiguities,
    missingAcceptance,
    unowned,
    openRisks,
    highRisks,
    coverageGaps,
    postBaseline,
    documents,
    words,
    stakeholders,
    health: { score, band, deductions },
  };
}

// ---------------------------------------------------------------------------
// Stakeholders, documents
// ---------------------------------------------------------------------------

export function listStakeholders(projectId: string): Stakeholder[] {
  return (
    getDb().prepare("SELECT * FROM stakeholders WHERE project_id = ? ORDER BY team, name").all(projectId) as Row[]
  ).map(mapStakeholder);
}

export function listDocuments(projectId: string): SourceDocument[] {
  return (
    getDb()
      .prepare("SELECT * FROM documents WHERE project_id = ? ORDER BY captured_at, title")
      .all(projectId) as Row[]
  ).map(mapDocument);
}

export function getDocument(id: string): SourceDocument | null {
  const row = getDb().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined;
  return row ? mapDocument(row) : null;
}

export function listChunks(documentId: string): DocumentChunk[] {
  return (
    getDb().prepare("SELECT * FROM document_chunks WHERE document_id = ? ORDER BY ordinal").all(documentId) as Row[]
  ).map((row) => ({
    id: str(row.id),
    documentId: str(row.document_id),
    projectId: str(row.project_id),
    ordinal: num(row.ordinal),
    locator: str(row.locator),
    text: str(row.text),
    startOffset: num(row.start_offset),
    endOffset: num(row.end_offset),
  }));
}

/** Requirements and constraints extracted from one document, for the doc view. */
export function listExtractedFromDocument(documentId: string): {
  requirements: Requirement[];
  constraints: Constraint[];
} {
  const db = getDb();
  const requirements = (
    db
      .prepare(
        `SELECT r.* FROM requirements r
         JOIN evidence e ON e.subject_id = r.id AND e.subject_type = 'requirement'
         WHERE e.document_id = ? GROUP BY r.id ORDER BY r.ref`,
      )
      .all(documentId) as Row[]
  ).map(mapRequirement);

  const constraints = (
    db
      .prepare(
        `SELECT c.* FROM constraints_tbl c
         JOIN evidence e ON e.subject_id = c.id AND e.subject_type = 'constraint'
         WHERE e.document_id = ? GROUP BY c.id ORDER BY c.ref`,
      )
      .all(documentId) as Row[]
  ).map(mapConstraint);

  return { requirements, constraints };
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface RequirementFilters {
  type?: RequirementType;
  status?: ReviewStatus;
  priority?: Priority;
  search?: string;
  /** Only requirements introduced after the scope baseline. */
  postBaseline?: boolean;
  /** Only requirements with at least one unresolved quality finding. */
  hasFindings?: boolean;
  /** Only requirements with no named owner. */
  unowned?: boolean;
}

export function listRequirements(projectId: string, filters: RequirementFilters = {}): Requirement[] {
  const clauses = ["r.project_id = ?"];
  const params: Array<string | number> = [projectId];

  if (filters.type) {
    clauses.push("r.type = ?");
    params.push(filters.type);
  }
  if (filters.status) {
    clauses.push("r.status = ?");
    params.push(filters.status);
  }
  if (filters.priority) {
    clauses.push("r.priority = ?");
    params.push(filters.priority);
  }
  if (filters.postBaseline) clauses.push("r.post_baseline = 1");
  if (filters.unowned) clauses.push("r.owner_stakeholder_id IS NULL");
  if (filters.hasFindings) {
    clauses.push("EXISTS (SELECT 1 FROM ambiguities a WHERE a.requirement_id = r.id AND a.resolved = 0)");
  }
  if (filters.search?.trim()) {
    clauses.push("(LOWER(r.statement) LIKE ? OR LOWER(r.ref) LIKE ?)");
    const needle = `%${filters.search.trim().toLowerCase()}%`;
    params.push(needle, needle);
  }

  return (
    getDb()
      .prepare(`SELECT r.* FROM requirements r WHERE ${clauses.join(" AND ")} ORDER BY r.ref`)
      .all(...params) as Row[]
  ).map(mapRequirement);
}

export function getRequirement(id: string): Requirement | null {
  const row = getDb().prepare("SELECT * FROM requirements WHERE id = ?").get(id) as Row | undefined;
  return row ? mapRequirement(row) : null;
}

export interface EvidenceWithSource extends Evidence {
  documentTitle: string;
  documentKind: DocumentKind;
  capturedAt: string;
  stakeholderName: string | null;
  stakeholderRole: string | null;
}

export function listEvidence(subjectType: Evidence["subjectType"], subjectId: string): EvidenceWithSource[] {
  return (
    getDb()
      .prepare(
        `SELECT e.*, d.title AS document_title, d.kind AS document_kind, d.captured_at,
                s.name AS stakeholder_name, s.role AS stakeholder_role
         FROM evidence e
         JOIN documents d ON d.id = e.document_id
         LEFT JOIN stakeholders s ON s.id = e.stakeholder_id
         WHERE e.subject_type = ? AND e.subject_id = ?`,
      )
      .all(subjectType, subjectId) as Row[]
  ).map((row) => ({
    ...mapEvidence(row),
    documentTitle: str(row.document_title),
    documentKind: str(row.document_kind) as DocumentKind,
    capturedAt: str(row.captured_at),
    stakeholderName: strOrNull(row.stakeholder_name),
    stakeholderRole: strOrNull(row.stakeholder_role),
  }));
}

/** Every evidence row citing one document, for the document view. One query. */
export function listEvidenceForDocument(documentId: string): Evidence[] {
  return (
    getDb()
      .prepare("SELECT * FROM evidence WHERE document_id = ? ORDER BY start_offset")
      .all(documentId) as Row[]
  ).map(mapEvidence);
}

export interface RelatedRecord {
  id: string;
  ref: string;
  statement: string;
  type: "requirement" | "constraint";
  kind: RelationshipKind;
  rationale: string;
  strength: number;
  /** True when the edge points away from the requirement being viewed. */
  outgoing: boolean;
}

export function listRelated(projectId: string, subjectId: string): RelatedRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM relationships WHERE project_id = ? AND (source_id = ? OR target_id = ?)`,
    )
    .all(projectId, subjectId, subjectId) as Row[];

  const out: RelatedRecord[] = [];
  for (const row of rows.map(mapRelationship)) {
    const outgoing = row.sourceId === subjectId;
    const otherId = outgoing ? row.targetId : row.sourceId;
    const otherType = outgoing ? row.targetType : row.sourceType;
    const table = otherType === "constraint" ? "constraints_tbl" : "requirements";
    const record = db.prepare(`SELECT id, ref, statement FROM ${table} WHERE id = ?`).get(otherId) as Row | undefined;
    if (!record) continue;
    out.push({
      id: str(record.id),
      ref: str(record.ref),
      statement: str(record.statement),
      type: otherType,
      kind: row.kind,
      rationale: row.rationale,
      strength: row.strength,
      outgoing,
    });
  }
  return out.sort((a, b) => b.strength - a.strength);
}

export function listAmbiguities(requirementId: string): Ambiguity[] {
  return (
    getDb()
      .prepare("SELECT * FROM ambiguities WHERE requirement_id = ? ORDER BY severity DESC, span_start")
      .all(requirementId) as Row[]
  ).map(mapAmbiguity);
}

export function listProjectAmbiguities(projectId: string): Ambiguity[] {
  return (
    getDb().prepare("SELECT * FROM ambiguities WHERE project_id = ?").all(projectId) as Row[]
  ).map(mapAmbiguity);
}

export function listAuditTrail(subjectType: string, subjectId: string): AuditEvent[] {
  return (
    getDb()
      .prepare("SELECT * FROM audit_events WHERE subject_type = ? AND subject_id = ? ORDER BY created_at, rowid")
      .all(subjectType, subjectId) as Row[]
  ).map(mapAudit);
}

export function listProjectActivity(projectId: string, limit = 40): AuditEvent[] {
  return (
    getDb()
      .prepare("SELECT * FROM audit_events WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(projectId, limit) as Row[]
  ).map(mapAudit);
}

export function listReviews(requirementId: string): Review[] {
  return (
    getDb().prepare("SELECT * FROM reviews WHERE requirement_id = ? ORDER BY created_at").all(requirementId) as Row[]
  ).map((row) => ({
    id: str(row.id),
    projectId: str(row.project_id),
    requirementId: str(row.requirement_id),
    decision: str(row.decision) as Review["decision"],
    note: str(row.note),
    reviewer: str(row.reviewer),
    createdAt: str(row.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Constraints, conflicts, risks, gaps, decisions
// ---------------------------------------------------------------------------

export function listConstraints(projectId: string): Constraint[] {
  return (
    getDb().prepare("SELECT * FROM constraints_tbl WHERE project_id = ? ORDER BY ref").all(projectId) as Row[]
  ).map(mapConstraint);
}

export function getConstraint(id: string): Constraint | null {
  const row = getDb().prepare("SELECT * FROM constraints_tbl WHERE id = ?").get(id) as Row | undefined;
  return row ? mapConstraint(row) : null;
}

export function listConflicts(projectId: string, status?: ConflictStatus): Conflict[] {
  const db = getDb();
  const rows = status
    ? (db.prepare("SELECT * FROM conflicts WHERE project_id = ? AND status = ?").all(projectId, status) as Row[])
    : (db.prepare("SELECT * FROM conflicts WHERE project_id = ?").all(projectId) as Row[]);

  const rank: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  return rows.map(mapConflict).sort((a, b) => {
    // Open work first, then by severity: the list is a queue, not an archive.
    const aOpen = a.status === "open" || a.status === "needs_clarification" ? 1 : 0;
    const bOpen = b.status === "open" || b.status === "needs_clarification" ? 1 : 0;
    return bOpen - aOpen || rank[b.severity] - rank[a.severity] || a.ref.localeCompare(b.ref);
  });
}

export function getConflict(id: string): Conflict | null {
  const row = getDb().prepare("SELECT * FROM conflicts WHERE id = ?").get(id) as Row | undefined;
  return row ? mapConflict(row) : null;
}

/** Resolves either side of a conflict to the record it points at. */
export function getConflictSide(
  type: "requirement" | "constraint",
  id: string,
): { ref: string; statement: string; id: string; type: "requirement" | "constraint"; ownerStakeholderId: string | null } | null {
  const table = type === "constraint" ? "constraints_tbl" : "requirements";
  const row = getDb()
    .prepare(`SELECT id, ref, statement, owner_stakeholder_id FROM ${table} WHERE id = ?`)
    .get(id) as Row | undefined;
  if (!row) return null;
  return {
    id: str(row.id),
    ref: str(row.ref),
    statement: str(row.statement),
    type,
    ownerStakeholderId: strOrNull(row.owner_stakeholder_id),
  };
}

export function listConflictsForSubject(subjectId: string): Conflict[] {
  return (
    getDb()
      .prepare("SELECT * FROM conflicts WHERE left_id = ? OR right_id = ? ORDER BY severity DESC")
      .all(subjectId, subjectId) as Row[]
  ).map(mapConflict);
}

export function listRisks(projectId: string, category?: RiskCategory): Risk[] {
  const db = getDb();
  const rows = category
    ? (db.prepare("SELECT * FROM risks WHERE project_id = ? AND category = ?").all(projectId, category) as Row[])
    : (db.prepare("SELECT * FROM risks WHERE project_id = ?").all(projectId) as Row[]);

  const rank: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  return rows.map(mapRisk).sort((a, b) => {
    const aOpen = a.status === "open" ? 1 : 0;
    const bOpen = b.status === "open" ? 1 : 0;
    return bOpen - aOpen || rank[b.severity] - rank[a.severity] || a.ref.localeCompare(b.ref);
  });
}

export function listCoverageGaps(projectId: string): CoverageGap[] {
  const rank: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  return (getDb().prepare("SELECT * FROM coverage_gaps WHERE project_id = ?").all(projectId) as Row[])
    .map((row) => ({
      id: str(row.id),
      projectId: str(row.project_id),
      area: str(row.area),
      expectation: str(row.expectation),
      reason: str(row.reason),
      severity: str(row.severity) as Severity,
      status: str(row.status) as CoverageGap["status"],
      createdAt: str(row.created_at),
    }))
    .sort((a, b) => rank[b.severity] - rank[a.severity]);
}

export function listDecisions(projectId: string): Decision[] {
  return (
    getDb().prepare("SELECT * FROM decisions WHERE project_id = ? ORDER BY decided_at").all(projectId) as Row[]
  ).map((row) => ({
    id: str(row.id),
    projectId: str(row.project_id),
    ref: str(row.ref),
    title: str(row.title),
    detail: str(row.detail),
    decidedBy: str(row.decided_by),
    decidedAt: str(row.decided_at),
    requirementId: strOrNull(row.requirement_id),
    conflictId: strOrNull(row.conflict_id),
    provenance: str(row.provenance) as Provenance,
  }));
}

// ---------------------------------------------------------------------------
// Traceability and graph
// ---------------------------------------------------------------------------

export interface TraceRow {
  requirement: Requirement;
  owner: Stakeholder | null;
  evidence: EvidenceWithSource[];
  conflictRefs: string[];
  findingCount: number;
  relatedCount: number;
}

/** The traceability matrix: requirement to source to stakeholder to decision. */
export function getTraceability(projectId: string): TraceRow[] {
  const db = getDb();
  const requirements = listRequirements(projectId);
  const stakeholders = new Map(listStakeholders(projectId).map((s) => [s.id, s]));

  const findingCounts = new Map<string, number>();
  for (const row of db
    .prepare("SELECT requirement_id, COUNT(*) AS n FROM ambiguities WHERE project_id = ? AND resolved = 0 GROUP BY requirement_id")
    .all(projectId) as Row[]) {
    findingCounts.set(str(row.requirement_id), num(row.n));
  }

  const relatedCounts = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT id, (SELECT COUNT(*) FROM relationships rel WHERE rel.source_id = r.id OR rel.target_id = r.id) AS n
       FROM requirements r WHERE r.project_id = ?`,
    )
    .all(projectId) as Row[]) {
    relatedCounts.set(str(row.id), num(row.n));
  }

  const conflictRefs = new Map<string, string[]>();
  for (const conflict of listConflicts(projectId)) {
    for (const side of [conflict.leftId, conflict.rightId]) {
      conflictRefs.set(side, [...(conflictRefs.get(side) ?? []), conflict.ref]);
    }
  }

  return requirements.map((requirement) => ({
    requirement,
    owner: requirement.ownerStakeholderId ? stakeholders.get(requirement.ownerStakeholderId) ?? null : null,
    evidence: listEvidence("requirement", requirement.id),
    conflictRefs: conflictRefs.get(requirement.id) ?? [],
    findingCount: findingCounts.get(requirement.id) ?? 0,
    relatedCount: relatedCounts.get(requirement.id) ?? 0,
  }));
}

export interface GraphNode {
  id: string;
  ref: string;
  label: string;
  kind: "requirement" | "constraint" | "stakeholder" | "document" | "risk";
  group: string;
  /** Degree, used to size the node. */
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: RelationshipKind;
  rationale: string;
  strength: number;
}

/**
 * The requirement relationship graph.
 *
 * Only requirements and constraints that actually participate in an edge are
 * returned. A graph of disconnected dots is decoration; this one is a map of
 * where the register is entangled.
 */
export function getGraph(projectId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const db = getDb();
  const relationships = (
    db.prepare("SELECT * FROM relationships WHERE project_id = ?").all(projectId) as Row[]
  ).map(mapRelationship);

  const degree = new Map<string, number>();
  for (const rel of relationships) {
    degree.set(rel.sourceId, (degree.get(rel.sourceId) ?? 0) + 1);
    degree.set(rel.targetId, (degree.get(rel.targetId) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  const seen = new Set<string>();
  for (const [id, weight] of degree) {
    if (seen.has(id)) continue;
    seen.add(id);
    const requirement = db.prepare("SELECT id, ref, statement, type FROM requirements WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (requirement) {
      nodes.push({
        id,
        ref: str(requirement.ref),
        label: str(requirement.statement),
        kind: "requirement",
        group: str(requirement.type),
        weight,
      });
      continue;
    }
    const constraint = db.prepare("SELECT id, ref, statement, category FROM constraints_tbl WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (constraint) {
      nodes.push({
        id,
        ref: str(constraint.ref),
        label: str(constraint.statement),
        kind: "constraint",
        group: str(constraint.category),
        weight,
      });
    }
  }

  const edges: GraphEdge[] = relationships
    .filter((rel) => seen.has(rel.sourceId) && seen.has(rel.targetId))
    .map((rel) => ({
      source: rel.sourceId,
      target: rel.targetId,
      kind: rel.kind,
      rationale: rel.rationale,
      strength: rel.strength,
    }));

  return { nodes: nodes.sort((a, b) => b.weight - a.weight), edges };
}

// ---------------------------------------------------------------------------
// Scope change
// ---------------------------------------------------------------------------

export interface ScopeChange {
  requirement: Requirement;
  evidence: EvidenceWithSource | null;
  owner: Stakeholder | null;
  status: "added" | "changed";
}

/**
 * Scope movement against the agreed baseline.
 *
 * "Added" means the source document was captured after the baseline date.
 * "Changed" means a human has edited the statement since extraction. Both are
 * facts about records, not judgements.
 */
export function getScopeChanges(projectId: string): {
  baselineDate: string;
  baselineCount: number;
  added: ScopeChange[];
  changed: ScopeChange[];
} {
  const project = getProject(projectId);
  const stakeholders = new Map(listStakeholders(projectId).map((s) => [s.id, s]));
  const all = listRequirements(projectId);

  const decorate = (requirement: Requirement, status: "added" | "changed"): ScopeChange => ({
    requirement,
    evidence: listEvidence("requirement", requirement.id)[0] ?? null,
    owner: requirement.ownerStakeholderId ? stakeholders.get(requirement.ownerStakeholderId) ?? null : null,
    status,
  });

  return {
    baselineDate: project?.baselineDate ?? "",
    baselineCount: all.filter((r) => !r.postBaseline).length,
    added: all.filter((r) => r.postBaseline).map((r) => decorate(r, "added")),
    changed: all.filter((r) => r.statement !== r.originalStatement).map((r) => decorate(r, "changed")),
  };
}

// ---------------------------------------------------------------------------
// Assistant context
// ---------------------------------------------------------------------------

/** Assembles the complete, and only, view of the project the assistant may use. */
export function buildProjectContext(projectId: string): ProjectContext | null {
  const project = getProject(projectId);
  if (!project) return null;

  const requirements = listRequirements(projectId);
  const evidenceByRequirement = new Map<
    string,
    Array<{ quote: string; locator: string; documentTitle: string; documentId: string }>
  >();

  for (const row of getDb()
    .prepare(
      `SELECT e.subject_id, e.quote, e.locator, e.document_id, d.title
       FROM evidence e JOIN documents d ON d.id = e.document_id
       WHERE e.project_id = ? AND e.subject_type = 'requirement'`,
    )
    .all(projectId) as Row[]) {
    const key = str(row.subject_id);
    evidenceByRequirement.set(key, [
      ...(evidenceByRequirement.get(key) ?? []),
      {
        quote: str(row.quote),
        locator: str(row.locator),
        documentTitle: str(row.title),
        documentId: str(row.document_id),
      },
    ]);
  }

  return {
    projectId,
    projectName: project.name,
    baselineDate: project.baselineDate,
    requirements,
    constraints: listConstraints(projectId),
    conflicts: listConflicts(projectId),
    risks: listRisks(projectId),
    ambiguities: listProjectAmbiguities(projectId),
    stakeholders: listStakeholders(projectId),
    documents: listDocuments(projectId).map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind,
      capturedAt: d.capturedAt,
    })),
    evidenceByRequirement,
    gaps: listCoverageGaps(projectId)
      .filter((g) => g.status === "open")
      .map((g) => ({ area: g.area, expectation: g.expectation, reason: g.reason })),
  };
}
