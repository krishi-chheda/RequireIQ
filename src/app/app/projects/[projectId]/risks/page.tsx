import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProject, listCoverageGaps, listRisks } from "@/lib/queries";
import { RISK_CATEGORY_LABEL, type RiskCategory } from "@/lib/types";
import { z } from "@/lib/validate";
import { RiskStatusControl, GapStatusControl } from "@/components/risk-actions";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Eyebrow,
  PageHeader,
  Ref,
  SeverityBadge,
} from "@/components/ui";

export const metadata: Metadata = { title: "Risks and gaps" };

const CATEGORIES = Object.keys(RISK_CATEGORY_LABEL) as RiskCategory[];

/**
 * Risk register and coverage gaps.
 *
 * Risks are derived from records that already exist - a conflict, a finding, an
 * unowned requirement - so every one links back to the thing that caused it.
 * Gaps are the opposite: they are what is absent, reported by checklist so an
 * absence is a real absence rather than an invention.
 */
export default async function RisksPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = getProject(projectId);
  if (!project) notFound();

  const view = z.optionalOneOf(query.view, ["gaps"] as const);
  const category = z.optionalOneOf(query.category, CATEGORIES) as RiskCategory | undefined;

  const allRisks = listRisks(projectId);
  const risks = category ? allRisks.filter((r) => r.category === category) : allRisks;
  const gaps = listCoverageGaps(projectId);
  const base = `/app/projects/${projectId}`;

  const counts = new Map<RiskCategory, number>();
  for (const risk of allRisks.filter((r) => r.status === "open")) {
    counts.set(risk.category, (counts.get(risk.category) ?? 0) + 1);
  }

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Findings"
          title="Requirements risk"
          description="Every risk below was derived from a record that already exists in this project. Nothing here is a generic risk-register template entry."
        />

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Open risks", allRisks.filter((r) => r.status === "open").length, "text-critical"],
            [
              "High or critical",
              allRisks.filter((r) => r.status === "open" && (r.severity === "high" || r.severity === "critical")).length,
              "text-high",
            ],
            ["Closed", allRisks.filter((r) => r.status !== "open").length, "text-positive"],
            ["Unspecified topics", gaps.filter((g) => g.status === "open").length, "text-high"],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-lg border border-line bg-surface px-4 py-3">
              <Eyebrow>{label as string}</Eyebrow>
              <p data-numeric className={`mt-1.5 text-[22px] font-semibold tracking-[-0.03em] ${tone as string}`}>
                {value as number}
              </p>
            </div>
          ))}
        </div>

        {/* Section switch */}
        <div className="flex flex-wrap gap-2 border-b border-line pb-3">
          <Link
            href={`${base}/risks`}
            className={`rounded-sm px-3 py-1.5 text-[12.5px] transition-colors ${
              view !== "gaps" ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            Risk register
          </Link>
          <Link
            href={`${base}/risks?view=gaps`}
            className={`rounded-sm px-3 py-1.5 text-[12.5px] transition-colors ${
              view === "gaps" ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            Coverage gaps
          </Link>
        </div>

        {view === "gaps" ? (
          <Card>
            <CardHeader
              title="What nobody wrote down"
              description="Topics this project has clearly entered but never specified. Reported by checklist against comparable regulated delivery, never generated - so a gap is a real absence, not an invention."
            />
            {gaps.length === 0 ? (
              <EmptyState
                title="No coverage gaps"
                description="Every checklist area this project has entered has at least one requirement addressing it."
              />
            ) : (
              <ul className="divide-y divide-line">
                {gaps.map((gap) => (
                  <li key={gap.id} className={`px-5 py-4 ${gap.status !== "open" ? "opacity-55" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={gap.severity} />
                      <Badge tone={gap.status === "open" ? "neutral" : "positive"}>{gap.status}</Badge>
                      <span className="ml-auto">
                        {gap.status === "open" ? <GapStatusControl projectId={projectId} gapId={gap.id} /> : null}
                      </span>
                    </div>
                    <p className="mt-2 text-[13.5px] font-medium text-ink">{gap.area}</p>
                    <dl className="mt-2 space-y-1.5">
                      <div>
                        <dt className="inline text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                          Expected:{" "}
                        </dt>
                        <dd className="inline text-[12.5px] leading-relaxed text-ink-muted">{gap.expectation}</dd>
                      </div>
                      <div>
                        <dt className="inline text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                          Why it matters:{" "}
                        </dt>
                        <dd className="inline text-[12.5px] leading-relaxed text-ink-muted">{gap.reason}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={`${base}/risks`}
                className={`rounded-xs border px-2 py-1 text-[11.5px] transition-colors ${
                  !category
                    ? "border-brand/50 bg-brand-soft text-brand-ink"
                    : "border-line bg-surface text-ink-muted hover:border-edge hover:text-ink"
                }`}
              >
                All <span data-numeric>{allRisks.length}</span>
              </Link>
              {CATEGORIES.filter((c) => counts.has(c)).map((c) => (
                <Link
                  key={c}
                  href={`${base}/risks?category=${c}`}
                  className={`rounded-xs border px-2 py-1 text-[11.5px] transition-colors ${
                    category === c
                      ? "border-brand/50 bg-brand-soft text-brand-ink"
                      : "border-line bg-surface text-ink-muted hover:border-edge hover:text-ink"
                  }`}
                >
                  {RISK_CATEGORY_LABEL[c]} <span data-numeric className="text-ink-faint">{counts.get(c)}</span>
                </Link>
              ))}
            </div>

            <Card>
              <CardHeader
                title={category ? RISK_CATEGORY_LABEL[category] : "All risks"}
                description="Ordered by status, then severity. Each links back to the conflict or requirement that produced it."
              />
              {risks.length === 0 ? (
                <EmptyState
                  title="No risks in this category"
                  description="Choose another category, or clear the filter to see the whole register."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {risks.map((risk) => (
                    <li key={risk.id} className={`px-5 py-4 ${risk.status !== "open" ? "opacity-55" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={risk.severity} />
                        <Ref>{risk.ref}</Ref>
                        <Badge>{RISK_CATEGORY_LABEL[risk.category]}</Badge>
                        <Badge tone={risk.likelihood === "high" ? "high" : "neutral"}>
                          {risk.likelihood} likelihood
                        </Badge>
                        <Badge tone={risk.status === "open" ? "neutral" : "positive"}>{risk.status}</Badge>
                        <span className="ml-auto">
                          {risk.status === "open" ? (
                            <RiskStatusControl projectId={projectId} riskId={risk.id} />
                          ) : null}
                        </span>
                      </div>

                      <p className="mt-2 text-[13px] font-medium leading-snug text-ink">{risk.title}</p>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{risk.description}</p>

                      <div className="mt-3 rounded-sm border-l-2 border-brand bg-raised px-3 py-2">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
                          Mitigation
                        </p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{risk.mitigation}</p>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-3 text-[11.5px]">
                        {risk.conflictId ? (
                          <Link
                            href={`${base}/conflicts/${risk.conflictId}`}
                            className="text-brand-ink hover:underline"
                          >
                            Open the conflict &rarr;
                          </Link>
                        ) : null}
                        {risk.requirementId ? (
                          <Link
                            href={`${base}/requirements/${risk.requirementId}`}
                            className="text-brand-ink hover:underline"
                          >
                            Open the requirement &rarr;
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
