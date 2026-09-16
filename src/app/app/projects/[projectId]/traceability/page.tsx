import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProject, getTraceability } from "@/lib/queries";
import { REQUIREMENT_TYPE_LABEL } from "@/lib/types";
import {
  Badge,
  Card,
  CardHeader,
  Eyebrow,
  PageHeader,
  Ref,
  StatusBadge,
  TableFrame,
  Td,
  Th,
  formatDate,
} from "@/components/ui";

export const metadata: Metadata = { title: "Traceability" };

/**
 * The traceability matrix.
 *
 * Requirement, source sentence, document, workshop or email, stakeholder,
 * downstream findings. It exists to answer four questions a client asks and a
 * consultancy usually cannot: where did this come from, who asked for it, what
 * evidence supports it, and what else depends on it.
 */
export default async function TraceabilityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const rows = getTraceability(projectId);
  const base = `/app/projects/${projectId}`;
  const traced = rows.filter((row) => row.evidence.length > 0).length;
  const attributed = rows.filter((row) => row.evidence[0]?.stakeholderName).length;

  return (
    <main id="main" className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Register"
          title="Traceability matrix"
          description="Every requirement, back to the sentence it came from and the person who said it, and forward to the findings and conflicts it produced."
        />

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Requirements", rows.length, "text-ink"],
            ["Traced to a source", traced, traced === rows.length ? "text-positive" : "text-high"],
            ["Attributed to a person", attributed, attributed === rows.length ? "text-positive" : "text-high"],
            ["Involved in a conflict", rows.filter((r) => r.conflictRefs.length > 0).length, "text-high"],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-lg border border-line bg-surface px-4 py-3">
              <Eyebrow>{label as string}</Eyebrow>
              <p data-numeric className={`mt-1.5 text-[22px] font-semibold tracking-[-0.03em] ${tone as string}`}>
                {value as number}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader
            title="Requirement to source to stakeholder"
            description="Character offsets are recorded against every citation, so a quote can always be checked against the original."
          />
          <TableFrame className="max-h-[70vh] overflow-y-auto" minWidth={1180}>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <Th className="w-[86px]">Ref</Th>
                <Th className="min-w-[280px]">Requirement</Th>
                <Th className="min-w-[300px]">Source sentence</Th>
                <Th className="w-[190px]">Document and position</Th>
                <Th className="w-[150px]">Requested by</Th>
                <Th className="w-[130px]">Downstream</Th>
                <Th className="w-[120px]">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const evidence = row.evidence[0];
                return (
                  <tr key={row.requirement.id} className="group transition-colors hover:bg-raised">
                    <Td>
                      <Link href={`${base}/requirements/${row.requirement.id}`}>
                        <Ref className="group-hover:text-brand-ink">{row.requirement.ref}</Ref>
                      </Link>
                    </Td>
                    <Td className="max-w-sm">
                      <p className="text-[12px] leading-snug text-ink">{row.requirement.statement}</p>
                      <Badge className="mt-1.5">{REQUIREMENT_TYPE_LABEL[row.requirement.type]}</Badge>
                    </Td>
                    <Td className="max-w-md">
                      {evidence ? (
                        <p className="border-l-2 border-prov-source pl-2.5 text-[11.5px] italic leading-snug text-ink-muted">
                          &ldquo;{evidence.quote}&rdquo;
                        </p>
                      ) : (
                        <span className="text-[11.5px] text-critical">No source recorded</span>
                      )}
                    </Td>
                    <Td>
                      {evidence ? (
                        <>
                          <Link
                            href={`${base}/documents/${evidence.documentId}#chunk-${evidence.chunkId ?? ""}`}
                            className="text-[11.5px] text-ink-muted hover:text-brand-ink hover:underline"
                          >
                            {evidence.documentTitle}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-ink-faint">{evidence.locator}</p>
                          <p className="mt-0.5 font-mono text-[10.5px] text-ink-faint">
                            chars {evidence.startOffset}&ndash;{evidence.endOffset}
                          </p>
                          <p className="mt-0.5 text-[10.5px] text-ink-faint">
                            {formatDate(evidence.capturedAt)}
                          </p>
                        </>
                      ) : null}
                    </Td>
                    <Td>
                      {row.owner ? (
                        <>
                          <p className="text-[11.5px] text-ink">{row.owner.name}</p>
                          <p className="mt-0.5 text-[11px] text-ink-faint">{row.owner.role}</p>
                          <Badge className="mt-1">{row.owner.team}</Badge>
                        </>
                      ) : (
                        <Badge tone="high">No owner</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {row.conflictRefs.map((ref) => (
                          <Badge key={ref} tone="critical">
                            {ref}
                          </Badge>
                        ))}
                        {row.findingCount > 0 ? (
                          <Badge tone="high">{row.findingCount} findings</Badge>
                        ) : null}
                        {row.relatedCount > 0 ? <Badge>{row.relatedCount} links</Badge> : null}
                        {row.conflictRefs.length === 0 && row.findingCount === 0 && row.relatedCount === 0 ? (
                          <span className="text-[11px] text-ink-faint">Clean</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={row.requirement.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        </Card>

        <Card className="p-5">
          <Eyebrow>Why offsets are recorded</Eyebrow>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-muted">
            A citation that names a document is a claim. A citation that names a character range is checkable.
            Because the extractor lifts obligation sentences verbatim rather than rewriting them, every quote in
            this table can be sliced straight back out of the stored source text - which is exactly what the
            test suite does, on every requirement, on every run.
          </p>
        </Card>
      </div>
    </main>
  );
}
