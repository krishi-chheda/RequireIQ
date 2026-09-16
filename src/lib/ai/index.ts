import "server-only";

import { createAnthropicProvider } from "./anthropic";
import { localProvider } from "./local";
import type { AIProvider, ProviderStatus } from "./provider";

/**
 * Provider resolution.
 *
 * Kept separate from `provider.ts` so the interface file stays importable from
 * pure, testable modules without dragging in server-only dependencies.
 */

let cached: AIProvider | null = null;
let degraded = false;

export function getProvider(): AIProvider {
  if (cached) return cached;

  const requested = (process.env.REQUIREIQ_AI_PROVIDER ?? "local").toLowerCase();
  if (requested === "anthropic") {
    if (process.env.ANTHROPIC_API_KEY) {
      cached = createAnthropicProvider(localProvider);
      return cached;
    }
    // Requested but unusable. Degrade rather than fail: an absent credential
    // should never take a page down.
    degraded = true;
  }

  cached = localProvider;
  return cached;
}

/** Provider identity for display. The UI always tells the user what ran. */
export function getProviderStatus(): ProviderStatus {
  const provider = getProvider();
  return {
    id: provider.id,
    label: provider.label,
    description: provider.description,
    deterministic: provider.deterministic,
    degraded,
  };
}

export type { AIProvider, ProviderStatus };
