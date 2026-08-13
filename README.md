# AgentFlow — AI Agent Workflow Builder

Full-stack assignment implementation using **Next.js + Nhost Cloud + Hasura + PostgreSQL + GraphQL + Nhost Functions**.

> This repository is intentionally cloud-first. The supplied Nhost project already contains the core tables, relationships and Hasura permissions. The application does not recreate them and does not require Docker.

## Nhost project

- Subdomain: `mlimswxxskorovtgheqc`
- Region: `ap-south-1`

Nhost supports Node.js 20/22 functions; this repository pins the function runtime to Node 20. urlNhost function runtimeshttps://docs.nhost.io/products/functions/runtimes

## Repository structure

```text
app/                  Next.js App Router pages
components/           UI components
lib/                  Nhost/GraphQL client code
functions/             Nhost Node.js functions
hasura/                Action definitions and metadata notes
docs/                  architecture/security/demo notes
graphqlschema.json     supplied Hasura metadata export
database-bootstrap-demo.sql  optional Org A/B membership bootstrap
```

There is deliberately **no Dockerfile, docker-compose, local PostgreSQL or standalone Express application**. Express is used only as the HTTP request/response interface exposed by Nhost Functions, which is the Nhost-supported function model. urlNhost environment variables/functions examplehttps://docs.nhost.io/platform/cloud/environment-variables

## 1. Configure frontend

Create `.env.local`:

```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=mlimswxxskorovtgheqc
NEXT_PUBLIC_NHOST_REGION=ap-south-1
NEXT_PUBLIC_NHOST_GRAPHQL_URL=https://mlimswxxskorovtgheqc.graphql.ap-south-1.nhost.run/v1
NEXT_PUBLIC_NHOST_GRAPHQL_WS_URL=wss://mlimswxxskorovtgheqc.graphql.ap-south-1.nhost.run/v1/graphql
```

Nhost's Next.js documentation uses the Nhost JS SDK and `NHOST_REGION`/`NHOST_SUBDOMAIN` as the connection configuration. citeturn2search7

Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 2. Configure Nhost Functions

The `functions/` folder contains:

- `triggerWorkflowRun.ts` — Hasura Action entrypoint
- `approveStep.ts` — approval Action entrypoint
- `workflowWebhook.ts` — inbound webhook trigger
- `scheduledWorkflow.ts` — scheduled trigger handler
- `databaseEvent.ts` — event trigger handler
- `_shared.ts` and `engine.ts` — shared execution logic

Configure these **Nhost Cloud environment variables** in the Nhost dashboard:

```text
LLM_API_KEY=<Groq/OpenRouter/Gemini-compatible key>
LLM_MODEL=llama-3.1-8b-instant
LLM_BASE_URL=https://api.groq.com/openai/v1
```

Nhost automatically supplies `NHOST_ADMIN_SECRET`, `NHOST_GRAPHQL_URL`, `NHOST_REGION`, `NHOST_SUBDOMAIN`, etc. to Functions. urlNhost environment variableshttps://docs.nhost.io/platform/cloud/environment-variables

Do **not** put `NHOST_ADMIN_SECRET` or `LLM_API_KEY` in the frontend or GitHub.

## 3. Add the Actions

Your existing Hasura metadata already contains `triggerWorkflowRun`. Keep it and add the `approveStep` Action from `hasura/actions.yaml`.

Both handlers use:

```text
https://mlimswxxskorovtgheqc.functions.ap-south-1.nhost.run/v1/<function>
```

`forward_client_headers: true` is required so the function can read the authenticated Hasura user ID.

## 4. Optional demo bootstrap

If Org A/B and the memberships have not been created, run `database-bootstrap-demo.sql` against the Nhost database. It looks up the six existing Nhost auth users by email and creates:

- Org A: ownerA/editorA/viewerA
- Org B: ownerB/editorB/viewerB

Do not run it repeatedly if you do not want the organizations reused by name.

## 5. GraphQL subscription

The frontend subscribes to `step_runs` filtered by `workflow_run_id` over the Hasura WebSocket endpoint. This is a real subscription, not polling.

## 6. Security

The supplied Hasura permissions remain the first security boundary. They prevent cross-org reads/writes even when a user knows another UUID.

The functions implement the second boundary:

- trigger: owner/editor in the workflow's organization
- approval: owner/editor in the workflow's organization
- approval requires the run to be paused
- approval records `approved_by` and `approved_at`

See `docs/architecture.md`.

## 7. Final scenario

See `docs/demo.md` for the exact Org A/Org B walkthrough.

## Deployment

### Next.js → Vercel

Set the four `NEXT_PUBLIC_*` variables from `.env.example`, then deploy the repository as a Next.js application. Do not expose Nhost admin secrets to Vercel.

### Functions → Nhost Cloud

Deploy the `functions/` directory using the Nhost CLI/dashboard for your existing project. Nhost Functions support npm and Node.js 20/22. citeturn1search0

## Important implementation note

The database schema supplied with this project does not contain a separate arbitrary `workflow_results` table. Therefore `db_write` persists its result into the execution ledger (`step_runs.output`) rather than inventing a new core table. This keeps the implementation aligned with the provided schema.

## Webhook trigger URL

After adding a `webhook` row in `workflow_triggers`, use:

```text
https://mlimswxxskorovtgheqc.functions.ap-south-1.nhost.run/v1/workflowWebhook?trigger_id=<workflow_trigger_uuid>
```

POST any JSON body to it. The function loads the trigger and workflow from Hasura and starts the same execution engine. The workflow's `workflow_triggers.type = webhook` and `enabled` flags are checked before execution.

## Notify Event Trigger

For the optional `notify` step, run `database/notify-event.sql`, track `workflow_notifications` in Hasura, and configure an INSERT Event Trigger to call `notifyEvent`. The step inserts an outbox row; Hasura then invokes the function. See `hasura/event-trigger.md`.
