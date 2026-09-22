import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import {
  getProjectSummary,
  listConflicts,
  listProjectAmbiguities,
  listProjects,
  listCoverageGaps,
  listRequirements,
  listRisks,
} from "@/lib/queries";
import { COVERAGE_AREA_COUNT } from "@/lib/ai/engine/coverage";
import {
  BINDS_ON_LABEL,
  CONFLICT_KIND_LABEL,
  REQUIREMENT_TYPE_LABEL,
  type Provenance,
  type RequirementType,
} from "@/lib/types";
import {
  Badge,
  Eyebrow,
  LinkButton,
  Meter,
  ProvenanceTag,
  buttonClass,
  formatNumber,
} from "@/components/ui";
import {
  AnnotatedStatement,
  BarRows,
  ConflictTimeline,
  CoverageGrid,
  EngineSplit,
  PipelineFlow,
  SeverityRows,
  TraceChain,
  type BarDatum,
  type FlowStage,
} from "@/components/landing-visuals";
import { ConflictDemo } from "@/components/conflict-demo";

export const metadata: Metadata = {
  title: "RequireIQ - Find the requirements your project cannot afford to miss",
};


const FINDING_LABEL: Record<string, string> = {
  unquantified: "Unquantified threshold",
  missing_acceptance_criteria: "No acceptance criteria",
  vague_term: "Vague term",
  compound: "Compound requirement",
  undefined_actor: "Undefined actor",
  unverified_assumption: "Unverified assumption",
  reported_speech: "Reported speech",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

const PROVENANCE_HINT: Record<Provenance, string> = {
  source: "Verbatim from a document",
  ai_analysis: "A machine reading",
  ai_suggestion: "A proposal, never applied on its own",
  human: "Entered or confirmed by a person",
};

/** Counts a list into descending-magnitude bar data. */
function tally<T>(rows: T[], key: (row: T) => string, label: (k: string) => string): BarDatum[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, value]) => ({ label: label(k), value }));
}

/**
 * Read per request, like the dashboard, because the figures at the foot of the
 * page are counted from the same database a reviewer can change. A statically
 * prerendered landing page would keep advertising the counts that happened to
 * be true at build time.
 */
export const dynamic = "force-dynamic";

export default function LandingPage() {
  const [firstProject] = listProjects();
  const demo = firstProject ? getProjectSummary(firstProject.id) : null;

  // Every figure below is counted here, from the same tables the register
  // reads. Nothing on this page is a number someone typed into a marketing
  // deck - reseed the demo and the charts follow it.
  const projectId = firstProject?.id;
  const requirements = projectId ? listRequirements(projectId) : [];
  const findings = projectId ? listProjectAmbiguities(projectId).filter((a) => !a.resolved) : [];
  const conflicts = projectId ? listConflicts(projectId, "open") : [];
  const risks = projectId ? listRisks(projectId).filter((r) => r.status === "open") : [];

  const typeBars = tally(
    requirements,
    (r) => r.type,
    (k) => REQUIREMENT_TYPE_LABEL[k as RequirementType] ?? k,
  );
  const findingBars = tally(
    findings,
    (f) => f.kind,
    (k) => FINDING_LABEL[k] ?? k,
  );

  const conflictKindBars = tally(
    conflicts,
    (c) => c.kind,
    (k) => CONFLICT_KIND_LABEL[k as keyof typeof CONFLICT_KIND_LABEL] ?? k,
  );

  const gapAreas = (projectId ? listCoverageGaps(projectId) : [])
    .filter((gap) => gap.status === "open")
    .map((gap) => gap.area);

  // A real finding on a real sentence, sliced at the stored offsets. Shown
  // only if one exists, because fabricating an example on this particular page
  // would be self-defeating.
  const vagueFinding = findings.find((f) => f.kind === "vague_term");
  const vagueRequirement = vagueFinding
    ? requirements.find((r) => r.id === vagueFinding.requirementId)
    : undefined;
  const sample =
    vagueFinding && vagueRequirement
      ? {
          reference: vagueRequirement.ref,
          statement: vagueRequirement.statement,
          start: vagueFinding.spanStart,
          end: vagueFinding.spanEnd,
          note: vagueFinding.explanation,
          suggestion: vagueFinding.suggestion,
        }
      : null;

  const severityOf = (rows: Array<{ severity: string }>) =>
    SEVERITY_ORDER.map((severity) => ({
      severity,
      value: rows.filter((r) => r.severity === severity).length,
    })).filter((band) => band.value > 0);

  const stages: FlowStage[] = [
    {
      stage: "Ingest",
      value: String(demo?.documents ?? 0),
      unit: "documents",
      detail: "Transcripts, notes, email, specifications and policy extracts.",
    },
    {
      stage: "Extract",
      value: formatNumber(demo?.requirements ?? 0),
      unit: "obligations",
      detail: `Lifted verbatim from ${formatNumber(demo?.words ?? 0)} words, offsets kept.`,
    },
    {
      stage: "Classify",
      value: String(typeBars.length),
      unit: "types in use",
      detail: "Type and MoSCoW priority, read from the modal verb.",
    },
    {
      stage: "Analyse",
      value: String(findings.length),
      unit: "quality findings",
      detail: "Vague terms, unquantified thresholds, missing criteria.",
    },
    {
      stage: "Cross-check",
      value: String(conflicts.length),
      unit: "conflicts",
      detail: "Five detectors, run across documents rather than within one.",
    },
    {
      stage: "Review",
      value: `${demo?.approved ?? 0}`,
      unit: `approved of ${demo?.requirements ?? 0}`,
      detail: "Nothing becomes authoritative until a person says so.",
    },
    {
      stage: "Export",
      value: "6",
      unit: "deliverables",
      detail: "Register, conflicts, risks, traceability, gaps, change log.",
    },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-2" aria-label="Primary">
            <a href="#how" className={buttonClass("ghost", "hidden sm:inline-flex")}>
              How it works
            </a>
            <LinkButton href="/app" variant="primary">
              Open the workspace
            </LinkButton>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="border-b border-line">
          {/* Two columns from lg: the claim on the left, the product making it
              on the right. The right column used to be empty, which made the
              page read as a brochure for a tool that does arithmetic without
              ever doing any. */}
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
            <div>
              <Badge tone="brand">Requirements intelligence for enterprise delivery</Badge>
              <h1 className="mt-6 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[42px]">
                Find the requirements your project cannot afford to miss.
              </h1>
              <p className="mt-5 text-[15.5px] leading-relaxed text-ink-muted">
                Discovery produces hundreds of pages of transcripts, notes and email. The requirements are in
                there, and so are the contradictions between them. RequireIQ turns that material into a
                structured, traceable register and puts the statements that disagree on the same page, while
                changing them still costs a conversation rather than a quarter.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LinkButton href="/app" variant="primary" className="px-4 py-2 text-[13.5px]">
                  Open the demo engagement
                </LinkButton>
                <Link href="#scenario" className={buttonClass("secondary", "px-4 py-2 text-[13.5px]")}>
                  See the scenario
                </Link>
              </div>
              <p className="mt-5 text-[12px] text-ink-faint">
                Loaded with a complete worked engagement. Runs offline with no API key.
              </p>
            </div>

            <div>
              <ConflictDemo />
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
                This is the real detector, not a mock-up. Move either figure and the same function the
                register calls recalculates in your browser.
              </p>
            </div>
          </div>
        </section>

        {/* The scenario */}
        <section id="scenario" className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <Eyebrow>The failure this prevents</Eyebrow>
            <div className="mt-3">
              <div>
                <h2 className="max-w-2xl text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  Two sentences, eleven weeks apart, in documents nobody read together.
                </h2>
                {/* The argument as a picture before it is made in words: two
                    marks on one axis, eleven weeks of nothing between them. */}
                <div className="mt-6">
                  <ConflictTimeline
                    spanLabel="11 weeks apart · never read together"
                    marks={[
                      {
                        at: 0.12,
                        date: "19 June",
                        source: "Finance email",
                        statement: "Infrastructure spend must not exceed $200,000",
                        tone: "high",
                      },
                      {
                        at: 0.88,
                        date: "9 July",
                        source: "Workshop 07 transcript",
                        statement: "The platform must support 10,000 concurrent users",
                        tone: "brand",
                      },
                    ]}
                  >
                    <p className="border-t border-line pt-4 text-[12px] leading-relaxed text-ink-faint">
                      Different authors, different functions, different documents. The two statements below
                      are the marks on that axis.
                    </p>
                  </ConflictTimeline>
                </div>

                {/* Side by side, because that is the entire argument: neither
                    author saw the other, and no keyword search connects them. */}
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <blockquote className="rounded-md border-l-2 border-brand bg-raised px-4 py-3">
                    <p className="text-[13.5px] leading-relaxed text-ink">
                      &ldquo;The platform must support 10,000 concurrent users during the Monday morning
                      peak.&rdquo;
                    </p>
                    <footer className="mt-2 text-[11.5px] text-ink-faint">
                      Workshop 07 transcript, Platform Engineering Lead &middot; 9 July
                    </footer>
                  </blockquote>
                  <blockquote className="rounded-md border-l-2 border-high bg-raised px-4 py-3">
                    <p className="text-[13.5px] leading-relaxed text-ink">
                      &ldquo;Infrastructure spend for the onboarding platform must not exceed $200,000 in the
                      first twelve months of operation.&rdquo;
                    </p>
                    <footer className="mt-2 text-[11.5px] text-ink-faint">
                      Finance email, Finance Business Partner &middot; 19 June
                    </footer>
                  </blockquote>
                </div>
                <p className="mt-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-muted">
                  Both are reasonable. Neither author saw the other. They share no vocabulary, so no keyword
                  search connects them. The contradiction surfaces three months into build, when the
                  architecture is already committed and the answer costs a six-week delay and a rework bill.
                </p>
                <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-faint">
                  Catching it means comparing quantities across the whole corpus — which is the calculation
                  running at the top of this page.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section id="how" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <Eyebrow>The pipeline</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-[22px] font-semibold tracking-[-0.02em] text-ink">
              Unstructured material in, a reviewable register out. Nothing skips the human.
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-faint">
              The figures are this engagement&rsquo;s, counted live at each stage.
            </p>
            <div className="mt-8">
              <PipelineFlow stages={stages} />
            </div>
          </div>
        </section>

        {/* What the register looks like once the pipeline has run */}
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <Eyebrow>The register it produced</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-[22px] font-semibold tracking-[-0.02em] text-ink">
              Eighty-two obligations, and the shape of what is wrong with them.
            </h2>

            <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-3">
              <div className="bg-surface p-5">
                <p className="text-[12.5px] font-semibold text-ink">Requirements by type</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                  Read from the modal verb and the subject, not assigned by hand.
                </p>
                {/* One hue for every bar: the category is the axis label, so
                    spending colour on it too would encode length twice. */}
                <BarRows className="mt-4" data={typeBars} unit="requirements" />
              </div>

              <div className="bg-surface p-5">
                <p className="text-[12.5px] font-semibold text-ink">Quality findings by kind</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                  Each names the exact span that triggered it and proposes a measurable rewrite.
                </p>
                <BarRows className="mt-4" data={findingBars} unit="findings" />

                <p className="mt-6 text-[12.5px] font-semibold text-ink">Who each obligation binds</p>
                <BarRows
                  className="mt-3"
                  data={tally(
                    requirements,
                    (r) => r.bindsOn,
                    (k) => BINDS_ON_LABEL[k as keyof typeof BINDS_ON_LABEL] ?? k,
                  )}
                  unit="requirements"
                />
              </div>

              <div className="bg-surface p-5">
                {/* Severity is written as a word on its own track. Orange and
                    yellow are too close to carry the reading on their own. */}
                <p className="text-[12.5px] font-semibold text-ink">Open conflicts by severity</p>
                <div className="mt-4">
                  <SeverityRows data={severityOf(conflicts)} />
                </div>

                <p className="mt-6 text-[12.5px] font-semibold text-ink">Open risks by severity</p>
                <div className="mt-4">
                  <SeverityRows data={severityOf(risks)} />
                </div>

                <div className="mt-6 border-t border-line pt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[12.5px] font-semibold text-ink">Human review</p>
                    <p data-numeric className="text-[12px] text-ink-muted">
                      {demo?.approved ?? 0} of {demo?.requirements ?? 0} approved
                    </p>
                  </div>
                  <div className="mt-2.5">
                    <Meter
                      value={demo?.approved ?? 0}
                      max={demo?.requirements ?? 1}
                      tone="positive"
                      label={`${demo?.approved ?? 0} of ${demo?.requirements ?? 0} requirements approved`}
                    />
                  </div>
                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
                    An extracted register is a proposal. The bar is empty because nobody has signed anything
                    off yet — which is the honest state of a register on day one.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <Eyebrow>What it actually does</Eyebrow>
            {/* Without this the document went h1 -> h3 and a screen-reader
                user skipping by heading lost the section boundary. */}
            <h2 className="mt-3 max-w-2xl text-[22px] font-semibold tracking-[-0.02em] text-ink">
              Four things, each one checkable against the record behind it.
            </h2>
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {/* Each card carries the artifact rather than a description of
                  it: the detectors with what they actually caught, a real
                  finding on a real sentence, the trace hops, the checklist.
                  The prose that used to sit here said the same things less
                  convincingly and at four times the length. */}
              <article className="rounded-lg border border-line bg-raised p-6">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  Conflicts nobody puts side by side
                </h3>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                  Five detectors compare every record against every other, across documents rather than
                  within one.
                </p>
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-[11.5px] text-ink-faint">What fired on this engagement</p>
                  <BarRows className="mt-3" data={conflictKindBars} unit="conflicts" />
                </div>
              </article>

              <article className="rounded-lg border border-line bg-raised p-6">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  Ambiguity with a measurable rewrite
                </h3>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                  A finding names the exact span that triggered it and proposes a clause you could test.
                  Applying it is a human action.
                </p>
                <div className="mt-4">
                  {sample ? (
                    <AnnotatedStatement
                      reference={sample.reference}
                      statement={sample.statement}
                      start={sample.start}
                      end={sample.end}
                      note={sample.note}
                      suggestion={sample.suggestion}
                    />
                  ) : null}
                </div>
              </article>

              <article className="rounded-lg border border-line bg-raised p-6">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  Traceability that survives an audit
                </h3>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                  Every record can be walked back to the character range it came from, and the person who
                  said it.
                </p>
                <div className="mt-4 border-t border-line pt-4">
                  <TraceChain
                    steps={["Requirement", "Source sentence", "Document", "Offsets", "Stakeholder", "Decision"]}
                  />
                </div>
              </article>

              <article className="rounded-lg border border-line bg-raised p-6">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  The register nobody wrote
                </h3>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                  Areas a comparable engagement carries that this one entered but never specified. Reported
                  by checklist, never generated, so a gap is a real absence.
                </p>
                <div className="mt-4 border-t border-line pt-4">
                  <CoverageGrid flagged={gapAreas} total={COVERAGE_AREA_COUNT} />
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Honesty */}
        <section className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <Eyebrow>Where the intelligence comes from</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-[22px] font-semibold tracking-[-0.02em] text-ink">
              Deterministic by default, and explicit about which half is which.
            </h2>
            <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-ink-muted">
              A requirements tool has to cite exact character offsets in a client document and produce an
              audit trail that holds up months later. A sampled model is a poor fit for both, so the analysis
              does not use one — and the page says plainly where the line falls.
            </p>

            {/* Drawn rather than described: the claim is that the optional
                hosted model touches nothing in the analysis path, and a
                boundary is a picture, not a paragraph. */}
            <div className="mt-8">
              <EngineSplit stages={stages.map((s) => s.stage)} />
            </div>

            <div className="mt-6 rounded-lg border border-line bg-surface p-5">
              <p className="text-[12.5px] font-semibold text-ink">
                Every record says how it came to exist
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                These are the actual chips the product renders, not a key drawn for this page.
              </p>
              <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                {(["source", "ai_analysis", "ai_suggestion", "human"] as Provenance[]).map((provenance) => (
                  <li key={provenance} className="flex items-center gap-2">
                    <ProvenanceTag provenance={provenance} />
                    <span className="text-[11.5px] text-ink-faint">{PROVENANCE_HINT[provenance]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
                The demo engagement is already loaded.
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-muted">
                A worked replacement of a bank&rsquo;s branch-first account origination, with a guided
                walkthrough that gets to the point in about three minutes.
              </p>
            </div>

            {/* Counted from the database at request time, and each one links to
                the screen that would let a reader act on it. Hardcoding these
                would put the landing page and the register one seed apart from
                disagreeing with each other. */}
            {demo ? (
              <ul className="mx-auto mt-9 grid max-w-4xl gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { value: demo.documents, label: "Documents ingested", href: "/documents" },
                  { value: demo.requirements, label: "Requirements extracted", href: "/requirements" },
                  { value: demo.openConflicts, label: "Cross-document conflicts", href: "/conflicts" },
                  { value: demo.openAmbiguities, label: "Open quality findings", href: "/requirements?view=findings" },
                ].map((stat) => (
                  <li key={stat.label} className="bg-surface">
                    <Link
                      href={`/app/projects/${demo.project.id}${stat.href}`}
                      className="block px-5 py-5 text-center transition-colors hover:bg-hover"
                    >
                      <span
                        data-numeric
                        className="block text-[26px] font-semibold tracking-[-0.02em] text-ink"
                      >
                        {formatNumber(stat.value)}
                      </span>
                      <span className="mt-1 block text-[11.5px] text-ink-muted">{stat.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-9 flex justify-center">
              <LinkButton href="/app" variant="primary" className="px-4 py-2 text-[13.5px]">
                Open the workspace
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11.5px] text-ink-faint sm:px-8">
          <p>
            RequireIQ. The Meridian Bank engagement, its stakeholders and its documents are fictional
            demonstration data.
          </p>
          <Link href="/app" className="hover:text-ink-muted">
            Workspace
          </Link>
        </div>
      </footer>
    </div>
  );
}
