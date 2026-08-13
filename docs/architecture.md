# Architecture and security

## Runtime

The frontend is a conventional Next.js App Router application. It talks to Nhost Cloud using the Nhost JS SDK and GraphQL. Nhost Functions are independent Node.js 20 serverless functions; there is no Docker or long-running Express server.

## Layer 1: org/role scoping

The existing Hasura permissions supplied with this project are the primary row-level security boundary. Reads and writes are scoped through `org_members.user_id = X-Hasura-User-Id` and the relevant role. The UI hides unavailable actions, but the UI is not trusted for security.

## Layer 2: action-level gating

`triggerWorkflowRun` checks the caller's user ID against the workflow's organization membership and requires owner/editor. `approveStep` repeats the membership lookup itself and only allows owner/editor to approve a paused run. This is deliberately implemented in the Action handler because approval is a mid-execution authorization decision.

## Execution

A run creates one `workflow_run` and one `step_run` per configured step. Each step is updated as pending/running/completed/failed/paused. The approval gate changes both the step and workflow run to paused and returns without executing later steps. `approveStep` marks the gate approved and resumes from the next workflow step.

LLM and HTTP steps have two attempts. LLM configuration uses an OpenAI-compatible endpoint; Groq is the documented free-tier option. If no key is configured, the LLM function uses a clearly disclosed artificial-delay stub so the workflow can still be demonstrated.

## Conditional branch

A conditional step evaluates the previous output using `field`, `operator` and `value`. Optional `then_positions` and `else_positions` arrays identify workflow positions to skip. This gives a real execution difference without changing the fixed-position database model.

## Quota

The Action checks `quota_used < quota_limit` before starting. A completed run increments `quota_used`; paused approval runs do not consume the completion increment until they finish. For high-concurrency production use, replace this simple counter with a database-side reservation/ledger transaction.

## Realtime

The frontend opens a GraphQL WebSocket subscription filtered by `workflow_run_id`. The browser updates the step monitor directly from `step_runs`, including the paused approval state.

## Notify Event Trigger

Because the supplied seven-table schema has no notification/outbox table, the repository includes an optional `workflow_notifications` table migration. The notify step inserts an outbox row; Hasura's INSERT Event Trigger calls `notifyEvent`. This keeps delivery outside the workflow execution loop.
