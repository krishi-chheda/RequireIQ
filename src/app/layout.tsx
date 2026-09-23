import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: {
    default: "RequireIQ - Requirements Intelligence",
    template: "%s | RequireIQ",
  },
  description:
    "Turns scattered project conversations into validated, traceable requirements, and finds the contradictions between them before they become rework.",
  applicationName: "RequireIQ",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  /**
   * The one raw colour literal allowed outside `globals.css`.
   *
   * `<meta name="theme-color">` is read by the browser chrome before any
   * stylesheet is parsed, so it cannot be `var(--color-canvas)`. It must stay
   * equal to that token or the phone's status bar stops matching the page;
   * `src/test/design-tokens.test.ts` fails if the two drift apart.
   */
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080d13" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the page never renders in one ramp and
            flips to the other. `suppressHydrationWarning` on <html> is
            required because this script writes `data-theme` before React
            hydrates, so the server markup and the live DOM differ by design. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
