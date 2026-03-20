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

  it("renders install-plan summaries with readiness, target app, and proposed entries", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-6",
            type: "contrib_install_plan",
            name: "trigger-install-plan-webhooktrigger",
            uri: "memory://task-6/trigger-install-plan-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-6/contrib_install_plan/artifact-6.json",
                durablePayload: true
              },
              result: {
                contributionKind: "trigger",
                bundle: {
                  kind: "trigger",
                  packageName: "webhooktrigger",
                  modulePath: "example.com/acme/webhook",
                  files: [{ kind: "descriptor" }, { kind: "implementation" }, { kind: "test" }]
                },
                targetApp: {
                  appId: "hello-rest"
                },
                selectedAlias: "webhooktrigger",
                installReady: false,
                readiness: "medium",
                proposedImports: [
                  {
                    alias: "webhooktrigger",
                    ref: "example.com/acme/webhook",
                    action: "reuse_existing"
                  }
                ],
                proposedRefs: [
                  {
                    surface: "triggerRef",
                    value: "#webhooktrigger"
                  }
                ],
                warnings: ["Target app already imports this ref under a different alias."],
                conflicts: [
                  {
                    kind: "ref_already_imported",
                    severity: "warning",
                    message: "Target app already imports this ref under alias webhook."
                  }
                ],
                recommendedNextAction: "Reuse the existing alias before applying later app changes."
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("target app: hello-rest");
    expect(html).toContain("selected alias: webhooktrigger");
    expect(html).toContain("proposed imports: webhooktrigger -&gt; example.com/acme/webhook (reuse_existing)");
    expect(html).toContain("proposed refs: triggerRef: #webhooktrigger");
    expect(html).toContain("install ready: no");
    expect(html).toContain("readiness: medium");
    expect(html).toContain("warnings: 1");
    expect(html).toContain("conflicts: 1");
    expect(html).toContain("next action: Reuse the existing alias before applying later app changes.");
    expect(html).toContain("blob path: task-artifacts/demo/task-6/contrib_install_plan/artifact-6.json");
  });

  it("renders exact install diff-plan summaries with freshness, changed paths, and next action", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-7",
            type: "contrib_install_diff_plan",
            name: "trigger-install-diff-plan-webhooktrigger",
            uri: "memory://task-7/trigger-install-diff-plan-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-7/contrib_install_diff_plan/artifact-7.json",
                durablePayload: true
              },
              result: {
                contributionKind: "trigger",
                sourceContribution: {
                  kind: "trigger",
                  packageName: "webhooktrigger",
                  modulePath: "example.com/acme/webhook",
                  selectedAlias: "webhooktrigger",
                  source: "package_artifact"
                },
                targetApp: {
                  appId: "hello-rest"
                },
                previewAvailable: true,
                isStale: false,
                installReady: true,
                readiness: "high",
                warnings: [],
                conflicts: [],
                predictedChanges: {
                  importsToAdd: [
                    {
                      alias: "webhooktrigger",
                      ref: "example.com/acme/webhook",
                      action: "add"
                    }
                  ],
                  importsToUpdate: [],
                  refsToAdd: [
                    {
                      surface: "triggerRef",
                      value: "#webhooktrigger"
                    }
                  ],
                  refsToReuse: [],
                  changedPaths: ["imports"],
                  structuralChanges: ["Add import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
                  diffEntries: [],
                  noMutation: true
                },
                diffSummary: ["imports: add \"webhooktrigger\" -> \"example.com/acme/webhook\""],
                recommendedNextAction: "Review the exact canonical import diff."
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("target app: hello-rest");
    expect(html).toContain("selected alias: webhooktrigger");
    expect(html).toContain("preview available: yes");
    expect(html).toContain("stale: no");
    expect(html).toContain("changed paths: imports");
    expect(html).toContain("diff summary: imports: add &quot;webhooktrigger&quot; -&gt; &quot;example.com/acme/webhook&quot;");
    expect(html).toContain("proposed imports: webhooktrigger -&gt; example.com/acme/webhook (add)");
    expect(html).toContain("proposed refs: triggerRef: #webhooktrigger");
    expect(html).toContain("blob path: task-artifacts/demo/task-7/contrib_install_diff_plan/artifact-7.json");
  });
});
