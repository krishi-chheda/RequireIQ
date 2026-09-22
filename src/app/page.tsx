import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { Badge, Eyebrow, LinkButton, buttonClass } from "@/components/ui";
import { ConflictDemo } from "@/components/conflict-demo";

export const metadata: Metadata = {
  title: "RequireIQ - Find the requirements your project cannot afford to miss",
};

const PIPELINE = [
  {
    stage: "Ingest",
    detail: "Transcripts, meeting notes, email threads, specifications and policy extracts.",
  },
  { stage: "Extract", detail: "Obligation sentences lifted verbatim, with character offsets kept." },
  { stage: "Classify", detail: "Nine requirement types and MoSCoW priority, read from the modal verb." },
  { stage: "Analyse", detail: "Vague terms, unquantified thresholds and missing acceptance criteria." },
  { stage: "Cross-check", detail: "Five conflict detectors run across every document, not within one." },
  { stage: "Review", detail: "A person approves, edits or rejects. Nothing becomes authoritative on its own." },
  { stage: "Export", detail: "Register, conflict report, risk report, traceability matrix, change log." },
];

/**
 * Each card opens onto a real record from the demo engagement rather than an
 * illustration of one. The conflict references, the vague-term rewrite and the
 * coverage areas below are all values the engine actually produces.
 */
const CAPABILITIES = [
  {
    title: "Conflicts nobody puts side by side",
    body:
      "A capacity target in a workshop transcript and a spend cap in a week-two finance email are never read on the same page. Five detectors compare quantities, opposing obligations, availability against recovery, committed dates against the periods that must precede them, and duplicate statements that disagree.",
    proof: "10,000 concurrent users vs a $200,000 infrastructure cap, with the sizing arithmetic shown line by line.",
    more: {
      label: "The seven it found in the demo engagement",
      items: [
        "CFL-01 — 99.99% availability target against a 4 hour recovery time objective.",
        "CFL-02 — Capacity target of 10,000 concurrent users against a $200,000 spend cap.",
        "CFL-03 — Committed date of 2 March 2027 against a stated four month dependency.",
        "CFL-05 — Retention of seven years against a deletion obligation of 30 days for overlapping data.",
        "CFL-06 — The same requirement stated twice with different durations: 12 months and seven years.",
      ],
    },
  },
  {
    title: "Ambiguity with a measurable rewrite",
    body:
      "\"Fast response time\" is flagged with the exact span that triggered it, an explanation in the vocabulary of ISO/IEC/IEEE 29148, and a concrete alternative. The rewrite is a suggestion; applying it is a human action that is recorded.",
    proof: "37 vague-term patterns, each paired with the measurable clause it is missing.",
    more: {
      label: "What a finding looks like",
      items: [
        "Term — \"fast\". Missing: a latency threshold.",
        "Why — the phrase states an intent without a threshold, so two reviewers can agree the requirement is met and disagree about what was built.",
        "Suggested rewrite — \"return 95% of API responses within 500ms under normal operating load\".",
        "Applying it is a human action, recorded in the audit trail. The product never edits a client's wording on its own.",
      ],
    },
  },
  {
    title: "Traceability that survives an audit",
    body:
      "Every requirement carries the character range in the document it came from, the workshop or email it was captured in, and the person who said it. Provenance is rendered on every record: source evidence, machine reading, proposal, or human-authored.",
    proof: "Requirement to source sentence to document to stakeholder to decision, in one view.",
    more: {
      label: "The four provenance labels",
      items: [
        "source — verbatim text present in an ingested document.",
        "ai_analysis — a machine reading of source text. Traceable to evidence, not authoritative.",
        "ai_suggestion — a proposal. Nothing is applied without a human action.",
        "human — entered or confirmed by a named person.",
      ],
    },
  },
  {
    title: "The register nobody wrote",
    body:
      "Coverage gaps report what a comparable engagement carries that this one has entered but never specified: failure behaviour of external dependencies, cutover of in-flight applications, backout of a failed release.",
    proof: "Reported by checklist, never generated, so a gap is a real absence rather than an invention.",
    more: {
      label: "Areas checked, and unspecified here",
      items: [
        "Failure behaviour of external dependencies.",
        "Data migration from the incumbent platform.",
        "Disposal period for raw identity document images.",
        "Rollback and release backout.",
        "Joint and multi-party applications.",
      ],
    },
  },
];

export default function LandingPage() {
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
            <div className="mt-6">
              <div>
                <h2 className="max-w-2xl text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  Two sentences, eleven weeks apart, in documents nobody read together.
                </h2>
                {/* Side by side, because that is the entire argument: neither
                    author saw the other, and no keyword search connects them. */}
                <div className="mt-6 grid gap-3 lg:grid-cols-2">
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
            <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE.map((step, index) => (
                <li key={step.stage} className="bg-surface p-5">
                  <span data-numeric className="font-mono text-[11px] text-brand-ink">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-2 text-[13.5px] font-semibold text-ink">{step.stage}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <Eyebrow>What it actually does</Eyebrow>
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {/* `<details>` rather than a state hook: it opens without
                  JavaScript, is keyboard operable and announced correctly for
                  free, and keeps this page a server component. */}
              {CAPABILITIES.map((item) => (
                <article
                  key={item.title}
                  className="rounded-lg border border-line bg-raised p-6 transition-colors duration-150 hover:border-edge"
                >
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{item.title}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
                  <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-faint">
                    {item.proof}
                  </p>
                  <details className="group mt-3">
                    <summary className="cursor-pointer list-none text-[12px] font-medium text-brand-ink transition-colors hover:text-ink">
                      <span className="group-open:hidden">{item.more.label}</span>
                      <span className="hidden group-open:inline">Hide</span>
                    </summary>
                    <ul className="mt-3 space-y-2 border-t border-line pt-3">
                      {item.more.items.map((entry) => (
                        <li
                          key={entry}
                          className="border-l border-edge pl-3 text-[12px] leading-relaxed text-ink-muted"
                        >
                          {entry}
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Honesty */}
        <section className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
              <div>
                <Eyebrow>Where the intelligence comes from</Eyebrow>
                <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  Deterministic by default, and explicit about it.
                </h2>
              </div>
              <div className="space-y-4 text-[13px] leading-relaxed text-ink-muted">
                <p>
                  Extraction, classification, quality analysis and conflict detection run on a local rule and
                  statistics engine. No model call, no credential, and the same corpus produces the same
                  register every time. That is not a limitation dressed up as a feature: a requirements tool
                  has to cite exact character offsets in a client document and produce an audit trail that
                  holds up months later, and a sampled model is a poor fit for both.
                </p>
                <p>
                  A hosted model can be enabled for free-form question answering only, where it helps and
                  where every answer is rendered next to the records it was drawn from. The interface it
                  implements is the same one the local engine implements, so swapping it changes no screen.
                </p>
                <p className="text-ink-faint">
                  Every record in the product is labelled with how it came to exist: source evidence, machine
                  reading, proposal, or human-authored. When the evidence does not support an answer, the
                  product says so instead of producing one.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-5 py-16 text-center sm:px-8">
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
              The demo engagement is already loaded.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-muted">
              Fifteen documents, eighty-two extracted requirements, seven cross-document conflicts and a guided
              walkthrough that gets to the point in about three minutes.
            </p>
            <div className="mt-7 flex justify-center">
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
