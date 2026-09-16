import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  getProject,
  getProjectSummary,
  listCoverageGaps,
  listDocuments,
} from "@/lib/queries";
import { ProjectNav, type NavGroup } from "@/components/nav";
import { DemoTour } from "@/components/tour";

/**
 * Project workspace shell.
 *
 * The counts in the sidebar come from the same summary the dashboard uses, so
 * the navigation and the metrics can never disagree.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const summary = getProjectSummary(projectId);
  const base = `/app/projects/${projectId}`;

  const groups: NavGroup[] = [
    {
      label: "Engagement",
      items: [
        { href: base, label: "Workspace" },
        { href: `${base}/documents`, label: "Documents", count: listDocuments(projectId).length },
      ],
    },
    {
      label: "Register",
      items: [
        { href: `${base}/requirements`, label: "Requirements", count: summary?.requirements },
        { href: `${base}/traceability`, label: "Traceability" },
        { href: `${base}/graph`, label: "Relationship graph" },
      ],
    },
    {
      label: "Findings",
      items: [
        {
          href: `${base}/conflicts`,
          label: "Conflicts",
          count: summary?.openConflicts,
          alert: (summary?.criticalConflicts ?? 0) > 0,
        },
        {
          href: `${base}/risks`,
          label: "Risks and gaps",
          count: (summary?.openRisks ?? 0) + listCoverageGaps(projectId).filter((g) => g.status === "open").length,
          alert: (summary?.highRisks ?? 0) > 0,
        },
        {
          href: `${base}/scope`,
          label: "Scope movement",
          count: summary?.postBaseline,
          alert: (summary?.postBaseline ?? 0) > 0,
        },
      ],
    },
    {
      label: "Work with it",
      items: [
        { href: `${base}/assistant`, label: "Project assistant" },
        { href: `${base}/exports`, label: "Reports and exports" },
      ],
    },
  ];

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <ProjectNav groups={groups} projectName={project.name} projectKey={project.key} />
      {/* Bottom padding clears the floating walkthrough button, so the last
          row of any page stays reachable rather than sitting under it. */}
      <div className="min-w-0 flex-1 pb-20">{children}</div>
      <DemoTour projectId={projectId} />
    </div>
  );
}
