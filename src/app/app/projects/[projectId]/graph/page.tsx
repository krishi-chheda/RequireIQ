import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGraph, getProject } from "@/lib/queries";
import { RELATIONSHIP_LABEL } from "@/lib/types";
import { RequirementGraph } from "@/components/graph";
import { Card, EmptyState, Eyebrow, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Relationship graph" };

export default async function GraphPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const { nodes, edges } = getGraph(projectId);
  const byKind = edges.reduce<Map<string, number>>(
    (map, edge) => map.set(edge.kind, (map.get(edge.kind) ?? 0) + 1),
    new Map(),
  );

  return (
    <main id="main" className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Register"
          title="Relationship graph"
          description="Where the register is entangled. Only records that actually participate in a relationship are drawn, and every edge carries the reason it exists."
        />

        {nodes.length === 0 ? (
          <Card>
            <EmptyState
              title="No relationships inferred yet"
              description="Relationships appear once the register contains statements with enough shared vocabulary to link. Ingest more documents, or check that extraction has run."
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-line bg-surface px-4 py-3">
                <Eyebrow>Connected records</Eyebrow>
                <p data-numeric className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-ink">
                  {nodes.length}
                </p>
              </div>
              {[...byKind.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([kind, count]) => (
                  <div key={kind} className="rounded-lg border border-line bg-surface px-4 py-3">
                    <Eyebrow>{RELATIONSHIP_LABEL[kind as keyof typeof RELATIONSHIP_LABEL]}</Eyebrow>
                    <p
                      data-numeric
                      className={`mt-1.5 text-[22px] font-semibold tracking-[-0.03em] ${
                        kind === "contradicts" ? "text-critical-ink" : "text-ink"
                      }`}
                    >
                      {count}
                    </p>
                  </div>
                ))}
            </div>

            <RequirementGraph nodes={nodes} edges={edges} projectId={projectId} />

            <Card className="p-5">
              <Eyebrow>What this graph is for</Eyebrow>
              <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-muted">
                Impact analysis. When a requirement changes - and the capacity target in this engagement is
                going to change - the question is what else moves with it. The red edges are the ones that
                matter most: those are the pairs a detector believes cannot both be satisfied as written.
              </p>
              <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-faint">
                The layout is deterministic rather than a force simulation. The same register always draws the
                same picture, so a screenshot in a steering pack still matches the tool a fortnight later, and
                nothing is animating in a browser tab nobody is looking at.
              </p>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
