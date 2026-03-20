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
                  packageName: "echoactivity",
                  modulePath: "example.com/acme/echo"
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

    expect(html).toContain("package: echoactivity");
    expect(html).toContain("module: example.com/acme/echo");
    expect(html).toContain("validation: passed");
    expect(html).toContain("build proof: passed");
    expect(html).toContain("test proof: failed");
  });
});
