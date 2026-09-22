"use client";

import { cloneElement, isValidElement, useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/server-actions";
import { buttonClass, cx, type BUTTON_VARIANTS } from "./ui";

/**
 * Form plumbing shared by every write in the product.
 *
 * All writes go through a server action and a real `<form>`, so every control
 * works without JavaScript, is reachable by keyboard, and announces its result
 * to a screen reader. `useFormStatus` supplies the pending state; nothing here
 * keeps a local copy of server data, so a stale optimistic value cannot be
 * shown next to a real one.
 */

export function SubmitButton({
  children,
  variant = "secondary",
  pendingLabel = "Saving...",
  className,
  name,
  value,
  title,
}: {
  children: React.ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending}
      className={buttonClass(variant, className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Result banner.
 *
 * A success is announced politely; a failure interrupts. A rejected write that
 * a screen reader queues behind whatever else is speaking is a write the
 * reviewer believes went through.
 */
export function ActionMessage({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      aria-live={state.ok ? "polite" : "assertive"}
      className={cx(
        "mt-2 rounded-sm border px-3 py-2 text-[12px]",
        state.ok
          ? "border-positive/30 bg-positive-soft text-positive"
          : "border-critical/30 bg-critical-soft text-critical",
      )}
    >
      {state.message}
    </p>
  );
}

/** Binds a server action to a form and renders its result underneath. */
export function ActionForm({
  action,
  children,
  className,
  hidden,
}: {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode | ((state: ActionResult | null) => React.ReactNode);
  className?: string;
  /** Hidden fields every submission needs, e.g. projectId. */
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {typeof children === "function" ? children(state) : children}
      <ActionMessage state={state} />
    </form>
  );
}

/**
 * Labelled form control.
 *
 * The hint is wired to the control with `aria-describedby` here rather than at
 * each call site, so a field cannot ship with a hint that only sighted readers
 * get. Every caller already passes `htmlFor` matching its child's `id`, so the
 * hint's id is derived from it and the control is cloned to carry the
 * reference - no call site has to remember.
 */
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
      >
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">{describedBy(children, hintId)}</div>
    </div>
  );
}

/** Adds `aria-describedby` to a single element child, preserving any it already has. */
function describedBy(children: React.ReactNode, hintId: string | undefined): React.ReactNode {
  if (!hintId || !isValidElement(children)) return children;
  const element = children as React.ReactElement<{ "aria-describedby"?: string }>;
  const existing = element.props["aria-describedby"];
  return cloneElement(element, {
    "aria-describedby": existing ? `${existing} ${hintId}` : hintId,
  });
}

/**
 * Focus is left to the global `:focus-visible` ring in `globals.css`. A 1px
 * border-colour change is not an equivalent indicator, so this class must never
 * suppress the outline.
 */
export const INPUT_CLASS =
  "w-full rounded-sm border border-edge bg-canvas px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-faint transition-colors focus:border-brand";
