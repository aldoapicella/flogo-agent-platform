import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/control-plane", "apps/runner-worker"]
  }
});
