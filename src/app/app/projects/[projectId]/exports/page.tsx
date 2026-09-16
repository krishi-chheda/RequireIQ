import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProject, getProjectSummary } from "@/lib/queries";
import { REPORTS } from "@/lib/reports";
import { Card, CardHeader, Eyebrow, PageHeader, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Reports and exports" };

/**
 * Reports.
 *
 * Plain anchors rather than a fetch-and-blob dance: a download is what a
 * browser already does well, it works with the keyboard and without
 * JavaScript, and right-click-save-as behaves the way a consultant expects.
 */
export default async function ExportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const summary = getProjectSummary(projectId);
  const api = `/api/projects/${projectId}/export`;

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Work with it"
          title="Reports and exports"
          description="Six deliverables, in CSV for a spreadsheet and JSON for a pipeline. Each carries its provenance columns, so a reader can always tell an agreed requirement from a machine reading."
        />

        <Card className="px-5 py-4">
          <Eyebrow>Generated from</Eyebrow>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
            {project.name} &middot; {project.client} &middot; baseline {formatDate(project.baselineDate)} &middot;{" "}
            <span data-numeric>{summary?.requirements ?? 0}</span> requirements,{" "}
            <span data-numeric>{summary?.openConflicts ?? 0}</span> open conflicts,{" "}
            <span data-numeric>{summary?.openRisks ?? 0}</span> open risks. Reports reflect the register at the
            moment you download them.
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {REPORTS.map((report) => (
            <Card key={report.id} className="flex flex-col">
              <CardHeader title={report.name} description={report.description} />
              <div className="flex flex-1 flex-col justify-between gap-4 px-5 py-4">
                <p className="text-[11.5px] leading-relaxed text-ink-faint">{report.audience}</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`${api}/${report.id}?format=csv`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-sm bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-strong"
                  >
                    Download CSV
                  </a>
                  <a
                    href={`${api}/${report.id}?format=json`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-sm border border-edge bg-overlay px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-hover"
                  >
                    JSON
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader
            title="Complete project export"
            description="Everything in one JSON document: requirements with their evidence and full audit trails, constraints, conflicts, risks, quality findings, coverage gaps, decisions and scope movement."
          />
          <div className="px-5 py-4">
            <a
              href={`${api}/all`}
              download
              className="inline-flex items-center gap-1.5 rounded-sm border border-edge bg-overlay px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-hover"
            >
              Download full export
            </a>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <Eyebrow>On handing these to a client</Eyebrow>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              Every export carries a provenance column and a disclaimer naming what the automated analysis did
              and did not establish. A register handed over without those invites the reader to treat machine
              readings as agreed requirements - which is the exact failure the product exists to prevent, so
              exporting it away would be self-defeating.
            </p>
          </Card>

          <Card className="p-5">
            <Eyebrow>A note on the CSV</Eyebrow>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              Cells beginning with an equals sign, plus, minus or at sign are prefixed with an apostrophe.
              Without that, a requirement statement starting with a dash is interpreted as a formula when the
              client opens the file. A requirements tool that exports a spreadsheet which executes on open is
              not one anybody should use.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}
