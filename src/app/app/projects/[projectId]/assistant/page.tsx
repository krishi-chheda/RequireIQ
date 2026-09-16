import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProject, getProjectSummary } from "@/lib/queries";
import { getProviderStatus } from "@/lib/ai";
import { ProjectAssistant } from "@/components/assistant";
import { Badge, Card, Eyebrow, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Project assistant" };

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const summary = getProjectSummary(projectId);
  const provider = getProviderStatus();

  return (
    <main id="main" className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Work with it"
          title="Project assistant"
          description="Ask about this engagement. Answers are assembled from the records extracted from its documents - nothing is inferred beyond what those records say."
          actions={
            <Badge tone={provider.deterministic ? "neutral" : "brand"} title={provider.description}>
              {provider.label}
            </Badge>
          }
        />

        <Card className="px-5 py-4">
          <Eyebrow>What it can see</Eyebrow>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-ink-muted">
            {[
              [`${summary?.requirements ?? 0}`, "requirements"],
              [`${summary?.openConflicts ?? 0}`, "open conflicts"],
              [`${summary?.openRisks ?? 0}`, "risks"],
              [`${summary?.openAmbiguities ?? 0}`, "quality findings"],
              [`${summary?.stakeholders ?? 0}`, "stakeholders"],
              [`${summary?.documents ?? 0}`, "documents"],
            ].map(([value, label]) => (
              <span key={label}>
                <span data-numeric className="font-medium text-ink">
                  {value}
                </span>{" "}
                {label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            Scoped to this project only. It cannot read another engagement, and it cannot read the raw document
            bodies - only the structured records extracted from them, each of which already carries its own
            citation back to a source.
          </p>
        </Card>

        <ProjectAssistant projectId={projectId} />
      </div>
    </main>
  );
}
