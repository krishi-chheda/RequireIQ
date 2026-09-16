import type {
  Ambiguity,
  Conflict,
  Constraint,
  Requirement,
  Risk,
  SourceDocument,
  Stakeholder,
} from "@/lib/types";
import type { AmbiguityFinding } from "./engine/ambiguity";
import type { DetectedConflict } from "./engine/conflict";
import type { ExtractionResult } from "./engine/extract";
import type { DetectedGap } from "./engine/coverage";

/**
 * Provider abstraction.
 *
 * Analysis is behind an interface so the engine can be swapped without touching
 * a single screen. Two implementations ship:
 *
 *   - `local`      deterministic, offline, no credentials. The default, and the
 *                  one every test asserts against.
 *   - `anthropic`  calls a hosted model for the assistant only, falling back to
 *                  the local implementation for everything else.
 *
 * The split is deliberate rather than a shortcut. Extraction, classification
 * and conflict detection must be reproducible and must cite exact character
 * offsets in a source document; a generative model is a poor fit for both of
 * those and a bad fit for the audit trail a regulated client expects. Free-form
 * question answering is the opposite: it benefits from a model, and its answers
 * are always rendered next to the records they were drawn from.
 */

export interface AnalysisContext {
  document: SourceDocument;
  stakeholders: Stakeholder[];
}

export interface AssistantCitation {
  kind: "requirement" | "conflict" | "risk" | "document" | "constraint" | "gap";
  ref: string;
  label: string;
  href: string;
  /** Verbatim supporting text where one exists. */
  quote?: string;
  locator?: string;
}

export interface AssistantAnswer {
  answer: string;
  citations: AssistantCitation[];
  /** How the answer was produced, shown to the user under the response. */
  method: string;
  /** False when the question could not be answered from project evidence. */
  grounded: boolean;
}

/** Everything the assistant is allowed to see. It may not reach past this. */
export interface ProjectContext {
  projectId: string;
  projectName: string;
  baselineDate: string;
  requirements: Requirement[];
  constraints: Constraint[];
  conflicts: Conflict[];
  risks: Risk[];
  ambiguities: Ambiguity[];
  stakeholders: Stakeholder[];
  documents: Array<Pick<SourceDocument, "id" | "title" | "kind" | "capturedAt">>;
  /** Requirement id to its supporting quotes. */
  evidenceByRequirement: Map<string, Array<{ quote: string; locator: string; documentTitle: string; documentId: string }>>;
  gaps: Array<{ area: string; expectation: string; reason: string }>;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  /** Shown in the UI so a demo audience always knows what produced the output. */
  readonly description: string;
  readonly deterministic: boolean;

  extract(context: AnalysisContext): ExtractionResult;
  analyseQuality(statement: string): AmbiguityFinding[];
  detectConflicts(
    subjects: Parameters<typeof import("./engine/conflict").detectConflicts>[0],
  ): DetectedConflict[];
  detectGaps(statements: string[]): DetectedGap[];
  summariseDocument(content: string): string;
  answer(context: ProjectContext, question: string): Promise<AssistantAnswer>;
}

export interface ProviderStatus {
  id: string;
  label: string;
  description: string;
  deterministic: boolean;
  /** True when `anthropic` was requested but no key was present. */
  degraded: boolean;
}
