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
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-1/contrib_bundle/artifact-1.json",
                durablePayload: true
              },
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
    expect(html).toContain("durable payload: blob-backed");
    expect(html).toContain("blob path: task-artifacts/demo/task-1/contrib_bundle/artifact-1.json");
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
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-2/contrib_bundle/artifact-2.json",
                durablePayload: true
              },
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
    expect(html).toContain("durable payload: blob-backed");
    expect(html).toContain("test proof: passed");
  });

  it("renders action scaffold bundle summaries using the shared contribution artifact surface", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-3",
            type: "contrib_bundle",
            name: "action-bundle-flowaction",
            uri: "memory://task-3/action-bundle-flowaction",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-3/contrib_bundle/artifact-3.json",
                durablePayload: true
              },
              result: {
                bundle: {
                  kind: "action",
                  packageName: "flowaction",
                  modulePath: "example.com/acme/flow-action",
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

    expect(html).toContain("contribution type: action");
    expect(html).toContain("package: flowaction");
    expect(html).toContain("module: example.com/acme/flow-action");
    expect(html).toContain("generated files: descriptor, metadata, implementation, test");
    expect(html).toContain("durable payload: blob-backed");
    expect(html).toContain("build proof: passed");
  });

  it("renders shared contribution validation report summaries", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-4",
            type: "contrib_validation_report",
            name: "action-validation-flowaction",
            uri: "memory://task-4/action-validation-flowaction",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-4/contrib_validation_report/artifact-4.json",
                durablePayload: true
              },
              result: {
                bundle: {
                  kind: "action",
                  packageName: "flowaction",
                  modulePath: "example.com/acme/flow-action",
                  files: [{ kind: "descriptor" }, { kind: "implementation" }, { kind: "test" }]
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

    expect(html).toContain("contribution type: action");
    expect(html).toContain("generated files: descriptor, implementation, test");
    expect(html).toContain("validation: passed");
    expect(html).toContain("durable payload: blob-backed");
  });

  it("renders packaged contribution summaries with package metadata", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-5",
            type: "contrib_package",
            name: "trigger-package-webhooktrigger",
            uri: "memory://task-5/trigger-package-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-5/contrib_package/artifact-5.json",
                durablePayload: true
              },
              result: {
                bundle: {
                  kind: "trigger",
                  packageName: "webhooktrigger",
                  modulePath: "example.com/acme/webhook",
                  files: [{ kind: "descriptor" }, { kind: "implementation" }, { kind: "test" }]
                },
                package: {
                  format: "zip",
                  fileName: "webhooktrigger.zip",
                  bytes: 2048
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
    expect(html).toContain("package file: webhooktrigger.zip");
    expect(html).toContain("package format: zip");
    expect(html).toContain("package bytes: 2048");
    expect(html).toContain("blob path: task-artifacts/demo/task-5/contrib_package/artifact-5.json");
  });
});
