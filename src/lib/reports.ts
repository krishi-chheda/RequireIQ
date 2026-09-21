import "server-only";

import {
  getProject,
  getProjectSummary,
  getScopeChanges,
  getTraceability,
  listAuditTrail,
  listConflicts,
  listConstraints,
  listCoverageGaps,
  listDecisions,
  listEvidence,
  listProjectActivity,
  listProjectAmbiguities,
  listRequirements,
  listRisks,
  listStakeholders,
} from "./queries";
import {
  AMBIGUITY_KIND_LABEL,
  BINDS_ON_LABEL,
  CONFLICT_KIND_LABEL,
  PRIORITY_LABEL,
  REQUIREMENT_TYPE_LABEL,
  REVIEW_STATUS_LABEL,
  RISK_CATEGORY_LABEL,
} from "./types";

/**
 * Consulting deliverables.
 *
 * Six reports, in CSV for a spreadsheet and JSON for a pipeline. The audience
 * is a client steering committee, so each one carries its provenance columns:
 * a register handed over without them invites the reader to treat machine
 * readings as agreed requirements, which is the failure the product exists to
 * prevent.
 */

export const REPORTS = [
  {
    id: "register",
    name: "Requirements register",
    description:
      "Every requirement with its type, priority, owner, review status, acceptance criteria, source document and the exact quote it came from.",
    audience: "The core deliverable. Hand this to the client alongside the conflict report.",
  },
  {
    id: "conflicts",
    name: "Conflict report",
    description:
      "Each detected conflict with both statements, both sources, the detector that fired, its reasoning, the validation question and the current resolution.",
    audience: "For the steering committee. This is the document that prevents the rework.",
  },
  {
    id: "risks",
    name: "Risk report",
    description:
      "Requirements risk by category and severity, with the mitigation and the record each risk was derived from.",
    audience: "Feeds the programme risk register.",
  },
  {
    id: "traceability",
    name: "Traceability matrix",
    description:
      "Requirement to source sentence to document to position to stakeholder, with character offsets, plus downstream findings.",
    audience: "For audit and regulatory review.",
  },
  {
    id: "quality",
    name: "Quality findings",
    description:
      "Every ambiguity, unquantified threshold and missing acceptance criterion, with the exact span and the suggested measurable rewrite.",
    audience: "The business analyst's worklist for the next round of stakeholder sessions.",
  },
  {
    id: "changelog",
    name: "Change log",
    description:
      "Scope movement against the baseline, wording changes, and the full append-only audit trail of who did what.",
    audience: "For change control and the engagement close-down pack.",
  },
] as const;

export type ReportId = (typeof REPORTS)[number]["id"];

export function isReportId(value: string): value is ReportId {
  return REPORTS.some((report) => report.id === value);
}

/**
 * Escapes one CSV cell.
 *
 * The leading apostrophe on values starting with `= + - @` is CSV injection
 * defence: a requirement statement beginning with "-" would otherwise be
 * interpreted as a formula when the client opens the file in Excel. A
 * requirements tool that exports a spreadsheet which executes on open is not a
 * requirements tool anybody should use.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly on Windows, which is where these land.
  return `﻿${[headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\r\n")}\r\n`;
}

export interface ReportPayload {
  filename: string;
  csv: string;
  json: unknown;
}

export function buildReport(projectId: string, reportId: ReportId): ReportPayload | null {
  const project = getProject(projectId);
  if (!project) return null;

  const slug = `${project.key.toLowerCase()}-${reportId}-${new Date().toISOString().slice(0, 10)}`;
  const stakeholders = new Map(listStakeholders(projectId).map((s) => [s.id, s]));

  switch (reportId) {
    case "register": {
      const requirements = listRequirements(projectId);
      const rows = requirements.map((requirement) => {
        const evidence = listEvidence("requirement", requirement.id)[0];
        const owner = requirement.ownerStakeholderId ? stakeholders.get(requirement.ownerStakeholderId) : null;
        return {
          ref: requirement.ref,
          statement: requirement.statement,
          type: REQUIREMENT_TYPE_LABEL[requirement.type],
          bindsOn: BINDS_ON_LABEL[requirement.bindsOn],
          priority: PRIORITY_LABEL[requirement.priority],
          status: REVIEW_STATUS_LABEL[requirement.status],
          provenance: requirement.provenance,
          confidence: `${Math.round(requirement.confidence * 100)}%`,
          owner: owner ? `${owner.name} (${owner.role})` : "UNASSIGNED",
          ownerTeam: owner?.team ?? "",
          acceptanceCriteria: requirement.acceptanceCriteria ?? "NOT DEFINED",
          postBaseline: requirement.postBaseline ? "Yes" : "No",
          sourceDocument: evidence?.documentTitle ?? "",
          sourceLocation: evidence?.locator ?? "",
          sourceQuote: evidence?.quote ?? "",
          rationale: requirement.rationale,
        };
      });

      return {
        filename: slug,
        csv: toCsv(
          [
            "Reference", "Requirement", "Type", "Binds on", "Priority", "Review status", "Provenance",
            "Extraction confidence", "Business owner", "Owner team", "Acceptance criteria",
            "Added after baseline", "Source document", "Source location", "Source quote",
            "Extraction rationale",
          ],
          rows.map((r) => [
            r.ref, r.statement, r.type, r.bindsOn, r.priority, r.status, r.provenance, r.confidence,
            r.owner, r.ownerTeam, r.acceptanceCriteria, r.postBaseline, r.sourceDocument,
            r.sourceLocation, r.sourceQuote, r.rationale,
          ]),
        ),
        json: { project: projectMeta(projectId), constraints: listConstraints(projectId), requirements: rows },
      };
    }

    case "conflicts": {
      const conflicts = listConflicts(projectId);
      const sides = new Map(
        [...listRequirements(projectId), ...listConstraints(projectId)].map((r) => [r.id, r]),
      );

      const rows = conflicts.map((conflict) => ({
        ref: conflict.ref,
        title: conflict.title,
        kind: CONFLICT_KIND_LABEL[conflict.kind],
        severity: conflict.severity,
        status: conflict.status,
        confidence: `${Math.round(conflict.confidence * 100)}%`,
        detector: conflict.detector,
        leftRef: sides.get(conflict.leftId)?.ref ?? conflict.leftId,
        leftStatement: sides.get(conflict.leftId)?.statement ?? "",
        rightRef: sides.get(conflict.rightId)?.ref ?? conflict.rightId,
        rightStatement: sides.get(conflict.rightId)?.statement ?? "",
        explanation: conflict.explanation,
        validationQuestion: conflict.validationQuestion,
        impactedTeams: conflict.impactedTeams,
        resolution: conflict.resolutionNote ?? "",
      }));

      return {
        filename: slug,
        csv: toCsv(
          [
            "Reference", "Conflict", "Type", "Severity", "Status", "Detector confidence", "Detector",
            "First record", "First statement", "Second record", "Second statement",
            "Why this was flagged", "What to validate", "Teams affected", "Resolution",
          ],
          rows.map((r) => [
            r.ref, r.title, r.kind, r.severity, r.status, r.confidence, r.detector,
            r.leftRef, r.leftStatement, r.rightRef, r.rightStatement,
            r.explanation, r.validationQuestion, r.impactedTeams, r.resolution,
          ]),
        ),
        json: { project: projectMeta(projectId), conflicts: rows },
      };
    }

    case "risks": {
      const risks = listRisks(projectId);
      const gaps = listCoverageGaps(projectId);
      const requirements = new Map(listRequirements(projectId).map((r) => [r.id, r]));
      const conflicts = new Map(listConflicts(projectId).map((c) => [c.id, c]));

      const rows = risks.map((risk) => ({
        ref: risk.ref,
        category: RISK_CATEGORY_LABEL[risk.category],
        title: risk.title,
        description: risk.description,
        severity: risk.severity,
        likelihood: risk.likelihood,
        status: risk.status,
        mitigation: risk.mitigation,
        derivedFrom: risk.requirementId
          ? requirements.get(risk.requirementId)?.ref ?? ""
          : risk.conflictId
            ? conflicts.get(risk.conflictId)?.ref ?? ""
            : "Register-wide",
      }));

      return {
        filename: slug,
        csv: toCsv(
          ["Reference", "Category", "Risk", "Description", "Severity", "Likelihood", "Status", "Mitigation", "Derived from"],
          rows.map((r) => [
            r.ref, r.category, r.title, r.description, r.severity, r.likelihood, r.status, r.mitigation, r.derivedFrom,
          ]),
        ),
        json: { project: projectMeta(projectId), risks: rows, coverageGaps: gaps },
      };
    }

    case "traceability": {
      const rows = getTraceability(projectId).map((row) => {
        const evidence = row.evidence[0];
        return {
          ref: row.requirement.ref,
          statement: row.requirement.statement,
          type: REQUIREMENT_TYPE_LABEL[row.requirement.type],
          bindsOn: BINDS_ON_LABEL[row.requirement.bindsOn],
          sourceQuote: evidence?.quote ?? "",
          document: evidence?.documentTitle ?? "",
          location: evidence?.locator ?? "",
          offsets: evidence ? `${evidence.startOffset}-${evidence.endOffset}` : "",
          capturedAt: evidence?.capturedAt ?? "",
          requestedBy: row.owner ? `${row.owner.name} (${row.owner.role})` : "UNATTRIBUTED",
          team: row.owner?.team ?? "",
          conflicts: row.conflictRefs.join("; "),
          openFindings: row.findingCount,
          relatedRecords: row.relatedCount,
          status: REVIEW_STATUS_LABEL[row.requirement.status],
        };
      });

      return {
        filename: slug,
        csv: toCsv(
          [
            "Reference", "Requirement", "Type", "Binds on", "Source sentence", "Document", "Location",
            "Character offsets", "Captured", "Requested by", "Team", "Conflicts",
            "Open quality findings", "Related records", "Review status",
          ],
          rows.map((r) => [
            r.ref, r.statement, r.type, r.bindsOn, r.sourceQuote, r.document, r.location, r.offsets,
            r.capturedAt, r.requestedBy, r.team, r.conflicts, r.openFindings, r.relatedRecords, r.status,
          ]),
        ),
        json: { project: projectMeta(projectId), traceability: rows },
      };
    }

    case "quality": {
      const requirements = new Map(listRequirements(projectId).map((r) => [r.id, r]));
      const rows = listProjectAmbiguities(projectId).map((finding) => {
        const requirement = requirements.get(finding.requirementId);
        return {
          ref: requirement?.ref ?? finding.requirementId,
          statement: requirement?.statement ?? "",
          kind: AMBIGUITY_KIND_LABEL[finding.kind],
          severity: finding.severity,
          span: finding.span,
          explanation: finding.explanation,
          suggestion: finding.suggestion,
          resolved: finding.resolved ? "Yes" : "No",
        };
      });

      return {
        filename: slug,
        csv: toCsv(
          ["Requirement", "Statement", "Finding", "Severity", "Triggering text", "Why it matters", "Suggested rewrite", "Resolved"],
          rows.map((r) => [
            r.ref, r.statement, r.kind, r.severity, r.span, r.explanation, r.suggestion, r.resolved,
          ]),
        ),
        json: { project: projectMeta(projectId), findings: rows },
      };
    }

    case "changelog": {
      const scope = getScopeChanges(projectId);
      const activity = listProjectActivity(projectId, 1000);

      const scopeRows = [
        ...scope.added.map((change) => ({
          type: "Added after baseline",
          ref: change.requirement.ref,
          statement: change.requirement.statement,
          previous: "",
          source: change.evidence?.documentTitle ?? "",
          capturedAt: change.evidence?.capturedAt ?? "",
          by: change.owner ? change.owner.name : "UNATTRIBUTED",
        })),
        ...scope.changed.map((change) => ({
          type: "Reworded by reviewer",
          ref: change.requirement.ref,
          statement: change.requirement.statement,
          previous: change.requirement.originalStatement,
          source: change.evidence?.documentTitle ?? "",
          capturedAt: change.requirement.updatedAt,
          by: "Reviewer",
        })),
      ];

      const auditRows = activity.map((event) => [
        event.createdAt, event.actorKind, event.actor, event.subjectType, event.subjectId, event.action, event.detail,
      ]);

      return {
        filename: slug,
        csv:
          toCsv(
            ["Change type", "Reference", "Current statement", "Previous statement", "Source", "Date", "Attributed to"],
            scopeRows.map((r) => [r.type, r.ref, r.statement, r.previous, r.source, r.capturedAt, r.by]),
          ) +
          "\r\n" +
          toCsv(["Timestamp", "Actor kind", "Actor", "Subject type", "Subject", "Action", "Detail"], auditRows),
        json: {
          project: projectMeta(projectId),
          baselineDate: scope.baselineDate,
          baselineCount: scope.baselineCount,
          changes: scopeRows,
          auditTrail: activity,
          decisions: listDecisions(projectId),
        },
      };
    }
  }
}

function projectMeta(projectId: string) {
  const summary = getProjectSummary(projectId);
  return {
    name: summary?.project.name,
    key: summary?.project.key,
    client: summary?.project.client,
    phase: summary?.project.phase,
    baselineDate: summary?.project.baselineDate,
    generatedAt: new Date().toISOString(),
    generatedBy: "RequireIQ",
    health: summary?.health,
    counts: summary
      ? {
          requirements: summary.requirements,
          approved: summary.approved,
          openConflicts: summary.openConflicts,
          openRisks: summary.openRisks,
          openQualityFindings: summary.openAmbiguities,
          coverageGaps: summary.coverageGaps,
        }
      : undefined,
    disclaimer:
      "Requirements and findings in this report were extracted by automated analysis from the source documents listed. Records marked with provenance 'ai_analysis' are machine readings traceable to the quoted evidence, not agreed requirements. Conflicts are potential tensions requiring human validation, not determinations of infeasibility.",
  };
}

/** Everything about a project in one JSON document, for a pipeline or backup. */
export function buildFullExport(projectId: string): unknown {
  return {
    project: projectMeta(projectId),
    stakeholders: listStakeholders(projectId),
    requirements: listRequirements(projectId).map((requirement) => ({
      ...requirement,
      evidence: listEvidence("requirement", requirement.id),
      auditTrail: listAuditTrail("requirement", requirement.id),
    })),
    constraints: listConstraints(projectId),
    conflicts: listConflicts(projectId),
    risks: listRisks(projectId),
    qualityFindings: listProjectAmbiguities(projectId),
    coverageGaps: listCoverageGaps(projectId),
    decisions: listDecisions(projectId),
    scope: getScopeChanges(projectId),
  };
}
