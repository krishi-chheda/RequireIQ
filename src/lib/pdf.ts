/**
 * PDF text extraction.
 *
 * Isolated in its own module so the parser is swappable without touching the
 * ingestion pipeline. Everything downstream takes a string; this is the only
 * place that knows a PDF exists.
 *
 * No "server-only" import here deliberately: this module holds no server
 * resource (just a bytes-to-text function), and a later task's probe script
 * imports it from plain Node, where "server-only" throws outside a React
 * Server Component graph. The one application caller already carries the
 * guard itself.
 */

/** Below this, a page is almost certainly an image rather than text. */
const MIN_CHARS_PER_PAGE = 120;

export class PdfExtractionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfExtractionError";
  }
}

export async function extractPdfText(
  bytes: Uint8Array,
): Promise<{ text: string; pageCount: number }> {
  let text: string;
  let pageCount: number;

  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    text = String(result.text);
    pageCount = Math.max(1, result.totalPages);
  } catch (cause) {
    throw new PdfExtractionError(
      "This file could not be read as a PDF. It may be corrupt or password protected.",
      { cause },
    );
  }

  // A scanned PDF parses fine and yields almost nothing. Emitting requirements
  // from that would be worse than refusing: the register would look populated
  // and be meaningless.
  if (text.trim().length / pageCount < MIN_CHARS_PER_PAGE) {
    throw new PdfExtractionError(
      `This PDF has little or no selectable text (${Math.round(text.trim().length / pageCount)} characters per page). ` +
        "It is probably scanned images, which needs OCR - a capability this build does not have.",
    );
  }

  return { text: text.replace(/\r\n/g, "\n"), pageCount };
}
