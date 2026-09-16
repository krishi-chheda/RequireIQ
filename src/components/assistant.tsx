"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { AssistantAnswer } from "@/lib/ai/provider";
import { Badge, Card, Eyebrow, Ref, buttonClass, cx } from "./ui";
import { INPUT_CLASS } from "./forms";

/**
 * The project assistant.
 *
 * Every answer is rendered with the method that produced it and the records it
 * drew on. When the evidence does not support an answer the panel says so and
 * shows nothing rather than producing something plausible - which is the whole
 * reason the ungrounded state gets its own visual treatment instead of being
 * quietly indistinguishable from a real answer.
 */

const SUGGESTIONS = [
  "What conflicts are still unresolved?",
  "Which requirements lack acceptance criteria?",
  "Which requirements came from the Finance team?",
  "Show me all performance requirements.",
  "What was added after the scope baseline?",
  "Which requirements have no owner?",
  "What did nobody specify?",
  "Which requirements are most ambiguous?",
];

interface Exchange {
  id: number;
  question: string;
  answer: AssistantAnswer | null;
  error: string | null;
}

export function ProjectAssistant({ projectId }: { projectId: string }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);
  const nextId = useRef(1);

  async function ask(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length < 3 || busy) return;

    const id = nextId.current++;
    setHistory((current) => [...current, { id, question: trimmed, answer: null, error: null }]);
    setQuestion("");
    setBusy(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = (await response.json()) as AssistantAnswer & { error?: string };

      setHistory((current) =>
        current.map((item) =>
          item.id === id
            ? response.ok
              ? { ...item, answer: payload }
              : { ...item, error: payload.error ?? "The assistant could not answer that." }
            : item,
        ),
      );
    } catch {
      setHistory((current) =>
        current.map((item) => (item.id === id ? { ...item, error: "Could not reach the server." } : item)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {history.length === 0 ? (
        <Card className="px-5 py-6">
          <Eyebrow>Try one of these</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void ask(suggestion)}
                className="rounded-sm border border-line bg-raised px-3 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:border-edge hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="space-y-4">
        {history.map((exchange) => (
          <div key={exchange.id} className="space-y-2.5">
            <div className="flex justify-end">
              <p className="max-w-2xl rounded-lg rounded-br-sm border border-brand/30 bg-brand-soft px-4 py-2.5 text-[13px] text-ink">
                {exchange.question}
              </p>
            </div>

            {exchange.error ? (
              <div role="alert" className="rounded-lg border border-critical/30 bg-critical-soft px-4 py-3">
                <p className="text-[12.5px] text-critical">{exchange.error}</p>
              </div>
            ) : exchange.answer ? (
              <AnswerCard answer={exchange.answer} projectId={projectId} />
            ) : (
              <div className="rounded-lg border border-line bg-surface px-4 py-3.5" aria-live="polite">
                <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand" />
                  Searching the project record...
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        className="sticky bottom-4 flex gap-2 rounded-lg border border-edge bg-overlay p-2 shadow-lg shadow-black/30"
      >
        <label htmlFor="assistant-question" className="sr-only">
          Ask a question about this project
        </label>
        <input
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about requirements, conflicts, risks or who asked for what"
          maxLength={500}
          className={cx(INPUT_CLASS, "border-transparent bg-transparent")}
        />
        <button type="submit" disabled={busy || question.trim().length < 3} className={buttonClass("primary")}>
          {busy ? "Searching..." : "Ask"}
        </button>
      </form>

      {history.length > 0 ? (
        <p className="text-center text-[11.5px] text-ink-faint">
          Answers come only from records extracted from this project&apos;s documents.
        </p>
      ) : null}
    </div>
  );
}

function AnswerCard({ answer, projectId }: { answer: AssistantAnswer; projectId: string }) {
  return (
    <Card className={cx("overflow-hidden", !answer.grounded && "border-medium/30")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Badge tone={answer.grounded ? "positive" : "medium"}>
          {answer.grounded ? "Answered from project evidence" : "Insufficient evidence"}
        </Badge>
        {answer.citations.length > 0 ? (
          <Badge>
            {answer.citations.length} citation{answer.citations.length === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>

      <div className="px-4 py-3.5">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{answer.answer}</p>
      </div>

      {answer.citations.length > 0 ? (
        <div className="border-t border-line px-4 py-3">
          <Eyebrow>Records referenced</Eyebrow>
          <ul className="mt-2 space-y-1.5">
            {answer.citations.slice(0, 12).map((citation, index) => (
              <li key={`${citation.ref}-${index}`}>
                <Link
                  href={citation.href.startsWith("/") ? citation.href : `/app/projects/${projectId}`}
                  className="group flex gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-raised"
                >
                  <Ref className="shrink-0 group-hover:text-brand-ink">{citation.ref}</Ref>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-ink-muted">{citation.label}</span>
                    {citation.locator ? (
                      <span className="block truncate text-[11px] text-ink-faint">{citation.locator}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-line bg-raised px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-faint">
        <span className="font-medium text-ink-muted">How this was answered: </span>
        {answer.method}
      </p>
    </Card>
  );
}
