import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProject, getScopeChanges } from "@/lib/queries";
import { REQUIREMENT_TYPE_LABEL } from "@/lib/types";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Eyebrow,
  PageHeader,
  Ref,
  StatusBadge,
  formatDate,
} from "@/components/ui";

export const metadata: Metadata = { title: "Scope movement" };

/**
 * Scope movement against the baseline.
 *
 * Two facts, not two judgements. "Added" means the source document was captured
 * after the agreed baseline date. "Changed" means a human edited the statement
 * after extraction. Both are checkable against records; neither is an opinion
 * about whether the change was reasonable.
 */
export default async function ScopePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const scope = getScopeChanges(projectId);
  const base = `/app/projects/${projectId}`;
  const total = scope.baselineCount + scope.added.length;
  const growth = scope.baselineCount === 0 ? 0 : (scope.added.length / scope.baselineCount) * 100;

  // Group additions by the document that introduced them: scope creep almost
  // always arrives in batches, from one conversation.
  const bySource = new Map<string, typeof scope.added>();
  for (const change of scope.added) {
    const key = change.evidence?.documentTitle ?? "Source not recorded";
    bySource.set(key, [...(bySource.get(key) ?? []), change]);
  }

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Findings"
          title="Scope movement"
          description={`Measured against the agreed baseline of ${formatDate(scope.baselineDate)}. Anything captured after that date entered the register without passing through change control.`}
        />

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Baseline scope", scope.baselineCount, "text-ink"],
            ["Added since", scope.added.length, scope.added.length ? "text-high" : "text-positive"],
            ["Reworded by a reviewer", scope.changed.length, "text-brand-ink"],
            ["Growth", `+${growth.toFixed(0)}%`, growth > 15 ? "text-critical" : "text-ink"],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-lg border border-line bg-surface px-4 py-3">
              <Eyebrow>{label as string}</Eyebrow>
              <p data-numeric className={`mt-1.5 text-[22px] font-semibold tracking-[-0.03em] ${tone as string}`}>
                {value as string | number}
              </p>
            </div>
          ))}
        </div>

        {/* Original versus current, as one bar. */}
        <Card>
          <CardHeader
            title="Original scope against current scope"
            description="The commercial case, the capacity targets and the schedule were all set against the left-hand figure."
          />
          <div className="px-5 py-5">
            <div className="flex h-8 overflow-hidden rounded-sm border border-line">
              <div
                className="flex items-center justify-center bg-brand/25 text-[11.5px] font-medium text-brand-ink"
                style={{ width: `${(scope.baselineCount / Math.max(1, total)) * 100}%` }}
              >
                {scope.baselineCount} baseline
              </div>
              {scope.added.length > 0 ? (
                <div
                  className="flex items-center justify-center bg-high/25 text-[11.5px] font-medium text-high"
                  style={{ width: `${(scope.added.length / Math.max(1, total)) * 100}%` }}
                >
                  +{scope.added.length}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11.5px] text-ink-faint">
              <span>Baseline agreed {formatDate(scope.baselineDate)}</span>
              <span data-numeric>{total} requirements in the register today</span>
            </div>
          </div>
        </Card>

        {scope.added.length > 0 ? (
          <Callout tone="high" title="Why this matters on this engagement">
            <p>
              The capacity target, the latency targets and the infrastructure budget were all set before these
              requirements arrived, and none has been restated to include them. That is the mechanism by which
              a programme arrives at build with commitments that no longer describe what it is building.
            </p>
          </Callout>
        ) : null}

        <Card>
          <CardHeader
            title="Added after the baseline"
            description="Grouped by the document that introduced them. Scope creep arrives in batches, from one conversation."
          />
          {scope.added.length === 0 ? (
            <EmptyState
              title="No scope movement"
              description="Every requirement in the register comes from material captured on or before the baseline date."
            />
          ) : (
            <div className="divide-y divide-line">
              {[...bySource.entries()].map(([source, changes]) => (
                <div key={source} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="high">Added</Badge>
                    <p className="text-[12.5px] font-medium text-ink">{source}</p>
                    {changes[0]?.evidence ? (
                      <span className="text-[11.5px] text-ink-faint">
                        captured {formatDate(changes[0].evidence.capturedAt)}
                      </span>
                    ) : null}
                    <span data-numeric className="ml-auto text-[11.5px] text-ink-faint">
                      {changes.length} requirement{changes.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <ul className="mt-3 space-y-2">
                    {changes.map((change) => (
                      <li key={change.requirement.id}>
                        <Link
                          href={`${base}/requirements/${change.requirement.id}`}
                          className="block rounded-md border border-line bg-raised px-3 py-2.5 transition-colors hover:border-edge hover:bg-hover"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Ref className="text-brand-ink">{change.requirement.ref}</Ref>
                            <Badge>{REQUIREMENT_TYPE_LABEL[change.requirement.type]}</Badge>
                            <StatusBadge status={change.requirement.status} />
                          </div>
                          <p className="mt-1.5 text-[12.5px] leading-snug text-ink">
                            {change.requirement.statement}
                          </p>
                          <p className="mt-1.5 text-[11.5px] text-ink-faint">
                            {change.owner ? `Requested by ${change.owner.name}, ${change.owner.role}` : "No identifiable requester"}
                            {change.evidence ? ` · ${change.evidence.locator}` : ""}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Reworded after extraction"
            description="Where a reviewer changed the words, the original extracted statement is kept alongside."
          />
          {scope.changed.length === 0 ? (
            <EmptyState
              title="No wording changes yet"
              description="When a reviewer edits a requirement, the original statement is preserved and the difference is shown here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {scope.changed.map((change) => (
                <li key={change.requirement.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">Changed</Badge>
                    <Ref>{change.requirement.ref}</Ref>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    <div className="rounded-sm border-l-2 border-edge bg-raised px-3 py-2">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
                        As extracted
                      </p>
                      <p className="mt-1 text-[12.5px] leading-snug text-ink-faint line-through decoration-ink-faint/40">
                        {change.requirement.originalStatement}
                      </p>
                    </div>
                    <div className="rounded-sm border-l-2 border-positive bg-positive-soft/40 px-3 py-2">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-positive">
                        Current
                      </p>
                      <p className="mt-1 text-[12.5px] leading-snug text-ink">{change.requirement.statement}</p>
                    </div>
                  </div>
                  <Link
                    href={`${base}/requirements/${change.requirement.id}`}
                    className="mt-2 inline-block text-[11.5px] text-brand-ink hover:underline"
                  >
                    See the audit trail &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
