"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { IngestResult } from "@/lib/ingest";
import { Card, CardHeader, Eyebrow, buttonClass, cx } from "./ui";

/**
 * Upload and analyse.
 *
 * Shows the pipeline running rather than a spinner, then reports what the
 * document actually produced - including the sentences that were rejected and
 * why. That last part matters: a tool that only shows what it found teaches you
 * nothing about what it missed.
 */
export function UploadPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<{ message: string; unsupported?: boolean } | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(`/api/projects/${projectId}/ingest`, { method: "POST", body });
      const payload = (await response.json()) as IngestResult & { error?: string; unsupportedFormat?: boolean };

      if (!response.ok) {
        setError({ message: payload.error ?? "Ingestion failed.", unsupported: payload.unsupportedFormat });
        return;
      }

      setResult(payload);
      router.refresh();
    } catch {
      setError({ message: "Could not reach the server. The document was not added." });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader
        title="Add a document"
        description="Runs the same pipeline as everything above: chunk, extract, classify, analyse, then re-check conflicts across the whole register."
      />

      <div className="px-5 py-5">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void upload(file);
          }}
          className={cx(
            "rounded-md border border-dashed px-5 py-8 text-center transition-colors",
            dragging ? "border-brand bg-brand-soft" : "border-edge bg-raised",
          )}
        >
          <p className="text-[13px] text-ink">
            {busy ? "Analysing..." : "Drop a file here, or choose one"}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-relaxed text-ink-faint">
            Plain text formats and PDF: .txt, .md, .csv, .eml, .log, .json, .pdf. Up to 5 MB. The fifteen demo documents in{" "}
            <code className="font-mono text-[11px]">demo-data/</code> can be re-uploaded to try it.
          </p>

          <input
            ref={inputRef}
            id="document-upload"
            type="file"
            accept=".txt,.md,.markdown,.csv,.tsv,.log,.eml,.json,.pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <label
            htmlFor="document-upload"
            className={buttonClass("primary", cx("mt-4 cursor-pointer", busy && "pointer-events-none opacity-50"))}
          >
            {busy ? "Analysing..." : "Choose a file"}
          </label>
        </div>

        {busy ? (
          <ol className="mt-4 space-y-1.5" aria-live="polite">
            {["Reading text", "Chunking by structure", "Detecting obligations", "Analysing quality", "Re-checking conflicts"].map(
              (step, index) => (
                <li key={step} className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <span
                    aria-hidden
                    className="size-1.5 animate-pulse rounded-full bg-brand"
                    style={{ animationDelay: `${index * 140}ms` }}
                  />
                  {step}
                </li>
              ),
            )}
          </ol>
        ) : null}

        {error ? (
          <div
            role="alert"
            className={cx(
              "mt-4 rounded-sm border px-4 py-3",
              error.unsupported
                ? "border-medium/30 bg-medium-soft"
                : "border-critical/30 bg-critical-soft",
            )}
          >
            <p className={cx("text-[12.5px] font-medium", error.unsupported ? "text-medium-ink" : "text-critical-ink")}>
              {error.unsupported ? "Format not supported in this build" : "Ingestion failed"}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{error.message}</p>
          </div>
        ) : null}

        {result ? (
          <div role="status" className="mt-4 rounded-md border border-positive/25 bg-positive-soft/40 px-4 py-3.5">
            <p className="text-[12.5px] font-medium text-positive">Analysed &ldquo;{result.title}&rdquo;</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Chunks", result.chunks],
                ["Requirements", result.requirements],
                ["Constraints", result.constraints],
                ["Findings", result.findings],
                ["New conflicts", result.newConflicts],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">{label}</dt>
                  <dd data-numeric className="mt-0.5 text-[17px] font-semibold text-ink">
                    {value as number}
                  </dd>
                </div>
              ))}
            </dl>

            {result.rejected.length > 0 ? (
              <details className="mt-4 border-t border-positive/20 pt-3">
                <summary className="cursor-pointer text-[11.5px] text-ink-muted transition-colors hover:text-ink">
                  {result.rejected.length} candidate sentence
                  {result.rejected.length === 1 ? "" : "s"} rejected - see why
                </summary>
                <ul className="mt-2.5 space-y-2">
                  {result.rejected.map((item, index) => (
                    <li key={index} className="border-l border-edge pl-3">
                      <p className="text-[11.5px] leading-snug text-ink-muted">&ldquo;{item.sentence}&rdquo;</p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">{item.reason}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 border-t border-line pt-4">
          <Eyebrow>Formats this build cannot read</Eyebrow>
          <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-ink-faint">
            DOCX is architecturally supported but has no parser in this build. The analysis pipeline
            takes a string, so adding one means implementing a single branch in{" "}
            <code className="font-mono text-[11px]">extractText()</code> and nothing else - no screen, query or
            detector changes. Uploading one returns a clear message rather than failing silently or, worse,
            analysing binary noise into plausible-looking requirements. A scanned PDF with no selectable text is
            refused the same way, since it needs OCR.
          </p>
        </div>
      </div>
    </Card>
  );
}
