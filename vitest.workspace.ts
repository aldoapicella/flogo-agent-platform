import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*",
  "apps/control-plane",
  "apps/runner-worker"
]);

