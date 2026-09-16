import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <Wordmark />
      <div>
        <p className="font-mono text-[12px] uppercase tracking-[0.13em] text-ink-faint">404</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          That record does not exist
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-muted">
          The reference may have been removed by a demo reset, or the link may be from an older version of the
          register.
        </p>
      </div>
      <Link href="/app" className={buttonClass("primary")}>
        Back to the workspace
      </Link>
    </main>
  );
}
