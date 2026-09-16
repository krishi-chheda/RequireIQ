import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProject } from "@/lib/queries";
import { IngestError, MAX_UPLOAD_BYTES, extractText, ingestDocument } from "@/lib/ingest";
import { z, ValidationError } from "@/lib/validate";

/**
 * Document ingestion endpoint.
 *
 * A route handler rather than a server action because it takes a file upload
 * and returns a structured analysis summary the client renders - the shape a
 * real integration (a SharePoint connector, a mail drop) would also target.
 *
 * Upload safety, in order: the project must exist, the declared size is
 * checked before the body is read, the decoded size is checked again, the
 * extension must be on a text allowlist, and binary content wearing a text
 * extension is rejected. Nothing is written to disk - the text goes into the
 * database, so there is no upload directory to traverse into or serve from.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId: rawProjectId } = await params;
    const projectId = z.id(rawProjectId, "projectId");

    if (!getProject(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    // Reject on the declared length before reading the body into memory.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES * 1.1) {
      return NextResponse.json(
        { error: `That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.` },
        { status: 413 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was attached." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.` },
        { status: 413 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }

    // Never trust a client-supplied path. Only the basename is kept.
    const filename = z.text(file.name.split(/[/\\]/).pop() ?? "upload.txt", {
      max: 200,
      label: "filename",
    });

    const titleInput = form.get("title");
    const title =
      typeof titleInput === "string" && titleInput.trim()
        ? z.text(titleInput, { min: 2, max: 200, label: "title" })
        : filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");

    const authorInput = form.get("author");
    const author =
      typeof authorInput === "string" && authorInput.trim()
        ? z.text(authorInput, { max: 120, label: "author" })
        : null;

    const content = extractText(filename, new Uint8Array(await file.arrayBuffer()));
    const result = ingestDocument({ projectId, title, filename, content, author });

    revalidatePath(`/app/projects/${projectId}`, "layout");
    revalidatePath("/app");

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json(
        { error: error.message, unsupportedFormat: error.unsupportedFormat },
        { status: error.unsupportedFormat ? 415 : 400 },
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Never leak an internal message or a stack to the client.
    console.error("Ingestion failed:", error);
    return NextResponse.json({ error: "Ingestion failed. The document was not added." }, { status: 500 });
  }
}
