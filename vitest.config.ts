import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json so tests import modules
    // by the same specifier the application uses.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Only pure model code is under test — no DOM, no React rendering. The
    // things worth testing here are arithmetic and data mapping, and adding a
    // browser environment would slow every run for no coverage gained.
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
