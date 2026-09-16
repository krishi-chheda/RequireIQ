import { NextResponse } from "next/server";
import { buildFullExport, buildReport, isReportId } from "@/lib/reports";
import { getProject } from "@/lib/queries";
import { z, ValidationError } from "@/lib/validate";

/**
 * Report download.
 *
 * `GET /api/projects/:id/export/:report?format=csv|json`
 *
 * The filename is built from the project key and the report id, both of which
 * are validated against fixed sets, so no client-supplied text ever reaches the
 * Content-Disposition header.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; report: string }> },
) {
  try {
    const { projectId: rawProjectId, report: rawReport } = await params;
    const projectId = z.id(rawProjectId, "projectId");

    if (!getProject(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";

    if (rawReport === "all") {
      const payload = buildFullExport(projectId);
      return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="requireiq-full-export.json"`,
          "cache-control": "no-store",
        },
      });
    }

    if (!isReportId(rawReport)) {
      return NextResponse.json({ error: "Unknown report." }, { status: 404 });
    }

    const payload = buildReport(projectId, rawReport);
    if (!payload) {
      return NextResponse.json({ error: "Report could not be generated." }, { status: 404 });
    }

    // filename is derived from validated values only.
    const filename = `${payload.filename.replace(/[^a-z0-9-]/gi, "")}.${format}`;

    return new NextResponse(format === "json" ? JSON.stringify(payload.json, null, 2) : payload.csv, {
      headers: {
        "content-type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Export failed:", error);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
