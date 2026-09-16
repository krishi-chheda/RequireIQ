import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProject, listDocuments, listExtractedFromDocument } from "@/lib/queries";
import { DOCUMENT_KIND_LABEL } from "@/lib/types";
import { UploadPanel } from "@/components/upload";
import {
  Badge,
  Card,
  CardHeader,
  Eyebrow,
  PageHeader,
  Ref,
  TableFrame,
  Td,
  Th,
  formatDate,
  formatNumber,
} from "@/components/ui";

export const metadata: Metadata = { title: "Documents" };

/**
 * Document ingestion.
 *
 * Shows what went in and what each document produced. The requirement count
 * per document is the honest measure of ingestion value: a 400-word email that
 * yielded a budget constraint mattered more than a 900-word transcript that
 * yielded three restatements of the same thing.
 */
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const documents = listDocuments(projectId);
  const base = `/app/projects/${projectId}`;
  const totalWords = documents.reduce((sum, d) => sum + d.wordCount, 0);

  const rows = documents.map((document) => ({
    document,
    extracted: listExtractedFromDocument(document.id),
  }));

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Engagement"
          title="Documents"
          description={`${documents.length} sources, ${formatNumber(totalWords)} words. This is the material a business analyst would otherwise read line by line - the three weeks of discovery reading the reference scenario describes.`}
        />

        <div className="grid gap-3 sm:grid-cols-4">
          {(["transcript", "meeting_notes", "email", "specification"] as const).map((kind) => (
            <div key={kind} className="rounded-lg border border-line bg-surface px-4 py-3">
              <Eyebrow>{DOCUMENT_KIND_LABEL[kind]}</Eyebrow>
              <p data-numeric className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-ink">
                {documents.filter((d) => d.kind === kind).length}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader
            title="Ingested sources"
            description="Every document was chunked, then every chunk was scanned for obligation statements."
          />
          <TableFrame minWidth={820}>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th className="w-[150px]">Type</Th>
                <Th className="w-[110px]">Captured</Th>
                <Th className="w-[90px]">Words</Th>
                <Th className="w-[110px]">Extracted</Th>
                <Th className="w-[100px]">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ document, extracted }) => (
                <tr key={document.id} className="group transition-colors hover:bg-raised">
                  <Td className="max-w-md">
                    <Link href={`${base}/documents/${document.id}`} className="block">
                      <p className="text-[12.5px] font-medium text-ink group-hover:text-brand-ink">
                        {document.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{document.filename}</p>
                      {document.author ? (
                        <p className="mt-1 text-[11.5px] text-ink-faint">{document.author}</p>
                      ) : null}
                    </Link>
                  </Td>
                  <Td>
                    <Badge>{DOCUMENT_KIND_LABEL[document.kind]}</Badge>
                  </Td>
                  <Td>
                    <span data-numeric className="text-[12px]">
                      {formatDate(document.capturedAt)}
                    </span>
                  </Td>
                  <Td>
                    <span data-numeric className="text-[12px]">
                      {formatNumber(document.wordCount)}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span data-numeric className="text-[12px] text-ink">
                        {extracted.requirements.length} req
                      </span>
                      {extracted.constraints.length > 0 ? (
                        <span data-numeric className="text-[11.5px] text-brand-ink">
                          {extracted.constraints.length} constraint
                          {extracted.constraints.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={document.status === "analysed" ? "positive" : "medium"}>{document.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </Card>

        <UploadPanel projectId={projectId} />

        <Card className="p-5">
          <Eyebrow>How ingestion works</Eyebrow>
          <ol className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Chunk", "Structure-aware, not fixed-width: transcripts break on speaker turns, specifications on headings, emails on the header block."],
              ["Locate", "Every chunk keeps its character range, so a citation can quote the source rather than paraphrase it."],
              ["Detect", "Sentences carrying an obligation modal are lifted verbatim. Questions and facilitation notes are rejected with a reason."],
              ["Attribute", "The speaker or email author is resolved against the stakeholder register, giving each requirement a requester."],
            ].map(([title, body], index) => (
              <li key={title}>
                <Ref className="text-brand-ink">{String(index + 1).padStart(2, "0")}</Ref>
                <p className="mt-1 text-[12.5px] font-medium text-ink">{title}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{body}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </main>
  );
}
