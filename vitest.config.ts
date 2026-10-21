import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    server: {
      deps: {
        external: ["better-sqlite3"],
      },
    },
  },
  ssr: {
    external: ["better-sqlite3"],
  },
});
