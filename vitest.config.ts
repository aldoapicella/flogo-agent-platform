import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/control-plane", "apps/orchestrator", "apps/runner-worker", "apps/web-console"]
  }
});
