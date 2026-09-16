import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getConflict,
  getConflictSide,
  getProject,
  listAuditTrail,
  listDecisions,
  listEvidence,
  listRisks,
  listStakeholders,
} from "@/lib/queries";
import { CONFLICT_KIND_LABEL, CONFLICT_STATUS_LABEL } from "@/lib/types";
import { EvidenceBlock } from "@/components/evidence";
import { ConflictActions } from "@/components/conflict-actions";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  Eyebrow,
  Meter,
  ProvenanceTag,
  Ref,
  SeverityBadge,
  formatDateTime,
} from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ conflictId: string }>;
}): Promise<Metadata> {
  const { conflictId } = await params;
  const conflict = getConflict(conflictId);
  return { title: conflict ? `${conflict.ref} - Conflict` : "Conflict" };
}

/**
 * The conflict workspace.
 *
 * The product's signature screen. It has one job: give a business analyst
 * everything they need to decide, on one page, without trusting the tool. Both
 * statements, both sources in the client's own words, the detector's reasoning
 * with its arithmetic shown, who is affected, and the specific question to go
 * and ask.
 */
export default async function ConflictDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; conflictId: string }>;
}) {
  const { projectId, conflictId } = await params;
  const project = getProject(projectId);
  const conflict = getConflict(conflictId);
  if (!project || !conflict || conflict.projectId !== projectId) notFound();

  const base = `/app/projects/${projectId}`;
  const left = getConflictSide(conflict.leftType, conflict.leftId);
  const right = getConflictSide(conflict.rightType, conflict.rightId);
  const leftEvidence = left ? listEvidence(conflict.leftType, conflict.leftId) : [];
  const rightEvidence = right ? listEvidence(conflict.rightType, conflict.rightId) : [];
  const audit = listAuditTrail("conflict", conflict.id);
  const decisions = listDecisions(projectId).filter((d) => d.conflictId === conflict.id);
  const linkedRisks = listRisks(projectId).filter((r) => r.conflictId === conflict.id);
  const stakeholders = listStakeholders(projectId);

  const teams = conflict.impactedTeams.split(",").map((t) => t.trim()).filter(Boolean);
  const isOpen = conflict.status === "open" || conflict.status === "needs_clarification";

  // The explanation is authored as paragraphs with indented calculation lines.
  const paragraphs = conflict.explanation.split("\n");

  return (
    <main id="main" className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8">
      <div className="enter space-y-5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          <Link href={`${base}/conflicts`} className="transition-colors hover:text-ink">
            Conflicts
          </Link>
          <span aria-hidden>/</span>
          <Ref>{conflict.ref}</Ref>
        </nav>

        <header className="border-b border-line pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={conflict.severity} />
            <Ref className="text-[13px] text-brand-ink">{conflict.ref}</Ref>
            <Badge>{CONFLICT_KIND_LABEL[conflict.kind]}</Badge>
            <Badge tone={isOpen ? "neutral" : "positive"}>{CONFLICT_STATUS_LABEL[conflict.status]}</Badge>
            <ProvenanceTag provenance="ai_analysis" />
          </div>
          <h1 className="mt-3 max-w-4xl text-[22px] font-semibold leading-snug tracking-[-0.02em] text-ink">
            {conflict.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-faint">
            <span>Detector: {conflict.detector}</span>
            <span className="flex items-center gap-2">
              Detector confidence
              <span className="w-16">
                <Meter value={conflict.confidence * 100} tone="brand" label="Detector confidence" />
              </span>
              <span data-numeric className="text-ink-muted">
                {Math.round(conflict.confidence * 100)}%
              </span>
            </span>
          </div>
        </header>

        {/* The two statements, given equal weight. Neither is "the wrong one". */}
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { side: left, evidence: leftEvidence, accent: "border-brand", label: "First statement" },
            { side: right, evidence: rightEvidence, accent: "border-high", label: "Second statement" },
          ].map(({ side, evidence, accent, label }) =>
            side ? (
              <Card key={side.id} className={`border-l-2 ${accent}`}>
                <CardHeader
                  title={label}
                  action={
                    side.type === "requirement" ? (
                      <Link
                        href={`${base}/requirements/${side.id}`}
                        className="text-[11.5px] text-brand-ink hover:underline"
                      >
                        Open record
                      </Link>
                    ) : (
                      <Badge tone="brand">Constraint</Badge>
                    )
                  }
                />
                <div className="space-y-4 px-5 py-4">
                  <div>
                    <Ref>{side.ref}</Ref>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{side.statement}</p>
                  </div>
                  <EvidenceBlock evidence={evidence} projectId={projectId} label="Where it came from" />
                </div>
              </Card>
            ) : null,
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-5">
            {/* Why it fired, with the arithmetic */}
            <Card>
              <CardHeader
                title="Why this was flagged"
                description="The detector's reasoning, with every input it used."
                action={<ProvenanceTag provenance="ai_analysis" />}
              />
              <div className="space-y-2 px-5 py-4">
                {paragraphs.map((line, index) => {
                  if (line.trim() === "") return <div key={index} className="h-1" />;
                  if (line.startsWith("  - ")) {
                    return (
                      <p
                        key={index}
                        data-numeric
                        className="rounded-xs border-l border-edge bg-raised py-1 pl-3 font-mono text-[11.5px] leading-relaxed text-ink-muted"
                      >
                        {line.replace("  - ", "")}
                      </p>
                    );
                  }
                  return (
                    <p key={index} className="text-[13px] leading-relaxed text-ink-muted">
                      {line}
                    </p>
                  );
                })}
              </div>
            </Card>

            {/* The question a human has to answer */}
            <Callout tone="brand" title="What a human has to validate">
              <p className="text-[13px] leading-relaxed text-ink">{conflict.validationQuestion}</p>
            </Callout>

            {conflict.resolutionNote ? (
              <Callout tone="positive" title="Resolution recorded">
                <p className="text-[13px] leading-relaxed text-ink">{conflict.resolutionNote}</p>
              </Callout>
            ) : null}

            {/* Stakeholder impact */}
            <Card>
              <CardHeader
                title="Who this affects"
                description="Derived from the teams that authored each side, plus the functions the detector implicates."
              />
              <div className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {teams.map((team) => {
                    const people = stakeholders.filter((s) => s.team === team);
                    return (
                      <div key={team} className="rounded-md border border-line bg-raised px-3 py-2">
                        <p className="text-[12.5px] font-medium text-ink">{team}</p>
                        {people.length > 0 ? (
                          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                            {people.map((p) => p.name).join(", ")}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11.5px] text-ink-faint">
                            No named stakeholder in this project.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {linkedRisks.length > 0 ? (
              <Card>
                <CardHeader title="Risk this conflict generated" />
                <ul className="divide-y divide-line">
                  {linkedRisks.map((risk) => (
                    <li key={risk.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={risk.severity} />
                        <Ref>{risk.ref}</Ref>
                        <Badge tone={risk.status === "open" ? "neutral" : "positive"}>{risk.status}</Badge>
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{risk.description}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {decisions.length > 0 ? (
              <Card>
                <CardHeader title="Decisions recorded against this conflict" />
                <ul className="divide-y divide-line">
                  {decisions.map((decision) => (
                    <li key={decision.id} className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Ref>{decision.ref}</Ref>
                        <ProvenanceTag provenance={decision.provenance} />
                      </div>
                      <p className="mt-1.5 text-[12.5px] font-medium text-ink">{decision.title}</p>
                      {decision.detail ? (
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{decision.detail}</p>
                      ) : null}
                      <p className="mt-1.5 text-[11px] text-ink-faint">
                        {decision.decidedBy} &middot; {formatDateTime(decision.decidedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>

          <div className="space-y-5">
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title="Resolve"
                description="Four honest endings. All of them are recorded; none of them deletes anything."
              />
              <div className="px-5 py-4">
                <ConflictActions
                  projectId={projectId}
                  conflictId={conflict.id}
                  validationQuestion={conflict.validationQuestion}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Audit trail" />
              <ol className="divide-y divide-line">
                {audit.map((event) => (
                  <li key={event.id} className="flex gap-3 px-5 py-3">
                    <span
                      aria-hidden
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                        event.actorKind === "ai" ? "bg-prov-ai" : "bg-prov-human"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-ink">{event.action.replace(/_/g, " ")}</p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{event.detail}</p>
                      <p className="mt-1 text-[10.5px] text-ink-faint">
                        {event.actor} &middot; {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="p-5">
              <Eyebrow>On the language used here</Eyebrow>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
                This page says &ldquo;potential&rdquo;, &ldquo;indicative&rdquo; and &ldquo;requires
                validation&rdquo; deliberately. The detectors compare stated numbers and stated obligations;
                they have no knowledge of your tenancy pricing, your vendor contracts or what your architects
                already know. What a finding establishes is that two statements were never reconciled against
                each other - not that either one is wrong.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
