import { NextResponse } from "next/server";
import { buildProjectContext } from "@/lib/queries";
import { getProvider } from "@/lib/ai";
import { z, ValidationError } from "@/lib/validate";

/**
 * Project assistant endpoint.
 *
 * The assistant only ever sees `buildProjectContext(projectId)` - the records
 * for one project. It cannot reach another engagement's data, and it cannot
 * reach the raw document bodies, which is also what limits the blast radius of
 * a prompt-injection attempt hidden inside an ingested document: instructions
 * written into a source file reach the model, if a model is enabled, only as a
 * requirement statement among hundreds, inside a tagged block the system prompt
 * explicitly tells it to treat as data.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId: rawProjectId } = await params;
    const projectId = z.id(rawProjectId, "projectId");

    const body = (await request.json()) as { question?: unknown };
    const question = z.text(typeof body.question === "string" ? body.question : "", {
      min: 3,
      max: 500,
      label: "question",
    });

    const context = buildProjectContext(projectId);
    if (!context) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const provider = getProvider();
    const answer = await provider.answer(context, question);

    return NextResponse.json({ ...answer, provider: provider.id });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Assistant request failed:", error);
    return NextResponse.json({ error: "The assistant could not answer that." }, { status: 500 });
  }
}
