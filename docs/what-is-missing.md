# What Is Missing

This document captures the main gaps between the current implementation and the target product: a Claude/Codex-style conversational coding agent specifically for Flogo apps.

## Current State

The product already has:

- local daemon-backed sessions
- chat CLI and TUI clients
- persisted transcript, plan, events, and approval state
- streaming session snapshots from daemon to clients
- undo for agent-authored edits
- Flogo schema and semantic validation
- model-backed planning, responses, and repair generation
- Flogo build and test execution
- citations from official Flogo sources

The remaining work is mostly in conversation quality, deeper Flogo capability coverage, and product hardening.

## Phase 1: Deepen The Conversational Loop

The chat loop is now model-planned, but it is still narrower than the research target. It still feels more like a strong Flogo workflow agent than a full Codex-like co-developer.

Needed work:

- stream assistant text and tool output incrementally instead of only snapshot-level updates
- expand the new structured inspection steps beyond the current descriptor/runtime/build/local-testing path
- let the model choose among richer structured tools more consistently instead of still falling back to the coarse repair/build/test pipeline for many tasks
- persist richer turn state beyond the current step observations: partial plans, intermediate tool progress, and longer-lived working memory
- add explicit slash-command handling without relying on text heuristics

Acceptance target:

- the agent can handle multi-turn Flogo debugging and creation tasks conversationally without collapsing back to a single repair pass

## Phase 2: Deepen Flogo Coverage

The Flogo intelligence is useful but still incomplete for a production-grade Flogo agent.

Needed work:

- expand validation for triggers, handlers, activities, links, reply mappings, and extension-specific constraints
- expand repairs beyond the current safe cases
- support broader Flogo app creation and modification flows, not only repair-centric turns
- support richer CLI operations such as dependency maintenance and plugin workflows when the agent decides they are needed
- improve executable-test handling across more app shapes and failure modes

Acceptance target:

- the agent can create, repair, modify, build, and test a wider range of real Flogo apps with minimal manual intervention

## Phase 3: Improve Session UX

The session runtime exists, but the user experience is still basic.

Needed work:

- improve chat CLI interaction with better live tool output
- improve the TUI with dedicated panes for transcript, plan, approvals, artifacts, and logs
- make session discovery richer than the current basic picker
- add artifact browsing and log drill-down in both clients
- support slash-command ergonomics consistently across clients

Acceptance target:

- the product feels like a real interactive coding agent rather than a wrapper around stored reports

## Phase 4: Safety and Sandbox Hardening

The current policy is review-gated, but execution hardening is still shallow.

Needed work:

- move from the current hardened Docker profile to a stronger isolated profile
- classify tools and commands by risk level, network behavior, and approval requirements
- block more destructive or secret-sensitive operations explicitly
- add auditable patch/application history per session
- improve artifact retention and log discoverability

Acceptance target:

- users can trust the agent to operate safely on local Flogo repos by default

## Phase 5: Evaluation And Reliability

The repo has tests, but the product still needs stronger success measurement against the research goals.

Needed work:

- enlarge the benchmark corpus with more real-world Flogo failures
- track build success, test pass rate, and convergence within repair iterations
- add regression suites for model-backed turns and conversational session behaviors
- test daemon restart recovery and concurrent session usage more aggressively
- turn benchmark summaries into enforced gates instead of informational output

Acceptance target:

- the team can measure whether the agent is improving or regressing on real Flogo tasks

## Recommended Next Order

1. Expand Flogo validation and repair coverage.
2. Stream assistant/tool output, not just session snapshots.
3. Improve TUI and chat UX around approvals, artifacts, logs, and slash commands.
4. Harden isolated execution and risk policy further.
5. Turn benchmark reporting into enforced quality gates.
