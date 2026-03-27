## Canonical Reference Corpus

### Tier 0 — Normative official docs

- **Introduction**  
  URL: https://tibcosoftware.github.io/flogo/introduction/  
  Why: Official ecosystem overview for the trigger/action model, core terminology, and major Flogo capability areas. Use this to anchor high-level reasoning before narrowing to app-model, flow, or CLI specifics.  
  Tags: `overview` `ecosystem` `triggers` `actions` `core-concepts`  
  Priority: `strongly-recommended`

- **App Model**  
  URL: https://tibcosoftware.github.io/flogo/development/apps/app-configuration/  
  Why: Primary normative reference for `flogo.json` structure, root properties, triggers, resources, and application configuration shape. This is the top document for authoring and validating app descriptors.  
  Tags: `app-model` `flogo-json` `app-configuration` `triggers` `resources`  
  Priority: `required`

- **Flows**  
  URL: https://tibcosoftware.github.io/flogo/development/flows/  
  Why: Top-level flow documentation that scopes core flow concepts and points to the normative pages for mappings, iterators, retries, and flow constructs. Use it as the entry point for flow semantics.  
  Tags: `flows` `flow-concepts` `subflows` `authoring`  
  Priority: `strongly-recommended`

- **Flow Input/Output Params**  
  URL: https://tibcosoftware.github.io/flogo/development/flows/io-parameters/  
  Why: Normative source for flow metadata input/output parameters and how flows consume and return data. Critical for validating handler-to-flow wiring and flow input/output mismatches.  
  Tags: `flows` `flow-io` `metadata` `inputs` `outputs`  
  Priority: `required`

- **Mappings**  
  URL: https://tibcosoftware.github.io/flogo/development/flows/mapping/  
  Why: Primary semantics reference for mapping types, resolvers, and expression syntax. This is the first place to ground any reasoning about `=` prefixes, resolver scope, or mapping correctness.  
  Tags: `flows` `mappings` `expressions` `resolvers` `scopes`  
  Priority: `required`

- **Iterator**  
  URL: https://tibcosoftware.github.io/flogo/development/flows/iterators/  
  Why: Normative explanation of iterator behavior and the single-activity iteration model. Required when the agent must debug or author looped activity execution correctly.  
  Tags: `flows` `iterators` `foreach` `subflow`  
  Priority: `strongly-recommended`

- **flogo CLI Reference**  
  URL: https://tibcosoftware.github.io/flogo/flogo-cli/flogo-cli/  
  Why: Official command reference for `flogo build`, `create`, `imports`, `install`, `list`, `plugin`, and `update`. This is the normative CLI surface for build and dependency workflows.  
  Tags: `cli` `build` `create` `imports` `install` `list` `plugin` `update`  
  Priority: `required`

### Tier 1 — First-party source repos

- **project-flogo/core**  
  URL: https://github.com/project-flogo/core  
  Why: Implementation-level truth for Flogo core runtime behavior, extension points, and schema-adjacent internals. Use it when official docs do not fully explain runtime behavior or app execution semantics.  
  Tags: `core` `runtime` `schema` `interfaces` `execution`  
  Priority: `required`

- **project-flogo/core schema.json**  
  URL: https://raw.githubusercontent.com/project-flogo/core/master/schema.json  
  Why: Concrete upstream app schema used to validate `flogo.json` structure and catch descriptor drift. This is the machine-readable schema source the agent should consult before inferring app-model behavior.  
  Tags: `core` `schema` `app-model` `flogo-json`  
  Priority: `strongly-recommended`

- **project-flogo/core example app**  
  URL: https://raw.githubusercontent.com/project-flogo/core/master/examples/engine/flogo.json  
  Why: First-party example descriptor for a core app shape. Useful for validating how documented app-model rules appear in a real upstream `flogo.json`.  
  Tags: `core` `example` `flogo-json` `app-model`  
  Priority: `strongly-recommended`

- **project-flogo/flow**  
  URL: https://github.com/project-flogo/flow  
  Why: Implementation truth for the flow engine, flow action behavior, and flow execution semantics. Consult it when flow behavior, mappings, or engine edge cases are under-specified in docs.  
  Tags: `flow` `engine` `flows` `runtime` `execution`  
  Priority: `required`

- **project-flogo/flow example app**  
  URL: https://raw.githubusercontent.com/project-flogo/flow/master/examples/log-flogo.json  
  Why: Concrete upstream flow example that helps validate how flow resources, mappings, and flow refs are expressed in practice. Useful for example-grounded repair and regression tests.  
  Tags: `flow` `example` `flogo-json` `mappings`  
  Priority: `strongly-recommended`

- **project-flogo/contrib**  
  URL: https://github.com/project-flogo/contrib  
  Why: First-party source for standard triggers, activities, and functions used by real apps. Required to resolve concrete package refs, config behavior, and integration-specific implementation details for contrib components.  
  Tags: `contrib` `triggers` `activities` `functions` `integrations`  
  Priority: `required`

- **project-flogo/flogo-web**  
  URL: https://github.com/project-flogo/flogo-web  
  Why: First-party source for the Web UI that generates and edits Flogo artifacts. Important when the agent must reason about Web UI–generated `flogo.json`, flow metadata, or UI-specific artifact shapes alongside CLI workflows.  
  Tags: `webui` `generated-artifacts` `editor` `ui` `flows`  
  Priority: `strongly-recommended`

- **TIBCOSoftware/flogo**  
  URL: https://github.com/TIBCOSoftware/flogo  
  Why: Legacy first-party umbrella repo for older implementation details and examples that predate the split `project-flogo/*` repos. Keep it as a first-party alias/history source, not as the preferred source over directly scoped current docs or repos.  
  Tags: `legacy-upstream` `ecosystem` `history` `examples`  
  Priority: `optional`

- **TIBCOSoftware/flogo-cli**  
  URL: https://github.com/TIBCOSoftware/flogo-cli  
  Why: Legacy first-party standalone CLI repo useful for older command behavior, packaging history, and alias tracing. Use it as a secondary source when the current docs or release behavior need historical confirmation.  
  Tags: `legacy-cli` `cli` `history` `commands`  
  Priority: `optional`

### Tier 2 — Official labs and examples

- **Building apps with Flogo CLI**  
  URL: https://tibcosoftware.github.io/flogo/labs/flogo-cli/  
  Why: Official example-oriented walkthrough for creating and building apps with the CLI. Useful for practical end-to-end command sequences and expected project flow, but not the top normative source when the command reference disagrees.  
  Tags: `cli` `examples` `build` `create` `ci-cd`  
  Priority: `strongly-recommended`

- **My First App: Hello World**  
  URL: https://tibcosoftware.github.io/flogo/labs/helloworld/  
  Why: Baseline first-party example for app creation, adding a flow, wiring a trigger, returning data, building, and running. This is the simplest official reference for how a minimal app is assembled in practice.  
  Tags: `examples` `hello-world` `basic-app` `rest` `build` `run`  
  Priority: `required`

### Tier 3 — Operational trigger/activity references

- **Web UI Functions Catalog**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/functions/  
  Why: Official catalog for built-in functions exposed through the Web UI and used in mappings. Important when debugging mapping expressions or reconciling Web UI-generated function usage with flow semantics.  
  Tags: `webui` `functions` `mappings` `expressions`  
  Priority: `strongly-recommended`

- **Web UI Trigger Catalog**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/triggers/  
  Why: Official trigger index for available first-party trigger types. Use it to discover the supported trigger set before dropping to individual trigger docs or contrib source.  
  Tags: `webui` `triggers` `trigger-catalog`  
  Priority: `strongly-recommended`

- **REST Trigger**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/triggers/rest/  
  Why: Official operational reference for REST trigger installation, settings, handler settings, outputs, reply shape, and example configs. This is the main trigger doc for HTTP-inbound app creation and debugging.  
  Tags: `trigger-rest` `http` `handlers` `reply` `path-params`  
  Priority: `required`

- **REST Activity**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/activities/rest/  
  Why: Official operational reference for outbound REST invocation, including settings, input, output, SSL, headers, and path/query parameter handling. Important for apps that call external HTTP services.  
  Tags: `activity-rest` `http` `outbound` `ssl` `headers`  
  Priority: `strongly-recommended`

- **App Trigger**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/triggers/app/  
  Why: Official source for application lifecycle trigger behavior, especially startup and shutdown handlers. Required for agents that must reason about lifecycle events rather than only external request/event triggers.  
  Tags: `trigger-app` `lifecycle` `startup` `shutdown`  
  Priority: `strongly-recommended`

- **Timer Trigger**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/triggers/timer/  
  Why: Official operational reference for scheduled and repeating jobs. Needed for authoring and debugging timer-driven apps and non-HTTP periodic workflows.  
  Tags: `trigger-timer` `scheduling` `jobs` `cron-like`  
  Priority: `strongly-recommended`

- **Kafka Trigger**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/triggers/kafka/  
  Why: Official operational reference for inbound Kafka event handling, including configuration and testing details. Required for agents that must support event-driven integration flows beyond REST.  
  Tags: `trigger-kafka` `kafka` `events` `testing`  
  Priority: `strongly-recommended`

- **Kafka Activity**  
  URL: https://tibcosoftware.github.io/flogo/development/webui/activities/kafka/  
  Why: Official operational reference for outbound Kafka publishing and related configuration. Needed when the agent must wire producer-style Kafka flows or debug Kafka activity configuration.  
  Tags: `activity-kafka` `kafka` `events` `producer`  
  Priority: `strongly-recommended`

## Reference Usage Rules

- Prefer Tier 0 docs over every other tier for semantics, authoring guidance, `flogo.json` structure, flow behavior, mappings, iterators, and documented CLI workflows.
- Use Tier 1 repos to resolve undocumented or under-documented behavior, runtime-level questions, package-level configuration details, contrib implementation behavior, and CLI internals.
- Use Tier 2 labs and examples only as examples of expected workflow and artifact shape; never treat them as the sole authority when Tier 0 docs or Tier 1 source disagree.
- Use Tier 3 trigger/activity references whenever the task involves a concrete integration, handler contract, trigger output shape, activity input/output contract, or Web UI catalog lookup.
- When multiple sources conflict, prefer the most normative and most directly scoped official source in this order: Tier 0 docs, then the directly relevant Tier 1 repo, then Tier 2 examples.
- Prefer the most directly scoped page over a broader one, such as REST Trigger over the generic trigger catalog, or Flow Input/Output Params over the general Flows page.
- Treat docs as normative for behavior the docs explicitly define; treat source as authoritative for implementation details and edge cases the docs do not fully specify.
- Use legacy first-party repos only when the directly scoped current docs or `project-flogo/*` repos do not answer the question.
- Never synthesize unsupported behavior, undocumented schema, or CLI semantics without grounding the claim in at least one canonical source from this corpus.

## Minimal Required Set for MVP Agent

For an MVP terminal agent that can generate a basic app, reason about `flogo.json`, understand flow I/O, run CLI build workflows, support a REST-triggered flow, and debug common mapping and wiring mistakes, index this subset first:

- https://tibcosoftware.github.io/flogo/development/apps/app-configuration/
- https://tibcosoftware.github.io/flogo/development/flows/io-parameters/
- https://tibcosoftware.github.io/flogo/development/flows/mapping/
- https://tibcosoftware.github.io/flogo/flogo-cli/flogo-cli/
- https://tibcosoftware.github.io/flogo/labs/flogo-cli/
- https://tibcosoftware.github.io/flogo/labs/helloworld/
- https://tibcosoftware.github.io/flogo/development/webui/triggers/rest/
- https://github.com/project-flogo/core
- https://github.com/project-flogo/flow
- https://github.com/project-flogo/contrib
- https://raw.githubusercontent.com/project-flogo/core/master/schema.json

## Expanded Set for Production Reliability

For a production-grade agent that must debug mapping failures, reason about iterators, support app lifecycle triggers, timer jobs, Kafka event flows, common contrib integrations, and Web UI-generated artifacts, also index these references:

- https://tibcosoftware.github.io/flogo/introduction/
- https://tibcosoftware.github.io/flogo/development/flows/
- https://tibcosoftware.github.io/flogo/development/flows/iterators/
- https://tibcosoftware.github.io/flogo/development/webui/functions/
- https://tibcosoftware.github.io/flogo/development/webui/triggers/
- https://tibcosoftware.github.io/flogo/development/webui/activities/rest/
- https://tibcosoftware.github.io/flogo/development/webui/triggers/app/
- https://tibcosoftware.github.io/flogo/development/webui/triggers/timer/
- https://tibcosoftware.github.io/flogo/development/webui/triggers/kafka/
- https://tibcosoftware.github.io/flogo/development/webui/activities/kafka/
- https://github.com/project-flogo/flogo-web
- https://github.com/TIBCOSoftware/flogo
- https://github.com/TIBCOSoftware/flogo-cli
- https://raw.githubusercontent.com/project-flogo/core/master/examples/engine/flogo.json
- https://raw.githubusercontent.com/project-flogo/flow/master/examples/log-flogo.json
