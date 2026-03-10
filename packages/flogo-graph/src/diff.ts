import type { FlogoAppGraph } from "@flogo-agent/contracts";

export function summarizeGraphDiff(previousGraph: FlogoAppGraph, nextGraph: FlogoAppGraph): string[] {
  const changes: string[] = [];

  if (previousGraph.triggers.length !== nextGraph.triggers.length) {
    changes.push(
      `Triggers changed from ${previousGraph.triggers.length} to ${nextGraph.triggers.length}.`
    );
  }

  if (previousGraph.resources.length !== nextGraph.resources.length) {
    changes.push(
      `Resources changed from ${previousGraph.resources.length} to ${nextGraph.resources.length}.`
    );
  }

  const previousImports = new Set(previousGraph.imports.map((entry) => entry.alias));
  for (const entry of nextGraph.imports) {
    if (!previousImports.has(entry.alias)) {
      changes.push(`Added import alias ${entry.alias}.`);
    }
  }

  return changes.length ? changes : ["No graph-level changes detected."];
}

