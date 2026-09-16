import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getDocument,
  listChunks,
  listEvidenceForDocument,
  listExtractedFromDocument,
} from "@/lib/queries";
import { getProvider } from "@/lib/ai";
import { DOCUMENT_KIND_LABEL, PRIORITY_LABEL, REQUIREMENT_TYPE_LABEL } from "@/lib/types";
import {
  Badge,
  Card,
  CardHeader,
  Confidence,
  Eyebrow,
  ProvenanceTag,
  Ref,
  formatDate,
  formatNumber,
} from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<Metadata> {
  const { documentId } = await params;
  const document = getDocument(documentId);
  return { title: document ? document.title : "Document" };
}

/**
 * Document view.
 *
 * The source text, chunk by chunk, with everything extracted from each chunk
 * shown beside it. This is the view that answers "did the tool read this
 * correctly?" - which a reviewer needs to be able to check before they trust
 * anything else in the product.
 */
export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  const document = getDocument(documentId);
  if (!document || document.projectId !== projectId) notFound();

  const base = `/app/projects/${projectId}`;
  const chunks = listChunks(documentId);
  const { requirements, constraints } = listExtractedFromDocument(documentId);
  const summary = getProvider().summariseDocument(document.content);

  // Group extracted records by the chunk they came from, so the source text and
  // its output sit together. One evidence query for the whole document.
  const locatorBySubject = new Map(
    listEvidenceForDocument(documentId).map((e) => [e.subjectId, e.locator]),
  );
  const byLocator = new Map<string, { requirements: typeof requirements; constraints: typeof constraints }>();

  for (const requirement of requirements) {
    const locator = locatorBySubject.get(requirement.id);
    if (!locator) continue;
    const entry = byLocator.get(locator) ?? { requirements: [], constraints: [] };
    entry.requirements.push(requirement);
    byLocator.set(locator, entry);
  }
  for (const constraint of constraints) {
    const locator = locatorBySubject.get(constraint.id);
    if (!locator) continue;
    const entry = byLocator.get(locator) ?? { requirements: [], constraints: [] };
    entry.constraints.push(constraint);
    byLocator.set(locator, entry);
  }

  return (
    <main id="main" className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8">
      <div className="enter space-y-5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          <Link href={`${base}/documents`} className="transition-colors hover:text-ink">
            Documents
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate text-ink-muted">{document.title}</span>
        </nav>

        <header className="border-b border-line pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{DOCUMENT_KIND_LABEL[document.kind]}</Badge>
            <Badge tone={document.status === "analysed" ? "positive" : "medium"}>{document.status}</Badge>
            {document.userUploaded ? <Badge tone="brand">Uploaded</Badge> : <Badge>Demo corpus</Badge>}
            <ProvenanceTag provenance="source" />
          </div>
          <h1 className="mt-3 text-[21px] font-semibold tracking-[-0.02em] text-ink">{document.title}</h1>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-faint">
            <span className="font-mono">{document.filename}</span>
            {document.author ? <span>{document.author}</span> : null}
            <span>Captured {formatDate(document.capturedAt)}</span>
            <span data-numeric>{formatNumber(document.wordCount)} words</span>
            <span data-numeric>{chunks.length} chunks</span>
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Requirements extracted", requirements.length],
            ["Constraints extracted", constraints.length],
            ["Chunks indexed", chunks.length],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-line bg-surface px-4 py-3">
              <Eyebrow>{label}</Eyebrow>
              <p data-numeric className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-ink">
                {value as number}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader
            title="Summary"
            description="Extractive, not generated. These are the document's own highest-centrality sentences, in their original order - never a paraphrase, because a paraphrase in a requirements tool is a quiet rewrite of the client's words."
            action={<ProvenanceTag provenance="ai_analysis" />}
          />
          <p className="px-5 py-4 text-[13px] leading-relaxed text-ink-muted">{summary}</p>
        </Card>

        <Card>
          <CardHeader
            title="Source text and what was extracted from it"
            description="Chunked by structure. Each chunk shows the records it produced, so a reviewer can check the reading against the original."
          />
          <ol className="divide-y divide-line">
            {chunks.map((chunk) => {
              const extracted = byLocator.get(chunk.locator);
              const hasOutput = Boolean(extracted?.requirements.length || extracted?.constraints.length);

              return (
                <li key={chunk.id} id={`chunk-${chunk.id}`} className="scroll-mt-24">
                  <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_340px]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Ref className="text-[10.5px]">{chunk.locator}</Ref>
                        <span className="text-[10.5px] text-ink-faint">
                          chars {chunk.startOffset}&ndash;{chunk.endOffset}
                        </span>
                      </div>
                      <p
                        className={`mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed ${
                          hasOutput ? "text-ink" : "text-ink-faint"
                        }`}
                      >
                        {chunk.text}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {extracted?.requirements.map((requirement) => (
                        <Link
                          key={requirement.id}
                          href={`${base}/requirements/${requirement.id}`}
                          className="block rounded-md border border-line bg-raised px-3 py-2.5 transition-colors hover:border-edge hover:bg-hover"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Ref className="text-brand-ink">{requirement.ref}</Ref>
                            <Badge>{REQUIREMENT_TYPE_LABEL[requirement.type]}</Badge>
                            <Badge>{PRIORITY_LABEL[requirement.priority]}</Badge>
                          </div>
                          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-muted">
                            {requirement.statement}
                          </p>
                          <div className="mt-2">
                            <Confidence value={requirement.confidence} />
                          </div>
                        </Link>
                      ))}
                      {extracted?.constraints.map((constraint) => (
                        <div
                          key={constraint.id}
                          className="rounded-md border border-brand/25 bg-brand-soft/40 px-3 py-2.5"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Ref className="text-brand-ink">{constraint.ref}</Ref>
                            <Badge tone="brand">{constraint.category} constraint</Badge>
                          </div>
                          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-muted">
                            {constraint.statement}
                          </p>
                        </div>
                      ))}
                      {!hasOutput ? (
                        <p className="text-[11.5px] leading-relaxed text-ink-faint">
                          No obligation statement detected in this chunk.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </main>
  );
}
