import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getProject,
  getRequirement,
  listAmbiguities,
  listAuditTrail,
  listConflictsForSubject,
  listEvidence,
  listRelated,
  listReviews,
  listStakeholders,
} from "@/lib/queries";
import {
  AMBIGUITY_KIND_LABEL,
  BINDS_ON_LABEL,
  PRIORITY_LABEL,
  RELATIONSHIP_LABEL,
  REQUIREMENT_TYPE_LABEL,
} from "@/lib/types";
import { EvidenceBlock, HighlightedStatement } from "@/components/evidence";
import { ReviewPanel, ResolveFindingButton } from "@/components/review";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  Confidence,
  Eyebrow,
  Meter,
  ProvenanceTag,
  Ref,
  SeverityBadge,
  StatusBadge,
  formatDateTime,
} from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}): Promise<Metadata> {
  const { requirementId } = await params;
  const requirement = getRequirement(requirementId);
  return { title: requirement ? `${requirement.ref} - Requirement` : "Requirement" };
}

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; requirementId: string }>;
}) {
  const { projectId, requirementId } = await params;
  const project = getProject(projectId);
  const requirement = getRequirement(requirementId);
  if (!project || !requirement || requirement.projectId !== projectId) notFound();

  const base = `/app/projects/${projectId}`;
  const evidence = listEvidence("requirement", requirement.id);
  const findings = listAmbiguities(requirement.id);
  const openFindings = findings.filter((f) => !f.resolved);
  const conflicts = listConflictsForSubject(requirement.id);
  const related = listRelated(projectId, requirement.id);
  const audit = listAuditTrail("requirement", requirement.id);
  const reviews = listReviews(requirement.id);
  const stakeholders = listStakeholders(projectId);
  const owner = requirement.ownerStakeholderId
    ? stakeholders.find((s) => s.id === requirement.ownerStakeholderId)
    : null;

  const topSuggestion = openFindings.find((f) => f.severity === "high" || f.severity === "critical")?.suggestion ?? null;
  const edited = requirement.statement !== requirement.originalStatement;

  return (
    <main id="main" className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8">
      <div className="enter space-y-5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          <Link href={`${base}/requirements`} className="transition-colors hover:text-ink">
            Requirements
          </Link>
          <span aria-hidden>/</span>
          <Ref>{requirement.ref}</Ref>
        </nav>

        <header className="border-b border-line pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Ref className="text-[13px] text-brand-ink">{requirement.ref}</Ref>
            <StatusBadge status={requirement.status} />
            <ProvenanceTag provenance={requirement.provenance} />
            <Badge>{REQUIREMENT_TYPE_LABEL[requirement.type]}</Badge>
            <Badge>Binds: {BINDS_ON_LABEL[requirement.bindsOn]}</Badge>
            <Badge>{PRIORITY_LABEL[requirement.priority]}</Badge>
            {requirement.postBaseline ? <Badge tone="medium">Added after baseline</Badge> : null}
            {edited ? <Badge tone="brand">Edited by a reviewer</Badge> : null}
          </div>
          <h1 className="mt-3 max-w-4xl text-[19px] font-medium leading-snug tracking-[-0.015em] text-ink">
            <HighlightedStatement
              statement={requirement.statement}
              spans={openFindings.map((f) => ({ start: f.spanStart, end: f.spanEnd, id: f.id }))}
            />
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-faint">
            <span className="flex items-center gap-2">
              Extraction confidence <Confidence value={requirement.confidence} />
            </span>
            <span>
              Quality score{" "}
              <span data-numeric className="text-ink-muted">
                {Math.round(requirement.qualityScore * 100)}%
              </span>
            </span>
            <span>
              Owner:{" "}
              {owner ? (
                <span className="text-ink-muted">
                  {owner.name}, {owner.role}
                </span>
              ) : (
                <span className="text-high">unassigned</span>
              )}
            </span>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-5">
            {edited ? (
              <Callout tone="brand" title="This wording was changed by a reviewer">
                <p>
                  Original extracted statement:{" "}
                  <span className="text-ink">&ldquo;{requirement.originalStatement}&rdquo;</span>
                </p>
              </Callout>
            ) : null}

            {/* Evidence */}
            <Card>
              <CardHeader
                title="Where this came from"
                description="The exact words, the place in the document, and the person who said them."
              />
              <div className="px-5 py-4">
                <EvidenceBlock evidence={evidence} projectId={projectId} label="" />
              </div>
            </Card>

            {/* Machine reading */}
            <Card>
              <CardHeader
                title="How it was read"
                description="The reasoning behind the classification and the confidence figure."
                action={<ProvenanceTag provenance="ai_analysis" />}
              />
              <dl className="divide-y divide-line">
                <div className="px-5 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Why this is a requirement
                  </dt>
                  <dd className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{requirement.rationale}</dd>
                </div>
                <div className="px-5 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Why this classification
                  </dt>
                  <dd className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {requirement.classificationEvidence}
                  </dd>
                </div>
                {requirement.bindsOnEvidence ? (
                  <div className="px-5 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                      Who this binds
                    </dt>
                    <dd className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                      {requirement.bindsOnEvidence}
                    </dd>
                  </div>
                ) : null}
                <div className="px-5 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Acceptance criteria
                  </dt>
                  <dd className="mt-1.5 text-[12.5px] leading-relaxed">
                    {requirement.acceptanceCriteria ? (
                      <span className="text-ink-muted">{requirement.acceptanceCriteria}</span>
                    ) : (
                      <span className="text-high">
                        None recorded. The engine does not invent acceptance criteria - where the source
                        statement contains no measurable clause, the absence is reported rather than filled in.
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>

            {/* Quality findings */}
            <Card>
              <CardHeader
                title="Quality findings"
                description={
                  openFindings.length
                    ? `${openFindings.length} open. Each names the span that triggered it and proposes a measurable alternative.`
                    : "No open findings against this requirement."
                }
                action={<ProvenanceTag provenance="ai_suggestion" />}
              />
              {findings.length === 0 ? (
                <p className="px-5 py-6 text-center text-[12.5px] text-ink-faint">
                  This statement passed every quality check.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {findings.map((finding) => (
                    <li key={finding.id} className={finding.resolved ? "opacity-50" : undefined}>
                      <div className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={finding.severity} />
                          <Badge>{AMBIGUITY_KIND_LABEL[finding.kind]}</Badge>
                          {finding.resolved ? <Badge tone="positive">Resolved</Badge> : null}
                          <span className="ml-auto">
                            {finding.resolved ? null : (
                              <ResolveFindingButton projectId={projectId} ambiguityId={finding.id} />
                            )}
                          </span>
                        </div>

                        {finding.spanEnd - finding.spanStart < requirement.statement.length ? (
                          <p className="mt-2.5 text-[12.5px] text-ink-muted">
                            Triggered by:{" "}
                            <span className="rounded-xs bg-high/15 px-1 font-medium text-high">
                              {finding.span}
                            </span>
                          </p>
                        ) : null}

                        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{finding.explanation}</p>

                        <div className="mt-3 rounded-sm border border-prov-suggest/25 bg-[#170f26]/60 px-3 py-2.5">
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-prov-suggest">
                            Suggested rewrite
                          </p>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{finding.suggestion}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Conflicts */}
            {conflicts.length > 0 ? (
              <Card>
                <CardHeader
                  title="Conflicts involving this requirement"
                  description="Detected across documents, not within one."
                />
                <ul className="divide-y divide-line">
                  {conflicts.map((conflict) => (
                    <li key={conflict.id}>
                      <Link
                        href={`${base}/conflicts/${conflict.id}`}
                        className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-raised"
                      >
                        <SeverityBadge severity={conflict.severity} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium leading-snug text-ink">{conflict.title}</p>
                          <p className="mt-1 text-[11.5px] text-ink-faint">
                            <Ref>{conflict.ref}</Ref> &middot; {conflict.status.replace(/_/g, " ")}
                          </p>
                        </div>
                        <span aria-hidden className="text-ink-faint">
                          &rarr;
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {/* Relationships */}
            <Card>
              <CardHeader
                title="Related records"
                description="Inferred from lexical overlap. Each edge shows the terms that produced it, so it can be argued with."
              />
              {related.length === 0 ? (
                <p className="px-5 py-6 text-center text-[12.5px] text-ink-faint">
                  Nothing else in the register overlaps with this statement above the threshold.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {related.slice(0, 8).map((item) => (
                    <li key={`${item.id}-${item.kind}`} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.kind === "contradicts" ? "critical" : "neutral"}>
                          {RELATIONSHIP_LABEL[item.kind]}
                        </Badge>
                        {item.type === "requirement" ? (
                          <Link
                            href={`${base}/requirements/${item.id}`}
                            className="text-[12px] text-brand-ink hover:underline"
                          >
                            <Ref className="text-brand-ink">{item.ref}</Ref>
                          </Link>
                        ) : (
                          <Ref>{item.ref}</Ref>
                        )}
                        <span className="ml-auto w-16">
                          <Meter value={item.strength * 100} tone="brand" label="Overlap strength" />
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-muted">{item.statement}</p>
                      <p className="mt-1 text-[11.5px] text-ink-faint">{item.rationale}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Right rail: review + audit */}
          <div className="space-y-5">
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title="Review"
                description="Human-in-the-loop. Every action below is recorded against a named reviewer."
              />
              <div className="px-5 py-4">
                <ReviewPanel
                  projectId={projectId}
                  requirementId={requirement.id}
                  currentStatement={requirement.statement}
                  acceptanceCriteria={requirement.acceptanceCriteria}
                  ownerStakeholderId={requirement.ownerStakeholderId}
                  stakeholders={stakeholders}
                  suggestion={topSuggestion}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Audit trail"
                description={`${audit.length} events. Append-only - nothing here is ever edited or removed.`}
              />
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

            {reviews.length > 0 ? (
              <Card>
                <CardHeader title="Review history" />
                <ul className="divide-y divide-line">
                  {reviews.map((review) => (
                    <li key={review.id} className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={review.decision === "approved" ? "positive" : "neutral"}>
                          {review.decision.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-[11px] text-ink-faint">{formatDateTime(review.createdAt)}</span>
                      </div>
                      {review.note ? (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{review.note}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-ink-faint">{review.reviewer}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card className="p-5">
              <Eyebrow>Reading this page</Eyebrow>
              <ul className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-ink-muted">
                <li className="flex gap-2">
                  <ProvenanceTag provenance="source" compact />
                  <span>Verbatim text from an ingested document.</span>
                </li>
                <li className="flex gap-2">
                  <ProvenanceTag provenance="ai_analysis" compact />
                  <span>A machine reading. Traceable to the evidence above, not authoritative.</span>
                </li>
                <li className="flex gap-2">
                  <ProvenanceTag provenance="ai_suggestion" compact />
                  <span>A proposal. Nothing is applied without an action you take.</span>
                </li>
                <li className="flex gap-2">
                  <ProvenanceTag provenance="human" compact />
                  <span>Entered or confirmed by a named person.</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
