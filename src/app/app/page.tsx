import Link from "next/link";
import type { Metadata } from "next";
import { getProjectSummary, listProjects } from "@/lib/queries";
import {
  Badge,
  Card,
  CardHeader,
  Eyebrow,
  LinkButton,
  Meter,
  PageHeader,
  Stat,
  formatDate,
  formatNumber,
} from "@/components/ui";
import { HealthDial } from "@/components/health";

export const metadata: Metadata = { title: "Executive overview" };

/**
 * Rendered per request, not prerendered.
 *
 * Every figure on this page is read from a database a reviewer can change. A
 * statically prerendered dashboard would keep showing the counts that happened
 * to be true when the bundle was built.
 */
export const dynamic = "force-dynamic";

/**
 * Executive overview.
 *
 * The portfolio-level read. Every figure links to the screen that would let a
 * reader act on it, because a dashboard that cannot be drilled into is a
 * screenshot.
 */
export default function OverviewPage() {
  const projects = listProjects();
  const summaries = projects
    .map((project) => getProjectSummary(project.id))
    .filter((summary): summary is NonNullable<typeof summary> => summary !== null);

  const totals = summaries.reduce(
    (acc, s) => ({
      requirements: acc.requirements + s.requirements,
      approved: acc.approved + s.approved,
      awaiting: acc.awaiting + s.awaitingReview,
      conflicts: acc.conflicts + s.openConflicts,
      criticalConflicts: acc.criticalConflicts + s.criticalConflicts,
      ambiguities: acc.ambiguities + s.openAmbiguities,
      missingAcceptance: acc.missingAcceptance + s.missingAcceptance,
      unowned: acc.unowned + s.unowned,
      highRisks: acc.highRisks + s.highRisks,
      gaps: acc.gaps + s.coverageGaps,
      documents: acc.documents + s.documents,
      words: acc.words + s.words,
    }),
    {
      requirements: 0, approved: 0, awaiting: 0, conflicts: 0, criticalConflicts: 0,
      ambiguities: 0, missingAcceptance: 0, unowned: 0, highRisks: 0, gaps: 0,
      documents: 0, words: 0,
    },
  );

  const reviewed = totals.requirements === 0 ? 0 : (totals.approved / totals.requirements) * 100;

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8">
      <div className="enter space-y-8">
        <PageHeader
          eyebrow="Executive overview"
          title="Requirements position across active engagements"
          description={`${formatNumber(totals.documents)} ingested documents and ${formatNumber(totals.words)} words of discovery material, analysed into ${formatNumber(totals.requirements)} candidate requirements. Every figure below links to the records behind it.`}
        />

        <section aria-labelledby="portfolio-metrics">
          <h2 id="portfolio-metrics" className="sr-only">
            Portfolio metrics
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Candidate requirements"
              value={formatNumber(totals.requirements)}
              reason={`Extracted from ${totals.documents} documents. None is authoritative until a person approves it.`}
              href={projects[0] ? `/app/projects/${projects[0].id}/requirements` : undefined}
            />
            <Stat
              label="Awaiting human review"
              value={formatNumber(totals.awaiting)}
              tone={totals.awaiting > 0 ? "high" : "positive"}
              reason={`${formatNumber(totals.approved)} approved so far. The register cannot be issued until this reaches zero.`}
              href={projects[0] ? `/app/projects/${projects[0].id}/requirements?status=proposed` : undefined}
            />
            <Stat
              label="Unresolved conflicts"
              value={formatNumber(totals.conflicts)}
              tone={totals.criticalConflicts > 0 ? "critical" : totals.conflicts > 0 ? "high" : "positive"}
              reason={`${totals.criticalConflicts} at high or critical severity. Each is a decision build will otherwise make by default.`}
              href={projects[0] ? `/app/projects/${projects[0].id}/conflicts` : undefined}
            />
            <Stat
              label="Binding without a test"
              value={formatNumber(totals.missingAcceptance)}
              tone={totals.missingAcceptance > 0 ? "high" : "positive"}
              reason="Must-have requirements with no acceptance criteria. Not acceptable or rejectable at UAT as written."
              href={projects[0] ? `/app/projects/${projects[0].id}/requirements?view=no-acceptance` : undefined}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Open quality findings"
              value={formatNumber(totals.ambiguities)}
              tone={totals.ambiguities > 0 ? "high" : "positive"}
              reason="Vague terms, unquantified thresholds and undefined actors found in the register."
              href={projects[0] ? `/app/projects/${projects[0].id}/requirements?view=findings` : undefined}
            />
            <Stat
              label="Requirements with no owner"
              value={formatNumber(totals.unowned)}
              tone={totals.unowned > 0 ? "high" : "positive"}
              reason="Nobody to agree acceptance criteria or sign the requirement off."
              href={projects[0] ? `/app/projects/${projects[0].id}/requirements?view=unowned` : undefined}
            />
            <Stat
              label="High or critical risks"
              value={formatNumber(totals.highRisks)}
              tone={totals.highRisks > 0 ? "critical" : "positive"}
              reason="Each derived from a conflict, a finding or a governance gap that already exists."
              href={projects[0] ? `/app/projects/${projects[0].id}/risks` : undefined}
            />
            <Stat
              label="Unspecified topics"
              value={formatNumber(totals.gaps)}
              tone={totals.gaps > 0 ? "high" : "positive"}
              reason="Areas this project has entered but never written a requirement for."
              href={projects[0] ? `/app/projects/${projects[0].id}/risks?view=gaps` : undefined}
            />
          </div>
        </section>

        <Card>
          <CardHeader
            title="Review progress"
            description="An extracted register is a proposal. Authority comes from a person having read each line."
          />
          <div className="px-5 py-5">
            <div className="flex items-baseline justify-between gap-4">
              <p data-numeric className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
                {reviewed.toFixed(0)}%
              </p>
              <p className="text-[12px] text-ink-muted">
                {formatNumber(totals.approved)} approved of {formatNumber(totals.requirements)}
              </p>
            </div>
            <div className="mt-3">
              <Meter value={reviewed} tone={reviewed > 70 ? "positive" : "brand"} label="Requirements approved" />
            </div>
          </div>
        </Card>

        <section aria-labelledby="engagements" className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow>Engagements</Eyebrow>
              <h2 id="engagements" className="mt-1.5 text-[16px] font-semibold tracking-[-0.015em] text-ink">
                Active delivery
              </h2>
            </div>
          </div>

          {summaries.map((summary) => (
            <article
              key={summary.project.id}
              className="rounded-lg border border-line bg-surface transition-colors duration-150 hover:border-edge"
            >
              <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/projects/${summary.project.id}`}
                      className="text-[16px] font-semibold tracking-[-0.015em] text-ink hover:text-brand-ink"
                    >
                      {summary.project.name}
                    </Link>
                    <Badge>{summary.project.key}</Badge>
                    <Badge tone="neutral">{summary.project.phase}</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-faint">{summary.project.client}</p>
                  <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
                    {summary.project.description}
                  </p>

                  <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                    {[
                      { label: "Requirements", value: summary.requirements, href: "requirements" },
                      { label: "Conflicts", value: summary.openConflicts, href: "conflicts", alert: summary.openConflicts > 0 },
                      { label: "Open risks", value: summary.openRisks, href: "risks", alert: summary.highRisks > 0 },
                      { label: "Documents", value: summary.documents, href: "documents" },
                    ].map((metric) => (
                      <div key={metric.label}>
                        <dt className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
                          {metric.label}
                        </dt>
                        <dd className="mt-1">
                          <Link
                            href={`/app/projects/${summary.project.id}/${metric.href}`}
                            data-numeric
                            className={`text-[19px] font-semibold tracking-[-0.02em] hover:underline ${
                              metric.alert ? "text-critical-ink" : "text-ink"
                            }`}
                          >
                            {formatNumber(metric.value)}
                          </Link>
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <p className="mt-5 text-[11.5px] text-ink-faint">
                    Scope baseline {formatDate(summary.project.baselineDate)} &middot; {summary.postBaseline}{" "}
                    requirements added since &middot; {summary.stakeholders} stakeholders
                  </p>
                </div>

                <div className="flex flex-col items-start gap-4 border-t border-line pt-5 lg:items-center lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <HealthDial health={summary.health} />
                  <LinkButton href={`/app/projects/${summary.project.id}`} variant="primary">
                    Open workspace
                  </LinkButton>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
