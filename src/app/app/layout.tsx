import type { ReactNode } from "react";
import Link from "next/link";
import { listProjects } from "@/lib/queries";
import { isEphemeral } from "@/lib/db";
import { getProviderStatus } from "@/lib/ai";
import { Wordmark } from "@/components/brand";
import { Badge } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Workspace chrome.
 *
 * Renders the top bar shared by every in-app screen. The provider badge lives
 * here so a demo audience can always see what produced what is on screen
 * without being told.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const provider = getProviderStatus();
  const projects = listProjects();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 hidden border-b border-line bg-surface/95 backdrop-blur lg:block">
        <div className="flex items-center justify-between gap-4 px-5 py-2.5">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center" aria-label="RequireIQ home">
              <Wordmark size={18} />
            </Link>
            <span aria-hidden className="h-4 w-px bg-line" />
            <Link href="/app" className="text-[12.5px] text-ink-muted transition-colors hover:text-ink">
              All engagements
            </Link>
            {projects.length === 1 && projects[0] ? (
              <span className="text-[12.5px] text-ink-faint">
                {projects.length} active engagement
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {/* Also here, not only on the landing page: a reader who switches
                to light and then opens the workspace must be able to switch
                back from where they are. */}
            <ThemeToggle />
            <Badge
              tone={provider.deterministic ? "neutral" : "brand"}
              title={provider.description}
              className="cursor-help"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-positive" />
              {provider.deterministic ? "Local engine" : provider.label}
            </Badge>
            {provider.degraded ? (
              <Badge tone="medium" title="REQUIREIQ_AI_PROVIDER=anthropic was requested but ANTHROPIC_API_KEY is not set. The local engine is running instead.">
                Provider degraded
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      {/* Shown only where writes land on ephemeral serverless storage. A demo
          that quietly loses a reviewer's decision is worse than one that says
          up front that it will. */}
      {isEphemeral() ? (
        <p
          role="status"
          className="border-b border-medium/25 bg-medium-soft px-5 py-2 text-center text-[12px] text-medium-ink"
        >
          Hosted demo &middot; every instance re-analyses the corpus from source, so review decisions and
          uploads last only for this session. Run it locally for durable writes.
        </p>
      ) : null}

      {children}
    </div>
  );
}
