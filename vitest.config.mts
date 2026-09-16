import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real `server-only` package throws when imported outside a React
      // Server Component graph. Server modules are still worth testing.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    // The data-layer suite opens a real SQLite file; keep suites from racing
    // each other over the same handle.
    fileParallelism: false,
  },
});
