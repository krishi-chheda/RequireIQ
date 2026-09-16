import type {
  AIProvider,
  AnalysisContext,
  AssistantAnswer,
  AssistantCitation,
  ProjectContext,
} from "./provider";
import { analyseAmbiguity } from "./engine/ambiguity";
import { detectConflicts } from "./engine/conflict";
import { detectCoverageGaps } from "./engine/coverage";
import { extractFromDocument } from "./engine/extract";
import { buildSimilarityIndex, similarity } from "./engine/similarity";
import { normaliseWhitespace, splitSentences, tokenize } from "./engine/text";
import {
  AMBIGUITY_KIND_LABEL,
  PRIORITY_LABEL,
  REQUIREMENT_TYPES,
  REQUIREMENT_TYPE_LABEL,
  SEVERITY_ORDER,
  type Requirement,
  type RequirementType,
} from "@/lib/types";

/**
 * The deterministic local provider.
 *
 * Every function here is a pure transform over text the user supplied. Nothing
 * calls out to a network service, nothing is sampled, and the same corpus
 * produces byte-identical output on every run - which is what makes the
 * conflict tests in this repository meaningful assertions rather than
 * approximate ones.
 */

export const localProvider: AIProvider = {
  id: "local",
  label: "Local analysis engine",
  description:
    "Deterministic, offline. Rule and statistics based extraction, classification, quality analysis and conflict detection. No model calls, no credentials, identical output on every run.",
  deterministic: true,

  extract(context: AnalysisContext) {
    const byName = new Map<string, string>();
    for (const person of context.stakeholders) {
      byName.set(person.name.toLowerCase(), person.id);
      // Transcripts write speaker names in upper case, sometimes surname-first.
      const parts = person.name.split(/\s+/);
      if (parts.length > 1) byName.set(parts.join(" ").toLowerCase(), person.id);
    }

    const author = context.document.author?.toLowerCase() ?? "";
    const defaultStakeholderId = byName.get(author) ?? null;

    return extractFromDocument({
      documentId: context.document.id,
      content: context.document.content,
      kind: context.document.kind,
      stakeholdersByName: byName,
      defaultStakeholderId,
    });
  },

  analyseQuality: analyseAmbiguity,
  detectConflicts,
  detectGaps: detectCoverageGaps,

  /**
   * Extractive summary: the highest-scoring original sentences, never a
   * generated paraphrase. A paraphrase in a requirements tool is a quiet
   * rewrite of the client's words.
   */
  summariseDocument(content: string): string {
    const sentences = splitSentences(content)
      .map((s) => normaliseWhitespace(s.text))
      .filter((text) => text.length > 40 && text.length < 320);
    if (sentences.length === 0) return "No summarisable prose found in this document.";

    const index = buildSimilarityIndex(sentences.map((text, i) => ({ id: String(i), text })));
    const scored = sentences.map((text, i) => {
      // Centrality: how much this sentence shares with the rest of the document.
      let centrality = 0;
      for (let j = 0; j < sentences.length; j += 1) {
        if (i === j) continue;
        centrality += similarity(index, String(i), String(j)).score;
      }
      const obligationBonus = /\b(must|shall|should)\b/i.test(text) ? 0.35 : 0;
      return { text, score: centrality / Math.max(1, sentences.length - 1) + obligationBonus, order: i };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.text)
      .join(" ");
  },

  async answer(context: ProjectContext, question: string): Promise<AssistantAnswer> {
    return answerFromProject(context, question);
  },
};

// ---------------------------------------------------------------------------
// Project assistant
//
// Retrieval and aggregation over records that already exist. The assistant has
// no generative step at all: every sentence it returns is either a template
// filled with counted records, or text quoted from a source document. It cannot
// invent a stakeholder, a budget or a requirement, because it has no mechanism
// for producing one.
// ---------------------------------------------------------------------------

interface Intent {
  name: string;
  test: RegExp;
  run: (context: ProjectContext, question: string) => AssistantAnswer | null;
}

const INTENTS: Intent[] = [
  { name: "explain-ref", test: /\b(REQ|CON|CFL|RSK)-\d+\b/i, run: explainRef },
  { name: "conflicts", test: /\bconflict|contradict|clash|inconsist|incompatib/i, run: listConflicts },
  { name: "acceptance", test: /\bacceptance criteri|not testable|unverifiab|how (?:do|would) we test/i, run: listMissingAcceptance },
  { name: "ambiguity", test: /\bambigu|vague|unclear|imprecise|woolly/i, run: listAmbiguities },
  { name: "scope", test: /\bscope creep|changed|new requirement|added (?:since|after)|baseline|this week/i, run: listScopeChanges },
  { name: "gaps", test: /\bmissing|gap|not covered|forgot|overlook|nobody (?:said|mentioned)/i, run: listGaps },
  { name: "risk", test: /\brisk|high[- ]risk|dangerous|exposure/i, run: listRisks },
  { name: "owner", test: /\b(?:from|by|owned by|raised by|asked for by) (?:the )?([a-z]+)\b.*\b(team|function|department)?\b|\bwho (?:owns|requested|asked)/i, run: listByStakeholder },
  { name: "unowned", test: /\bno owner|without an owner|unowned|nobody owns|unassigned/i, run: listUnowned },
  { name: "by-type", test: new RegExp(`\\b(${REQUIREMENT_TYPES.join("|")}|non[- ]functional)\\b`, "i"), run: listByType },
  { name: "status", test: /\bapprov|await|pending|review status|sign[- ]?off/i, run: listByStatus },
];

export function answerFromProject(context: ProjectContext, rawQuestion: string): AssistantAnswer {
  const question = rawQuestion.trim();
  if (question.length < 3) {
    return insufficient("The question was too short to interpret.", context);
  }

  for (const intent of INTENTS) {
    if (!intent.test.test(question)) continue;
    const result = intent.run(context, question);
    if (result) return result;
  }

  return freeTextSearch(context, question);
}

function explainRef(context: ProjectContext, question: string): AssistantAnswer | null {
  const match = /\b(REQ|CON|CFL|RSK)-\d+\b/i.exec(question);
  if (!match) return null;
  const ref = match[0].toUpperCase();

  const requirement = context.requirements.find((r) => r.ref === ref);
  if (requirement) {
    const ambiguities = context.ambiguities.filter((a) => a.requirementId === requirement.id);
    const conflicts = context.conflicts.filter((c) => c.leftId === requirement.id || c.rightId === requirement.id);
    const evidence = context.evidenceByRequirement.get(requirement.id) ?? [];
    const owner = context.stakeholders.find((s) => s.id === requirement.ownerStakeholderId);

    const lines = [
      `${ref} reads: "${requirement.statement}"`,
      "",
      `It is classified ${REQUIREMENT_TYPE_LABEL[requirement.type]}, priority ${PRIORITY_LABEL[requirement.priority]}, currently ${requirement.status.replace(/_/g, " ")}. Extraction confidence ${Math.round(requirement.confidence * 100)}%.`,
      owner ? `Owner: ${owner.name}, ${owner.role} (${owner.team}).` : "No named business owner is recorded against it.",
      "",
    ];

    if (evidence.length) {
      lines.push("It was extracted from:");
      for (const item of evidence.slice(0, 3)) {
        lines.push(`  - ${item.documentTitle}, ${item.locator}: "${truncate(item.quote, 160)}"`);
      }
      lines.push("");
    }

    if (conflicts.length) {
      lines.push(`Flagged in ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}:`);
      for (const conflict of conflicts) {
        lines.push(`  - ${conflict.ref} (${conflict.severity}): ${conflict.title}`);
      }
      lines.push("");
    }

    if (ambiguities.length) {
      lines.push(`Quality findings against it:`);
      for (const item of ambiguities) {
        lines.push(`  - ${AMBIGUITY_KIND_LABEL[item.kind]} on "${item.span}": ${truncate(item.explanation, 180)}`);
      }
    }

    if (!conflicts.length && !ambiguities.length) {
      lines.push("No conflicts or quality findings are recorded against it.");
    }

    return {
      answer: lines.join("\n").trim(),
      citations: [
        requirementCitation(context, requirement),
        ...conflicts.map((c) => ({
          kind: "conflict" as const,
          ref: c.ref,
          label: c.title,
          href: `/app/projects/${context.projectId}/conflicts/${c.id}`,
        })),
      ],
      method: `Direct record lookup for ${ref}, plus its linked conflicts, quality findings and source evidence.`,
      grounded: true,
    };
  }

  const conflict = context.conflicts.find((c) => c.ref === ref);
  if (conflict) {
    return {
      answer: `${conflict.ref} - ${conflict.title}\n\nSeverity ${conflict.severity}, status ${conflict.status.replace(/_/g, " ")}. Detected by: ${conflict.detector}.\n\n${conflict.explanation}\n\nTo validate: ${conflict.validationQuestion}`,
      citations: [
        {
          kind: "conflict",
          ref: conflict.ref,
          label: conflict.title,
          href: `/app/projects/${context.projectId}/conflicts/${conflict.id}`,
        },
      ],
      method: `Direct record lookup for ${ref}.`,
      grounded: true,
    };
  }

  return insufficient(`No record with reference ${ref} exists in this project.`, context);
}

function listConflicts(context: ProjectContext): AssistantAnswer {
  const open = context.conflicts
    .filter((c) => c.status === "open" || c.status === "needs_clarification")
    .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  if (open.length === 0) {
    return {
      answer: "There are no open conflicts in this project. Every detected conflict has been accepted, dismissed or resolved.",
      citations: [],
      method: "Counted conflict records with status open or needs clarification.",
      grounded: true,
    };
  }

  const lines = [`${open.length} conflict${open.length === 1 ? " is" : "s are"} open in ${context.projectName}:`, ""];
  for (const conflict of open) {
    lines.push(`${conflict.ref} - ${conflict.severity.toUpperCase()} - ${conflict.title}`);
    lines.push(`   ${firstParagraph(conflict.explanation)}`);
    lines.push("");
  }

  return {
    answer: lines.join("\n").trim(),
    citations: open.map((c) => ({
      kind: "conflict" as const,
      ref: c.ref,
      label: c.title,
      href: `/app/projects/${context.projectId}/conflicts/${c.id}`,
    })),
    method: "Filtered conflict records by status, ordered by severity.",
    grounded: true,
  };
}

function listMissingAcceptance(context: ProjectContext): AssistantAnswer {
  const missing = context.requirements.filter(
    (r) => !r.acceptanceCriteria && r.status !== "rejected" && r.priority === "must",
  );

  if (missing.length === 0) {
    return {
      answer: "Every binding (must have) requirement in the register has recorded acceptance criteria.",
      citations: [],
      method: "Filtered requirements where priority is Must have and acceptance criteria is empty.",
      grounded: true,
    };
  }

  const lines = [
    `${missing.length} binding requirement${missing.length === 1 ? " has" : "s have"} no acceptance criteria recorded. None of these can be signed off at UAT without a reviewer inventing the test on the day:`,
    "",
    ...missing.slice(0, 15).map((r) => `${r.ref} - ${truncate(r.statement, 150)}`),
  ];
  if (missing.length > 15) lines.push(`... and ${missing.length - 15} more.`);

  return {
    answer: lines.join("\n"),
    citations: missing.slice(0, 15).map((r) => requirementCitation(context, r)),
    method: "Filtered requirements where priority is Must have and acceptance criteria is empty.",
    grounded: true,
  };
}

function listAmbiguities(context: ProjectContext): AssistantAnswer {
  const open = context.ambiguities.filter((a) => !a.resolved);
  if (open.length === 0) {
    return {
      answer: "No open quality findings remain against this register.",
      citations: [],
      method: "Counted unresolved ambiguity records.",
      grounded: true,
    };
  }

  const byRequirement = new Map<string, number>();
  for (const item of open) {
    byRequirement.set(item.requirementId, (byRequirement.get(item.requirementId) ?? 0) + 1);
  }
  const worst = [...byRequirement.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ requirement: context.requirements.find((r) => r.id === id), count }))
    .filter((entry): entry is { requirement: Requirement; count: number } => Boolean(entry.requirement));

  const lines = [
    `${open.length} open quality finding${open.length === 1 ? "" : "s"} across ${byRequirement.size} requirement${byRequirement.size === 1 ? "" : "s"}. The most affected:`,
    "",
  ];
  for (const entry of worst) {
    const findings = open.filter((a) => a.requirementId === entry.requirement.id);
    lines.push(`${entry.requirement.ref} (${entry.count} finding${entry.count === 1 ? "" : "s"}) - "${truncate(entry.requirement.statement, 120)}"`);
    for (const finding of findings.slice(0, 2)) {
      lines.push(`   ${AMBIGUITY_KIND_LABEL[finding.kind]}: "${finding.span}" - ${truncate(finding.explanation, 140)}`);
    }
    lines.push("");
  }

  return {
    answer: lines.join("\n").trim(),
    citations: worst.map((e) => requirementCitation(context, e.requirement)),
    method: "Grouped unresolved quality findings by requirement, ordered by finding count.",
    grounded: true,
  };
}

function listScopeChanges(context: ProjectContext): AssistantAnswer {
  const added = context.requirements.filter((r) => r.postBaseline);
  if (added.length === 0) {
    return {
      answer: `No requirements have been added since the scope baseline of ${formatDate(context.baselineDate)}.`,
      citations: [],
      method: "Compared each requirement's source document capture date with the project baseline date.",
      grounded: true,
    };
  }

  const lines = [
    `${added.length} requirement${added.length === 1 ? " was" : "s were"} introduced after the scope baseline of ${formatDate(context.baselineDate)}:`,
    "",
  ];
  for (const requirement of added) {
    const evidence = context.evidenceByRequirement.get(requirement.id)?.[0];
    lines.push(`${requirement.ref} - ${truncate(requirement.statement, 150)}`);
    if (evidence) lines.push(`   Source: ${evidence.documentTitle}, ${evidence.locator}`);
    lines.push("");
  }
  lines.push("Each of these needs to go through change control before it enters the build backlog.");

  return {
    answer: lines.join("\n").trim(),
    citations: added.map((r) => requirementCitation(context, r)),
    method: "Compared each requirement's source document capture date with the project baseline date.",
    grounded: true,
  };
}

function listGaps(context: ProjectContext): AssistantAnswer {
  if (context.gaps.length === 0) {
    return {
      answer: "No coverage gaps are currently recorded against this project.",
      citations: [],
      method: "Read the project's open coverage gap records.",
      grounded: true,
    };
  }

  const lines = [
    `${context.gaps.length} topic${context.gaps.length === 1 ? " has" : "s have"} been entered by this project but never specified:`,
    "",
  ];
  for (const gap of context.gaps) {
    lines.push(`${gap.area}`);
    lines.push(`   Expected: ${gap.expectation}`);
    lines.push(`   Why it matters: ${gap.reason}`);
    lines.push("");
  }

  return {
    answer: lines.join("\n").trim(),
    citations: context.gaps.map((gap) => ({
      kind: "gap" as const,
      ref: gap.area,
      label: gap.expectation,
      href: `/app/projects/${context.projectId}/risks`,
    })),
    method: "Read the project's open coverage gap records, produced by the coverage checklist.",
    grounded: true,
  };
}

function listRisks(context: ProjectContext): AssistantAnswer {
  const open = context.risks
    .filter((r) => r.status === "open")
    .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  if (open.length === 0) {
    return { answer: "No open risks are recorded.", citations: [], method: "Filtered risk records by status.", grounded: true };
  }

  const high = open.filter((r) => r.severity === "high" || r.severity === "critical");
  const lines = [
    `${open.length} open risk${open.length === 1 ? "" : "s"}, of which ${high.length} ${high.length === 1 ? "is" : "are"} high or critical:`,
    "",
  ];
  for (const risk of open.slice(0, 12)) {
    lines.push(`${risk.ref} - ${risk.severity.toUpperCase()} - ${risk.title}`);
    lines.push(`   ${truncate(risk.description, 180)}`);
    lines.push(`   Mitigation: ${truncate(risk.mitigation, 160)}`);
    lines.push("");
  }

  return {
    answer: lines.join("\n").trim(),
    citations: open.slice(0, 12).map((r) => ({
      kind: "risk" as const,
      ref: r.ref,
      label: r.title,
      href: `/app/projects/${context.projectId}/risks`,
    })),
    method: "Filtered risk records by status, ordered by severity.",
    grounded: true,
  };
}

function listUnowned(context: ProjectContext): AssistantAnswer {
  const unowned = context.requirements.filter((r) => !r.ownerStakeholderId && r.status !== "rejected");
  if (unowned.length === 0) {
    return {
      answer: "Every active requirement has a named owner.",
      citations: [],
      method: "Filtered requirements where the owner stakeholder is unset.",
      grounded: true,
    };
  }

  return {
    answer: [
      `${unowned.length} active requirement${unowned.length === 1 ? " has" : "s have"} no identifiable owner. Requirements without a named business owner cannot be signed off, because there is nobody to agree the acceptance criteria:`,
      "",
      ...unowned.map((r) => `${r.ref} - ${truncate(r.statement, 150)}`),
    ].join("\n"),
    citations: unowned.map((r) => requirementCitation(context, r)),
    method: "Filtered requirements where the owner stakeholder is unset.",
    grounded: true,
  };
}

function listByStakeholder(context: ProjectContext, question: string): AssistantAnswer | null {
  const lower = question.toLowerCase();

  const team = [...new Set(context.stakeholders.map((s) => s.team))].find((t) => lower.includes(t.toLowerCase()));
  const person = context.stakeholders.find((s) => {
    const surname = s.name.split(/\s+/).at(-1)?.toLowerCase() ?? "";
    return lower.includes(s.name.toLowerCase()) || (surname.length > 3 && lower.includes(surname));
  });

  if (!team && !person) return null;

  const ids = new Set(
    person ? [person.id] : context.stakeholders.filter((s) => s.team === team).map((s) => s.id),
  );
  const matched = context.requirements.filter((r) => r.ownerStakeholderId && ids.has(r.ownerStakeholderId));
  const label = person ? person.name : `the ${team} team`;

  if (matched.length === 0) {
    return {
      answer: `No requirements in the register are attributed to ${label}. That may mean they did not raise any, or that the source documents did not attribute their statements clearly enough to link them.`,
      citations: [],
      method: "Filtered requirements by owning stakeholder.",
      grounded: true,
    };
  }

  return {
    answer: [
      `${matched.length} requirement${matched.length === 1 ? "" : "s"} attributed to ${label}:`,
      "",
      ...matched.map((r) => `${r.ref} (${REQUIREMENT_TYPE_LABEL[r.type]}) - ${truncate(r.statement, 150)}`),
    ].join("\n"),
    citations: matched.map((r) => requirementCitation(context, r)),
    method: "Filtered requirements by owning stakeholder, resolved from the transcript speaker or email author.",
    grounded: true,
  };
}

function listByType(context: ProjectContext, question: string): AssistantAnswer | null {
  const lower = question.toLowerCase().replace(/non[- ]functional/, "non_functional");
  const type = REQUIREMENT_TYPES.find((t) => lower.includes(t.replace(/_/g, " ")) || lower.includes(t));
  if (!type) return null;

  const matched = context.requirements.filter((r) => r.type === type);
  if (matched.length === 0) {
    return {
      answer: `No requirements are classified as ${REQUIREMENT_TYPE_LABEL[type]} in this project.`,
      citations: [],
      method: "Filtered requirements by classification.",
      grounded: true,
    };
  }

  return {
    answer: [
      `${matched.length} ${REQUIREMENT_TYPE_LABEL[type]} requirement${matched.length === 1 ? "" : "s"}:`,
      "",
      ...matched.map(
        (r) => `${r.ref} (${PRIORITY_LABEL[r.priority]}, ${r.status.replace(/_/g, " ")}) - ${truncate(r.statement, 150)}`,
      ),
    ].join("\n"),
    citations: matched.map((r) => requirementCitation(context, r)),
    method: `Filtered requirements classified as ${REQUIREMENT_TYPE_LABEL[type as RequirementType]}.`,
    grounded: true,
  };
}

function listByStatus(context: ProjectContext): AssistantAnswer {
  const counts = new Map<string, number>();
  for (const requirement of context.requirements) {
    counts.set(requirement.status, (counts.get(requirement.status) ?? 0) + 1);
  }
  const awaiting = context.requirements.filter((r) => r.status === "proposed" || r.status === "in_review");

  return {
    answer: [
      `Review position for ${context.projectName}:`,
      "",
      ...[...counts.entries()].map(([status, count]) => `  ${status.replace(/_/g, " ")}: ${count}`),
      "",
      awaiting.length
        ? `${awaiting.length} requirement${awaiting.length === 1 ? "" : "s"} still need${awaiting.length === 1 ? "s" : ""} a human decision before the register can be issued.`
        : "Every requirement has had a human decision recorded against it.",
    ].join("\n"),
    citations: awaiting.slice(0, 10).map((r) => requirementCitation(context, r)),
    method: "Counted requirement records grouped by review status.",
    grounded: true,
  };
}

/** Last resort: lexical retrieval over every record, with a relevance floor. */
function freeTextSearch(context: ProjectContext, question: string): AssistantAnswer {
  const corpus: Array<{ id: string; text: string; citation: AssistantCitation }> = [
    ...context.requirements.map((r) => ({
      id: `req:${r.id}`,
      text: `${r.statement} ${r.rationale}`,
      citation: requirementCitation(context, r),
    })),
    ...context.constraints.map((c) => ({
      id: `con:${c.id}`,
      text: c.statement,
      citation: {
        kind: "constraint" as const,
        ref: c.ref,
        label: c.statement,
        href: `/app/projects/${context.projectId}/requirements?view=constraints`,
      },
    })),
    ...context.conflicts.map((c) => ({
      id: `cfl:${c.id}`,
      text: `${c.title} ${c.explanation}`,
      citation: {
        kind: "conflict" as const,
        ref: c.ref,
        label: c.title,
        href: `/app/projects/${context.projectId}/conflicts/${c.id}`,
      },
    })),
  ];

  const index = buildSimilarityIndex([...corpus.map((c) => ({ id: c.id, text: c.text })), { id: "__q", text: question }]);
  const questionTerms = new Set(tokenize(question));

  const ranked = corpus
    .map((entry) => {
      const result = similarity(index, "__q", entry.id);
      const overlap = result.sharedTerms.filter((term) => questionTerms.has(term)).length;
      return { entry, score: result.score, overlap };
    })
    // Two gates, not one. A cosine score alone lets a question about a chief
    // executive's home address match a requirement about postcode address
    // validation on the single word "address"; requiring two distinct shared
    // content terms is what turns that into an honest "insufficient evidence".
    .filter((r) => r.score > 0.12 && r.overlap >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (ranked.length === 0) {
    return insufficient(
      "Nothing in this project's requirements, constraints or conflicts matches that question closely enough to answer from evidence.",
      context,
    );
  }

  return {
    answer: [
      `Insufficient evidence for a direct answer, but ${ranked.length} record${ranked.length === 1 ? "" : "s"} in this project relate to the question. Listed by relevance, with nothing inferred beyond what each record says:`,
      "",
      ...ranked.map((r) => `${r.entry.citation.ref} - ${truncate(r.entry.citation.label, 170)}`),
    ].join("\n"),
    citations: ranked.map((r) => r.entry.citation),
    method: "TF-IDF retrieval over the project register with a relevance floor. No answer is synthesised beyond the retrieved records.",
    grounded: false,
  };
}

function insufficient(detail: string, context: ProjectContext): AssistantAnswer {
  return {
    answer: [
      `Insufficient evidence to answer this from ${context.projectName}.`,
      "",
      detail,
      "",
      "The assistant only answers from records extracted from this project's ingested documents. It will not infer an answer that the evidence does not support.",
    ].join("\n"),
    citations: [],
    method: "No matching records found above the relevance floor.",
    grounded: false,
  };
}

function requirementCitation(context: ProjectContext, requirement: Requirement): AssistantCitation {
  const evidence = context.evidenceByRequirement.get(requirement.id)?.[0];
  return {
    kind: "requirement",
    ref: requirement.ref,
    label: requirement.statement,
    href: `/app/projects/${context.projectId}/requirements/${requirement.id}`,
    quote: evidence?.quote,
    locator: evidence ? `${evidence.documentTitle}, ${evidence.locator}` : undefined,
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}

function firstParagraph(text: string): string {
  return truncate(text.split("\n")[0] ?? text, 220);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
