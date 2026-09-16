import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getConflictSide, getProject, listConflicts } from "@/lib/queries";
import { CONFLICT_KIND_LABEL, CONFLICT_STATUS_LABEL } from "@/lib/types";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Eyebrow,
  PageHeader,
  Ref,
  SeverityBadge,
  formatNumber,
} from "@/components/ui";

export const metadata: Metadata = { title: "Conflicts" };

/**
 * The conflict queue.
 *
 * Open work first, worst first. Each row shows both sides of the tension in the
 * list itself, because the whole point is that the two statements have never
 * been read together - making a reader click through to see the pairing would
 * reproduce the problem the product exists to solve.
 */
export default async function ConflictsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const conflicts = listConflicts(projectId);
  const open = conflicts.filter((c) => c.status === "open" || c.status === "needs_clarification");
  const closed = conflicts.filter((c) => c.status !== "open" && c.status !== "needs_clarification");
  const base = `/app/projects/${projectId}`;

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Findings"
          title="Cross-document conflicts"
          description="Five detectors compare every requirement and constraint against every other, across documents. Each finding is a tension to validate, never a verdict - the product does not know your engineering context well enough to declare something impossible."
        />

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Open", value: open.length, tone: open.length ? "text-critical" : "text-positive" },
            {
              label: "High or critical",
              value: open.filter((c) => c.severity === "high" || c.severity === "critical").length,
              tone: "text-high",
            },
            { label: "Resolved", value: closed.length, tone: "text-positive" },
            { label: "Detectors run", value: 5, tone: "text-ink" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-line bg-surface px-4 py-3">
              <Eyebrow>{stat.label}</Eyebrow>
              <p data-numeric className={`mt-1.5 text-[22px] font-semibold tracking-[-0.03em] ${stat.tone}`}>
                {formatNumber(stat.value)}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader
            title="Open"
            description="Each of these is a decision the build team will otherwise make by default."
          />
          {open.length === 0 ? (
            <EmptyState
              title="No open conflicts"
              description="Every detected conflict has been accepted, dismissed or resolved. New conflicts appear here when documents are ingested or requirements are edited."
            />
          ) : (
            <ul className="divide-y divide-line">
              {open.map((conflict) => (
                <ConflictRow key={conflict.id} conflict={conflict} base={base} />
              ))}
            </ul>
          )}
        </Card>

        {closed.length > 0 ? (
          <Card>
            <CardHeader title="Closed" description="Kept for the audit trail. Nothing is deleted." />
            <ul className="divide-y divide-line">
              {closed.map((conflict) => (
                <ConflictRow key={conflict.id} conflict={conflict} base={base} muted />
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="p-5">
          <Eyebrow>The five detectors</Eyebrow>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [
                "Capacity versus budget",
                "Sizes a stated capacity target against a stated spend cap using a published heuristic, and shows every input.",
              ],
              [
                "Opposing obligations",
                "Finds retention and deletion rules over the same class of data with materially different periods.",
              ],
              [
                "Availability versus recovery",
                "Converts an availability percentage into its monthly downtime budget and compares it with the stated recovery time.",
              ],
              [
                "Fixed date versus preceding duration",
                "Checks a committed date against periods that must elapse before it can be met.",
              ],
              [
                "Topical overlap with divergent quantity",
                "Finds statements clearly about the same characteristic that give it different values.",
              ],
              [
                "What none of them do",
                "Declare anything impossible. Every finding carries the question a human has to go and answer.",
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="text-[12.5px] font-medium text-ink">{title}</dt>
                <dd className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{body}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </main>
  );
}

function ConflictRow({
  conflict,
  base,
  muted = false,
}: {
  conflict: ReturnType<typeof listConflicts>[number];
  base: string;
  muted?: boolean;
}) {
  const left = getConflictSide(conflict.leftType, conflict.leftId);
  const right = getConflictSide(conflict.rightType, conflict.rightId);

  return (
    <li className={muted ? "opacity-60" : undefined}>
      <Link
        href={`${base}/conflicts/${conflict.id}`}
        className="block px-5 py-4 transition-colors hover:bg-raised"
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={conflict.severity} />
          <Ref>{conflict.ref}</Ref>
          <Badge>{CONFLICT_KIND_LABEL[conflict.kind]}</Badge>
          <Badge tone={conflict.status === "open" ? "neutral" : "positive"}>
            {CONFLICT_STATUS_LABEL[conflict.status]}
          </Badge>
          <span className="ml-auto text-[11.5px] text-ink-faint">
            {Math.round(conflict.confidence * 100)}% detector confidence
          </span>
        </div>

        <p className="mt-2.5 text-[13.5px] font-medium leading-snug text-ink">{conflict.title}</p>

        {/* Both statements, side by side. This pairing is the product. */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[left, right].map((side, index) =>
            side ? (
              <div
                key={side.id}
                className={`rounded-sm border-l-2 bg-raised px-3 py-2 ${
                  index === 0 ? "border-brand" : "border-high"
                }`}
              >
                <Ref className="text-[10.5px]">{side.ref}</Ref>
                <p className="mt-1 text-[12px] leading-snug text-ink-muted">{side.statement}</p>
              </div>
            ) : null,
          )}
        </div>

        <p className="mt-2.5 text-[11.5px] text-ink-faint">
          {conflict.detector} &middot; affects {conflict.impactedTeams}
        </p>
      </Link>
    </li>
  );
}
