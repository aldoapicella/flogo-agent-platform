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

  it("renders contribution update-plan summaries with installed-match evidence and conservative replacements", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-9",
            type: "contrib_update_plan",
            name: "trigger-update-plan-webhooktrigger",
            uri: "memory://task-9/trigger-update-plan-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-9/contrib_update_plan/artifact-9.json",
                durablePayload: true
              },
              result: {
                contributionKind: "trigger",
                targetApp: {
                  appId: "hello-rest"
                },
                bundle: {
                  kind: "trigger",
                  packageName: "webhooktrigger",
                  modulePath: "example.com/acme/webhook",
                  files: [{ kind: "descriptor" }, { kind: "implementation" }, { kind: "test" }]
                },
                modulePath: "example.com/acme/webhook",
                selectedAlias: "webhooktrigger",
                detectedInstalledContribution: {
                  alias: "webhooktrigger",
                  ref: "example.com/acme/webhook",
                  version: "0.1.0",
                  matchedBy: ["alias+ref"],
                  confidence: "high"
                },
                matchQuality: "exact",
                compatibility: "compatible",
                updateReady: true,
                readiness: "high",
                predictedChanges: {
                  importsToReplace: [
                    {
                      alias: "webhooktrigger",
                      ref: "example.com/acme/webhook",
                      action: "replace_existing"
                    }
                  ],
                  importsToKeep: [],
                  importsToAdd: [],
                  importsToRemove: [],
                  refsToReplace: [
                    {
                      surface: "triggerRef",
                      value: "#webhooktrigger"
                    }
                  ],
                  refsToKeep: [],
                  refsToAdd: [],
                  refsToRemove: [],
                  changedPaths: ["imports"],
                  summaryLines: ["Replace import alias \"webhooktrigger\" in place."],
                  noMutation: true
                },
                warnings: [],
                conflicts: [],
                recommendedNextAction: "Review the update plan before requesting an exact update diff preview."
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("target app: hello-rest");
    expect(html).toContain("detected installed contribution: alias webhooktrigger, ref example.com/acme/webhook, version 0.1.0");
    expect(html).toContain("match quality: exact");
    expect(html).toContain("compatibility: compatible");
    expect(html).toContain("proposed imports: webhooktrigger -&gt; example.com/acme/webhook (replace_existing)");
    expect(html).toContain("proposed refs: triggerRef: #webhooktrigger");
    expect(html).toContain("update ready: yes");
    expect(html).toContain("readiness: high");
    expect(html).toContain("changed paths: imports");
    expect(html).toContain("next action: Review the update plan before requesting an exact update diff preview.");
    expect(html).toContain("blob path: task-artifacts/demo/task-9/contrib_update_plan/artifact-9.json");
  });

  it("renders contribution uninstall-plan summaries with readiness, orphan risk, and next action", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-uninstall-1",
            type: "contrib_uninstall_plan",
            name: "trigger-uninstall-plan-webhooktrigger",
            uri: "memory://task-uninstall/trigger-uninstall-plan-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-uninstall/contrib_uninstall_plan/artifact-uninstall-1.json",
                durablePayload: true
              },
              result: {
                targetApp: {
                  appId: "hello-rest"
                },
                selection: {
                  alias: "webhooktrigger"
                },
                detectedInstalledContribution: {
                  alias: "webhooktrigger",
                  ref: "example.com/acme/webhook",
                  version: "0.1.0",
                  contributionKind: "trigger",
                  matchedBy: ["alias"],
                  confidence: "medium"
                },
                matchQuality: "likely",
                contributionKind: "trigger",
                uninstallReady: false,
                readiness: "blocked",
                predictedChanges: {
                  importsToRemove: [
                    {
                      alias: "webhooktrigger",
                      ref: "example.com/acme/webhook",
                      action: "remove"
                    }
                  ],
                  affectedRefs: [
                    {
                      surface: "triggerRef",
                      value: "#webhooktrigger"
                    }
                  ],
                  directUsages: [
                    {
                      surface: "triggerRef",
                      path: "triggers.webhook.ref",
                      ref: "#webhooktrigger",
                      alias: "webhooktrigger",
                      summary: "Trigger \"webhook\" still uses the selected contribution."
                    }
                  ],
                  orphanRisks: [
                    {
                      surface: "triggerRef",
                      path: "triggers.webhook.ref",
                      ref: "#webhooktrigger",
                      alias: "webhooktrigger",
                      reason: "Removing import alias \"webhooktrigger\" would orphan the trigger ref.",
                      severity: "error"
                    }
                  ],
                  changedPaths: ["imports.webhooktrigger", "triggers.webhook.ref"],
                  summaryLines: ["Trigger \"webhook\" still uses the selected contribution."],
                  noMutation: true
                },
                blockedBy: [
                  {
                    code: "flogo.contrib.uninstall_plan.active_usage",
                    message: "Trigger \"webhook\" still uses the selected contribution.",
                    path: "triggers.webhook.ref",
                    severity: "error"
                  }
                ],
                warnings: ["Manual review is required before uninstall diff preview."],
                conflicts: [],
                recommendedNextAction: "replacement_required"
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("target app: hello-rest");
    expect(html).toContain("detected installed contribution: alias webhooktrigger, ref example.com/acme/webhook, version 0.1.0");
    expect(html).toContain("match quality: likely");
    expect(html).toContain("imports to remove: webhooktrigger -&gt; example.com/acme/webhook (remove)");
    expect(html).toContain("affected refs: triggerRef: #webhooktrigger");
    expect(html).toContain("uninstall ready: no");
    expect(html).toContain("readiness: blocked");
    expect(html).toContain("changed paths: imports.webhooktrigger, triggers.webhook.ref");
    expect(html).toContain("uninstall summary: Trigger &quot;webhook&quot; still uses the selected contribution.");
    expect(html).toContain("direct usages: 1");
    expect(html).toContain("orphan risks: 1");
    expect(html).toContain("blocked by: 1");
    expect(html).toContain("next action: replacement_required");
    expect(html).toContain("blob path: task-artifacts/demo/task-uninstall/contrib_uninstall_plan/artifact-uninstall-1.json");
  });

  it("renders exact update diff-plan summaries with freshness, changed paths, and next action", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-10",
            type: "contrib_update_diff_plan",
            name: "trigger-update-diff-plan-webhooktrigger",
            uri: "memory://task-10/trigger-update-diff-plan-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-10/contrib_update_diff_plan/artifact-10.json",
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
                detectedInstalledContribution: {
                  alias: "webhooktrigger",
                  ref: "example.com/acme/webhook",
                  version: "0.1.0",
                  matchedBy: ["alias+ref"],
                  confidence: "high"
                },
                targetApp: {
                  appId: "hello-rest"
                },
                basedOnUpdatePlan: {
                  sourceArtifactId: "artifact-update-plan-10"
                },
                previewAvailable: true,
                isStale: false,
                updateReady: true,
                readiness: "high",
                warnings: [],
                conflicts: [],
                predictedChanges: {
                  importsToReplace: [
                    {
                      alias: "webhooktrigger",
                      ref: "example.com/acme/webhook",
                      version: "0.2.0",
                      action: "replace_existing"
                    }
                  ],
                  importsToKeep: [],
                  importsToAdd: [],
                  importsToRemove: [],
                  refsToReplace: [
                    {
                      surface: "triggerRef",
                      value: "#webhooktrigger"
                    }
                  ],
                  refsToKeep: [],
                  refsToAdd: [],
                  refsToRemove: [],
                  changedPaths: ["imports"],
                  structuralChanges: ["Update import alias \"webhooktrigger\" version from \"0.1.0\" to \"0.2.0\"."],
                  diffEntries: [],
                  noMutation: true
                },
                diffSummary: ["Update import alias \"webhooktrigger\" version from \"0.1.0\" to \"0.2.0\"."],
                recommendedNextAction: "Review the exact canonical update diff."
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("target app: hello-rest");
    expect(html).toContain("detected installed contribution: alias webhooktrigger, ref example.com/acme/webhook, version 0.1.0");
    expect(html).toContain("source update-plan artifact: artifact-update-plan-10");
    expect(html).toContain("preview available: yes");
    expect(html).toContain("stale: no");
    expect(html).toContain("update ready: yes");
    expect(html).toContain("changed paths: imports");
    expect(html).toContain("diff summary: Update import alias &quot;webhooktrigger&quot; version from &quot;0.1.0&quot; to &quot;0.2.0&quot;.");
    expect(html).toContain("proposed imports: webhooktrigger -&gt; example.com/acme/webhook (replace_existing)");
    expect(html).toContain("proposed refs: triggerRef: #webhooktrigger");
    expect(html).toContain("blob path: task-artifacts/demo/task-10/contrib_update_diff_plan/artifact-10.json");
  });

  it("renders install apply summaries with approval, apply status, and changed canonical paths", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-8",
            type: "contrib_install_apply_result",
            name: "trigger-install-apply-webhooktrigger",
            uri: "memory://task-8/trigger-install-apply-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-8/contrib_install_apply_result/artifact-8.json",
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
                basedOnInstallDiffPlan: {
                  sourceArtifactId: "artifact-install-diff-8"
                },
                approvalRequired: true,
                applyReady: true,
                applied: true,
                isStale: false,
                readiness: "high",
                changedPaths: ["imports"],
                appliedImports: [
                  {
                    alias: "webhooktrigger",
                    ref: "example.com/acme/webhook",
                    action: "add"
                  }
                ],
                appliedRefs: [
                  {
                    surface: "triggerRef",
                    value: "#webhooktrigger"
                  }
                ],
                applySummary: ["Applied import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
                recommendedNextAction: "Review the updated canonical flogo.json artifact."
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("target app: hello-rest");
    expect(html).toContain("source diff artifact: artifact-install-diff-8");
    expect(html).toContain("approval required: yes");
    expect(html).toContain("apply ready: yes");
    expect(html).toContain("applied: yes");
    expect(html).toContain("changed paths: imports");
    expect(html).toContain("applied imports: webhooktrigger -&gt; example.com/acme/webhook (add)");
    expect(html).toContain("applied refs: triggerRef: #webhooktrigger");
    expect(html).toContain("apply summary: Applied import alias &quot;webhooktrigger&quot; for ref &quot;example.com/acme/webhook&quot;.");
    expect(html).toContain("blob path: task-artifacts/demo/task-8/contrib_install_apply_result/artifact-8.json");
  });

  it("renders update apply summaries with approval, apply status, and changed canonical paths", () => {
    const html = renderToStaticMarkup(
      <ArtifactList
        artifacts={[
          {
            id: "artifact-11",
            type: "contrib_update_apply",
            name: "trigger-update-apply-webhooktrigger",
            uri: "memory://task-11/trigger-update-apply-webhooktrigger",
            metadata: {
              storage: {
                kind: "blob",
                blobPath: "task-artifacts/demo/task-11/contrib_update_apply/artifact-11.json",
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
                detectedInstalledContribution: {
                  alias: "webhooktrigger",
                  ref: "example.com/acme/webhook",
                  version: "0.1.0"
                },
                targetApp: {
                  appId: "hello-rest"
                },
                basedOnUpdateDiffPlan: {
                  sourceArtifactId: "artifact-update-diff-11",
                  updatePlanArtifactId: "artifact-update-plan-11"
                },
                approvalRequired: true,
                applyReady: true,
                applied: true,
                isStale: false,
                readiness: "high",
                changedPaths: ["imports"],
                appliedImports: [
                  {
                    alias: "webhooktrigger",
                    ref: "example.com/acme/webhook",
                    action: "replace_existing"
                  }
                ],
                appliedRefs: [
                  {
                    surface: "triggerRef",
                    value: "#webhooktrigger"
                  }
                ],
                applySummary: ["Applied the approved contribution update to canonical flogo.json."],
                recommendedNextAction: "Review the updated canonical flogo.json artifact."
              }
            }
          }
        ]}
      />
    );

    expect(html).toContain("contribution type: trigger");
    expect(html).toContain("target app: hello-rest");
    expect(html).toContain("detected installed contribution: alias webhooktrigger, ref example.com/acme/webhook, version 0.1.0");
    expect(html).toContain("source diff artifact: artifact-update-diff-11");
    expect(html).toContain("source update-plan artifact: artifact-update-plan-11");
    expect(html).toContain("approval required: yes");
    expect(html).toContain("apply ready: yes");
    expect(html).toContain("applied: yes");
    expect(html).toContain("changed paths: imports");
    expect(html).toContain("applied imports: webhooktrigger -&gt; example.com/acme/webhook (replace_existing)");
    expect(html).toContain("applied refs: triggerRef: #webhooktrigger");
    expect(html).toContain("apply summary: Applied the approved contribution update to canonical flogo.json.");
    expect(html).toContain("blob path: task-artifacts/demo/task-11/contrib_update_apply/artifact-11.json");
  });
});
