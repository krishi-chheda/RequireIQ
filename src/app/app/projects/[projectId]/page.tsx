import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getGraph,
  getProjectSummary,
  listConflicts,
  listConstraints,
  listCoverageGaps,
  listDecisions,
  listDocuments,
  listProjectActivity,
  listStakeholders,
} from "@/lib/queries";
import { HealthBreakdown, HealthDial } from "@/components/health";
import { ResetDemoButton } from "@/components/reset-demo";
import {
  Badge,
  Card,
  CardHeader,
  Eyebrow,
  LinkButton,
  Meter,
  PageHeader,
  Ref,
  SeverityBadge,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/components/ui";

export const metadata: Metadata = { title: "Workspace" };

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const summary = getProjectSummary(projectId);
  if (!summary) notFound();

  const { project } = summary;
  const base = `/app/projects/${projectId}`;
  const stakeholders = listStakeholders(projectId);
  const documents = listDocuments(projectId);
  const conflicts = listConflicts(projectId).filter(
    (c) => c.status === "open" || c.status === "needs_clarification",
  );
  const gaps = listCoverageGaps(projectId).filter((g) => g.status === "open");
  const decisions = listDecisions(projectId);
  const constraints = listConstraints(projectId);
  const graph = getGraph(projectId);
  const activity = listProjectActivity(projectId, 12);

  const byTeam = stakeholders.reduce<Map<string, typeof stakeholders>>((map, person) => {
    map.set(person.team, [...(map.get(person.team) ?? []), person]);
    return map;
  }, new Map());

  const reviewed = summary.requirements === 0 ? 0 : (summary.approved / summary.requirements) * 100;

  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow={`${project.client} · ${project.key}`}
          title={project.name}
          description={project.description}
          actions={
            <>
              <LinkButton href={`${base}/conflicts`} variant="secondary">
                Review conflicts
              </LinkButton>
              <LinkButton href={`${base}/requirements`} variant="primary">
                Open the register
              </LinkButton>
            </>
          }
        />

        {/* Health + the numbers behind it, deliberately on one row so the score
            is never seen without its reasons. */}
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card className="flex flex-col items-center justify-center gap-4 p-6">
            <HealthDial health={summary.health} size={128} />
            <p className="text-center text-[11.5px] leading-relaxed text-ink-faint">
              Phase: {project.phase}. Scope baseline {formatDate(project.baselineDate)}.
            </p>
          </Card>

          <Card>
            <CardHeader
              title="How that score was calculated"
              description="Four deductions from a starting 100. No hidden weighting, nothing learned."
            />
            <div className="px-5 py-4">
              <HealthBreakdown health={summary.health} />
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Discovery input" />
            <dl className="divide-y divide-line">
              {[
                ["Documents ingested", formatNumber(summary.documents)],
                ["Words analysed", formatNumber(summary.words)],
                ["Stakeholders", formatNumber(summary.stakeholders)],
                ["Workshops represented", formatNumber(documents.filter((d) => d.kind === "transcript").length)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[12.5px] text-ink-muted">{label}</dt>
                  <dd data-numeric className="text-[13px] font-medium text-ink">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Register output" />
            <dl className="divide-y divide-line">
              {[
                ["Requirements extracted", formatNumber(summary.requirements), `${base}/requirements`],
                ["Constraints", formatNumber(constraints.length), `${base}/requirements?view=constraints`],
                ["Quality findings", formatNumber(summary.openAmbiguities), `${base}/requirements?view=findings`],
                ["Relationships inferred", formatNumber(graph.edges.length), `${base}/graph`],
              ].map(([label, value, href]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[12.5px] text-ink-muted">{label}</dt>
                  <dd>
                    <Link
                      href={href!}
                      data-numeric
                      className="text-[13px] font-medium text-ink hover:text-brand-ink hover:underline"
                    >
                      {value}
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Review progress" description="Nothing is authoritative until it is approved." />
            <div className="px-5 py-4">
              <div className="flex items-baseline justify-between">
                <p data-numeric className="text-[24px] font-semibold tracking-[-0.03em] text-ink">
                  {reviewed.toFixed(0)}%
                </p>
                <p className="text-[12px] text-ink-muted">
                  {summary.approved} of {summary.requirements}
                </p>
              </div>
              <div className="mt-3">
                <Meter value={reviewed} tone={reviewed > 70 ? "positive" : "brand"} label="Approved" />
              </div>
              <dl className="mt-4 space-y-1.5 text-[12px]">
                {[
                  ["AI proposed", summary.awaitingReview],
                  ["Approved", summary.approved],
                  ["Rejected", summary.rejected],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between">
                    <dt className="text-ink-faint">{label}</dt>
                    <dd data-numeric className="text-ink-muted">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>
        </div>

        {/* What needs attention */}
        <Card>
          <CardHeader
            title="Needs a decision before build commits"
            description={`${conflicts.length} open conflicts and ${gaps.length} unspecified topics. Ordered by severity.`}
            action={
              <LinkButton href={`${base}/conflicts`} variant="ghost">
                All conflicts
              </LinkButton>
            }
          />
          <ul className="divide-y divide-line">
            {conflicts.slice(0, 5).map((conflict) => (
              <li key={conflict.id}>
                <Link
                  href={`${base}/conflicts/${conflict.id}`}
                  className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition-colors hover:bg-raised"
                >
                  <SeverityBadge severity={conflict.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug text-ink">{conflict.title}</p>
                    <p className="mt-1 text-[12px] text-ink-faint">
                      <Ref>{conflict.ref}</Ref> &middot; {conflict.detector} &middot; affects{" "}
                      {conflict.impactedTeams}
                    </p>
                  </div>
                  <span aria-hidden className="mt-1 text-ink-faint">
                    &rarr;
                  </span>
                </Link>
              </li>
            ))}
            {gaps.slice(0, 3).map((gap) => (
              <li key={gap.id}>
                <Link
                  href={`${base}/risks?view=gaps`}
                  className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition-colors hover:bg-raised"
                >
                  <SeverityBadge severity={gap.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug text-ink">Unspecified: {gap.area}</p>
                    <p className="mt-1 text-[12px] text-ink-faint">{gap.expectation}</p>
                  </div>
                  <span aria-hidden className="mt-1 text-ink-faint">
                    &rarr;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Activity timeline */}
          <Card>
            <CardHeader
              title="Activity"
              description="Append-only. Every AI action and every human decision, in order."
            />
            <ol className="divide-y divide-line">
              {activity.map((event) => (
                <li key={event.id} className="flex gap-3 px-5 py-3">
                  <span
                    aria-hidden
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      event.actorKind === "ai"
                        ? "bg-prov-ai"
                        : event.actorKind === "human"
                          ? "bg-prov-human"
                          : "bg-ink-faint"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-snug text-ink-muted">
                      <span className="font-medium text-ink">{event.action.replace(/_/g, " ")}</span>{" "}
                      &middot; {event.detail}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {event.actor} &middot; {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <div className="space-y-4">
            {/* Stakeholders */}
            <Card>
              <CardHeader
                title="Stakeholders"
                description="Attribution is resolved from transcript speakers and email authors."
              />
              <div className="space-y-4 px-5 py-4">
                {[...byTeam.entries()].map(([team, people]) => (
                  <div key={team}>
                    <Eyebrow>{team}</Eyebrow>
                    <ul className="mt-1.5 space-y-1">
                      {people.map((person) => (
                        <li key={person.id} className="flex items-baseline justify-between gap-3">
                          <span className="text-[12.5px] text-ink">{person.name}</span>
                          <span className="truncate text-right text-[11.5px] text-ink-faint">{person.role}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>

            {/* Decisions */}
            <Card>
              <CardHeader title="Decisions of record" />
              <ul className="divide-y divide-line">
                {decisions.map((decision) => (
                  <li key={decision.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Ref>{decision.ref}</Ref>
                      <Badge tone="neutral">{formatDate(decision.decidedAt)}</Badge>
                    </div>
                    <p className="mt-1.5 text-[12.5px] font-medium text-ink">{decision.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{decision.detail}</p>
                    <p className="mt-1.5 text-[11px] text-ink-faint">{decision.decidedBy}</p>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5">
              <Eyebrow>Demonstration data</Eyebrow>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                Meridian Bank, Northgate Advisory and every person named in this engagement are fictional. The
                fifteen source documents are in <code className="font-mono text-[11px] text-ink">demo-data/</code>{" "}
                and are re-analysed from scratch on every reset.
              </p>
              <div className="mt-3">
                <ResetDemoButton />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
