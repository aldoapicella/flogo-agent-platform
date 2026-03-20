import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactList } from "./artifact-list";

describe("ArtifactList", () => {
  it("renders scaffold bundle summary fields for contribution artifacts", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-1",
            type: "contrib_bundle",
            name: "activity-bundle-echoactivity",
            uri: "memory://task-1/activity-bundle-echoactivity",
            metadata: {
              result: {
                bundle: {
                  kind: "activity",
                  packageName: "echoactivity",
                  modulePath: "example.com/acme/echo",
                  files: [
                    { kind: "descriptor" },
                    { kind: "implementation" },
                    { kind: "test" }
                  ]
                },
                validation: { ok: true },
                build: { ok: true },
                test: { ok: false }
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: activity");
    expect(html).toContain("package: echoactivity");
    expect(html).toContain("module: example.com/acme/echo");
    expect(html).toContain("generated files: descriptor, implementation, test");
    expect(html).toContain("validation: passed");
    expect(html).toContain("build proof: passed");
    expect(html).toContain("test proof: failed");
  });

  it("renders trigger scaffold bundle summaries without a dedicated authoring UI", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-2",
            type: "contrib_bundle",
            name: "trigger-bundle-webhooktrigger",
            uri: "memory://task-2/trigger-bundle-webhooktrigger",
            metadata: {
              result: {
                bundle: {
                  kind: "trigger",
                  packageName: "webhooktrigger",
                  modulePath: "example.com/acme/webhook",
                  files: [
                    { kind: "descriptor" },
                    { kind: "metadata" },
                    { kind: "implementation" },
                    { kind: "test" }
                  ]
                },
                validation: { ok: true },
                build: { ok: true },
                test: { ok: true }
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("package: webhooktrigger");
    expect(html).toContain("module: example.com/acme/webhook");
    expect(html).toContain("generated files: descriptor, metadata, implementation, test");
    expect(html).toContain("test proof: passed");
  });
});
