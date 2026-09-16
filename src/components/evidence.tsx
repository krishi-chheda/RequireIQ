import Link from "next/link";
import type { EvidenceWithSource } from "@/lib/queries";
import { DOCUMENT_KIND_LABEL } from "@/lib/types";
import { Badge, Eyebrow, Ref, formatDate } from "./ui";

/**
 * Source evidence.
 *
 * The single most important component in the product. It renders the exact
 * words from the exact place, with the person who said them, and links to the
 * document open at that position. Everything else the product claims is only
 * as trustworthy as this block being honest.
 */
export function EvidenceBlock({
  evidence,
  projectId,
  label = "Source evidence",
}: {
  evidence: EvidenceWithSource[];
  projectId: string;
  label?: string;
}) {
  if (evidence.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-faint">
        No source evidence is recorded against this record.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Eyebrow>{label}</Eyebrow>
      {evidence.map((item) => (
        <figure key={item.id} className="rounded-md border border-line bg-raised">
          <blockquote className="border-l-2 border-prov-source px-4 py-3">
            <p className="text-[13px] leading-relaxed text-ink">&ldquo;{item.quote}&rdquo;</p>
          </blockquote>
          <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-4 py-2.5 text-[11.5px] text-ink-faint">
            <Link
              href={`/app/projects/${projectId}/documents/${item.documentId}#chunk-${item.chunkId ?? ""}`}
              className="font-medium text-ink-muted transition-colors hover:text-brand-ink"
            >
              {item.documentTitle}
            </Link>
            <Badge>{DOCUMENT_KIND_LABEL[item.documentKind]}</Badge>
            <span>{item.locator}</span>
            {item.stakeholderName ? (
              <span>
                {item.stakeholderName}
                {item.stakeholderRole ? `, ${item.stakeholderRole}` : ""}
              </span>
            ) : (
              <span className="text-high">No attributable speaker</span>
            )}
            <span>{formatDate(item.capturedAt)}</span>
            <Ref className="ml-auto text-[10.5px]">
              chars {item.startOffset}&ndash;{item.endOffset}
            </Ref>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * Highlights a span inside a statement.
 *
 * Used to show a reviewer exactly which words triggered a quality finding,
 * rather than asking them to find "fast" in a sentence themselves.
 */
export function HighlightedStatement({
  statement,
  spans,
}: {
  statement: string;
  spans: Array<{ start: number; end: number; id: string }>;
}) {
  // Whole-statement findings would highlight everything, which highlights
  // nothing. Only sub-spans are drawn.
  const usable = spans
    .filter((span) => span.start >= 0 && span.end <= statement.length && span.end - span.start < statement.length)
    .sort((a, b) => a.start - b.start);

  if (usable.length === 0) {
    return <span>{statement}</span>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of usable) {
    if (span.start < cursor) continue;
    if (span.start > cursor) parts.push(statement.slice(cursor, span.start));
    parts.push(
      <mark
        key={span.id}
        className="rounded-xs bg-high/20 px-0.5 text-high underline decoration-high/40 decoration-dotted underline-offset-2"
      >
        {statement.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  }
  if (cursor < statement.length) parts.push(statement.slice(cursor));

  return <span>{parts}</span>;
}
