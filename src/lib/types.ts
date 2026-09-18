/**
 * RequireIQ domain model.
 *
 * Provenance is a first-class concept: every record that did not come verbatim
 * from a source document is labelled, so the UI can never present an inference
 * as a fact. See `Provenance` below.
 */

import type { BindsOn } from "./ai/engine/binds-on";

/** How a piece of information came to exist. Rendered explicitly in the UI. */
export type Provenance =
  /** Verbatim text present in an ingested source document. */
  | "source"
  /** A machine reading of source text. Traceable to evidence, not authoritative. */
  | "ai_analysis"
  /** A proposed improvement. Never applied without a human action. */
  | "ai_suggestion"
  /** Entered or confirmed by a named person. */
  | "human";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  source: "Source evidence",
  ai_analysis: "AI analysis",
  ai_suggestion: "AI suggestion",
  human: "Human authored",
};

export type RequirementType =
  | "functional"
  | "non_functional"
  | "business"
  | "technical"
  | "security"
  | "compliance"
  | "performance"
  | "operational"
  | "ux";

export const REQUIREMENT_TYPES: RequirementType[] = [
  "functional",
  "non_functional",
  "business",
  "technical",
  "security",
  "compliance",
  "performance",
  "operational",
  "ux",
];

export const REQUIREMENT_TYPE_LABEL: Record<RequirementType, string> = {
  functional: "Functional",
  non_functional: "Non-functional",
  business: "Business",
  technical: "Technical",
  security: "Security",
  compliance: "Compliance",
  performance: "Performance",
  operational: "Operational",
  ux: "UX",
};

/** MoSCoW prioritisation - the standard used on the demo engagement. */
export type Priority = "must" | "should" | "could" | "wont";

export const PRIORITY_LABEL: Record<Priority, string> = {
  must: "Must have",
  should: "Should have",
  could: "Could have",
  wont: "Will not have",
};

/** Human-in-the-loop lifecycle. AI output starts at `proposed` and stays there. */
export type ReviewStatus =
  | "proposed"
  | "in_review"
  | "needs_clarification"
  | "approved"
  | "rejected";

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  proposed: "AI proposed",
  in_review: "In review",
  needs_clarification: "Needs clarification",
  approved: "Approved",
  rejected: "Rejected",
};

export type Severity = "low" | "medium" | "high" | "critical";
export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export type { BindsOn };
export { BINDS_ON_LABEL } from "./ai/engine/binds-on";

export type DocumentKind =
  | "transcript"
  | "meeting_notes"
  | "email"
  | "specification"
  | "policy"
  | "csv"
  | "other";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  transcript: "Workshop transcript",
  meeting_notes: "Meeting notes",
  email: "Email thread",
  specification: "Specification",
  policy: "Policy document",
  csv: "Tabular data",
  other: "Document",
};

export type DocumentStatus = "uploaded" | "extracting" | "analysed" | "failed";

export interface Project {
  id: string;
  key: string;
  name: string;
  client: string;
  description: string;
  phase: string;
  baselineDate: string;
  createdAt: string;
}

export interface Stakeholder {
  id: string;
  projectId: string;
  name: string;
  role: string;
  org: string;
  team: string;
  email: string;
  influence: "low" | "medium" | "high";
}

export interface SourceDocument {
  id: string;
  projectId: string;
  title: string;
  kind: DocumentKind;
  filename: string;
  author: string | null;
  capturedAt: string;
  status: DocumentStatus;
  wordCount: number;
  content: string;
  uploadedAt: string;
  /** True for documents the user added at runtime rather than seeded demo data. */
  userUploaded: boolean;
}

/**
 * A contiguous slice of a document. Chunks are the unit of retrieval and the
 * anchor for every evidence citation, which is what makes provenance exact.
 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  projectId: string;
  ordinal: number;
  /** Section heading or speaker turn this chunk sits under. Used in citations. */
  locator: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface Requirement {
  id: string;
  projectId: string;
  ref: string;
  statement: string;
  /** The untouched source sentence. Diverges from `statement` once a human edits. */
  originalStatement: string;
  type: RequirementType;
  priority: Priority;
  status: ReviewStatus;
  provenance: Provenance;
  /** 0-1. Reading confidence from the extractor, shown as a percentage. */
  confidence: number;
  /** Plain-English explanation of why the extractor believed this is a requirement. */
  rationale: string;
  classificationEvidence: string;
  ownerStakeholderId: string | null;
  acceptanceCriteria: string | null;
  /** True when introduced after the agreed scope baseline date. */
  postBaseline: boolean;
  qualityScore: number;
  /** Who the obligation binds. Orthogonal to `type`. */
  bindsOn: BindsOn;
  createdAt: string;
  updatedAt: string;
}

/** A hard limit (budget, deadline, platform mandate) requirements must respect. */
export interface Constraint {
  id: string;
  projectId: string;
  ref: string;
  statement: string;
  category: "budget" | "timeline" | "technical" | "regulatory" | "organisational";
  /** Parsed numeric value where one exists, for arithmetic conflict checks. */
  value: number | null;
  unit: string | null;
  ownerStakeholderId: string | null;
  provenance: Provenance;
  createdAt: string;
}

/** Ties a requirement/constraint/conflict to the exact text that supports it. */
export interface Evidence {
  id: string;
  projectId: string;
  subjectType: "requirement" | "constraint" | "conflict" | "ambiguity" | "risk";
  subjectId: string;
  documentId: string;
  chunkId: string | null;
  quote: string;
  locator: string;
  startOffset: number;
  endOffset: number;
  stakeholderId: string | null;
}

export type ConflictKind =
  | "quantitative"
  | "contradiction"
  | "scope_divergence"
  | "temporal"
  | "ownership";

export const CONFLICT_KIND_LABEL: Record<ConflictKind, string> = {
  quantitative: "Quantitative tension",
  contradiction: "Direct contradiction",
  scope_divergence: "Divergent expectations",
  temporal: "Timeline conflict",
  ownership: "Ownership conflict",
};

export type ConflictStatus =
  | "open"
  | "accepted"
  | "dismissed"
  | "needs_clarification"
  | "resolved";

export const CONFLICT_STATUS_LABEL: Record<ConflictStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  dismissed: "Dismissed",
  needs_clarification: "Needs clarification",
  resolved: "Resolved",
};

export interface Conflict {
  id: string;
  projectId: string;
  ref: string;
  title: string;
  kind: ConflictKind;
  severity: Severity;
  status: ConflictStatus;
  /** Which detector fired, in human terms. Shown verbatim in the workspace. */
  detector: string;
  /** Why the detector fired. Deliberately hedged - never asserts impossibility. */
  explanation: string;
  /** What a human must check to confirm or dismiss. */
  validationQuestion: string;
  leftType: "requirement" | "constraint";
  leftId: string;
  rightType: "requirement" | "constraint";
  rightId: string;
  confidence: number;
  impactedTeams: string;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AmbiguityKind =
  | "vague_term"
  | "unquantified"
  | "missing_acceptance_criteria"
  | "undefined_actor"
  | "compound_requirement"
  | "unverified_assumption"
  | "reported_speech";

export const AMBIGUITY_KIND_LABEL: Record<AmbiguityKind, string> = {
  vague_term: "Vague terminology",
  unquantified: "No measurable threshold",
  missing_acceptance_criteria: "No acceptance criteria",
  undefined_actor: "Undefined actor",
  compound_requirement: "Compound requirement",
  unverified_assumption: "Unverified assumption",
  reported_speech: "Narrated, not stated",
};

export interface Ambiguity {
  id: string;
  projectId: string;
  requirementId: string;
  kind: AmbiguityKind;
  severity: Severity;
  /** The exact substring that triggered the finding. */
  span: string;
  spanStart: number;
  spanEnd: number;
  explanation: string;
  /** A concrete, measurable rewrite. Always provenance `ai_suggestion`. */
  suggestion: string;
  resolved: boolean;
  createdAt: string;
}

export type RiskCategory =
  | "ambiguity"
  | "conflict"
  | "acceptance_criteria"
  | "ownership"
  | "assumption"
  | "scope_creep"
  | "dependency"
  | "compliance"
  | "security"
  | "coverage_gap";

export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  ambiguity: "High ambiguity",
  conflict: "Conflicting requirements",
  acceptance_criteria: "Missing acceptance criteria",
  ownership: "Missing stakeholder owner",
  assumption: "Unverified assumption",
  scope_creep: "Scope creep",
  dependency: "Dependency risk",
  compliance: "Compliance risk",
  security: "Security risk",
  coverage_gap: "Coverage gap",
};

export interface Risk {
  id: string;
  projectId: string;
  ref: string;
  category: RiskCategory;
  title: string;
  description: string;
  severity: Severity;
  likelihood: "low" | "medium" | "high";
  mitigation: string;
  status: "open" | "mitigated" | "accepted";
  requirementId: string | null;
  conflictId: string | null;
  provenance: Provenance;
  createdAt: string;
}

export type RelationshipKind =
  | "depends_on"
  | "contradicts"
  | "supports"
  | "derived_from"
  | "duplicates"
  | "impacts";

export const RELATIONSHIP_LABEL: Record<RelationshipKind, string> = {
  depends_on: "Depends on",
  contradicts: "Contradicts",
  supports: "Supports",
  derived_from: "Derived from",
  duplicates: "Overlaps with",
  impacts: "Impacts",
};

export interface Relationship {
  id: string;
  projectId: string;
  sourceType: "requirement" | "constraint";
  sourceId: string;
  targetType: "requirement" | "constraint";
  targetId: string;
  kind: RelationshipKind;
  /** Why the link exists - e.g. the shared terms that produced it. */
  rationale: string;
  strength: number;
  provenance: Provenance;
}

export interface Decision {
  id: string;
  projectId: string;
  ref: string;
  title: string;
  detail: string;
  decidedBy: string;
  decidedAt: string;
  requirementId: string | null;
  conflictId: string | null;
  provenance: Provenance;
}

/** Append-only. Nothing in this table is ever updated or deleted. */
export interface AuditEvent {
  id: string;
  projectId: string;
  subjectType: string;
  subjectId: string;
  action: string;
  detail: string;
  actor: string;
  actorKind: "ai" | "human" | "system";
  createdAt: string;
}

export interface Review {
  id: string;
  projectId: string;
  requirementId: string;
  decision: "approved" | "rejected" | "needs_clarification" | "edited";
  note: string;
  reviewer: string;
  createdAt: string;
}

/** A gap: something a comparable engagement would have, that this project lacks. */
export interface CoverageGap {
  id: string;
  projectId: string;
  area: string;
  expectation: string;
  reason: string;
  severity: Severity;
  status: "open" | "addressed" | "dismissed";
  createdAt: string;
}
