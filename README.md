## Features

- User authentication with Nhost Auth
- Organization-based multi-user access
- Owner/editor permission model
- Workflow creation and editing
- Ordered workflow steps
- Supported step types:
  - LLM Call
  - HTTP Request
  - Conditional Branch
  - Approval Gate
  - Database Write
  - Notification
- Manual workflow execution
- Webhook trigger support
- Approval-gate pause/resume
- Live step-run monitoring using GraphQL subscriptions
- Organization execution quotas
- Row-level GraphQL permissions through Hasura
- Backend authorization inside Nhost Functions

## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- GraphQL
- graphql-ws

### Backend

- Nhost
- Hasura GraphQL Engine
- PostgreSQL
- Nhost Auth
- Nhost Functions
- Node.js / TypeScript

### External Services

- Groq-compatible LLM API (optional)
- HTTP APIs for HTTP Request workflow steps

---
### Prerequisites

The following are required for development:

- Node.js 20+
- npm
- An Nhost account/project
- Git

Nhost provides PostgreSQL, Hasura GraphQL, authentication, storage and serverless functions as part of the platform.

For local Nhost development, the Nhost CLI and Docker are required.

### Running the Frontend Locally

Clone the repository:

```
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <PROJECT_DIRECTORY>
```

Install dependencies:

```npm install```

Create:

```.env.local```

with:

NEXT_PUBLIC_NHOST_SUBDOMAIN=<your-nhost-subdomain>
NEXT_PUBLIC_NHOST_REGION=<your-nhost-region>


NEXT_PUBLIC_NHOST_GRAPHQL_URL=https://<subdomain>.graphql.<region>.nhost.run/v1


NEXT_PUBLIC_NHOST_GRAPHQL_WS_URL=wss://<subdomain>.graphql.<region>.nhost.run/v1/graphql

For example:

NEXT_PUBLIC_NHOST_SUBDOMAIN=your-project
NEXT_PUBLIC_NHOST_REGION=ap-south-1


NEXT_PUBLIC_NHOST_GRAPHQL_URL=https://your-project.graphql.ap-south-1.nhost.run/v1


NEXT_PUBLIC_NHOST_GRAPHQL_WS_URL=wss://your-project.graphql.ap-south-1.nhost.run/v1/graphql


Start the development server:

```npm run dev```

The application will normally be available at:

http://localhost:3000

### Nhost Backend

The backend is hosted by Nhost and consists of:

- PostgreSQL
- Hasura GraphQL
- Nhost Auth
- Nhost Functions

The Functions directory contains the backend workflow execution logic.

The main execution function is:

functions/engine.ts

The main entry points are:

functions/triggerWorkflowRun.ts
functions/approveStep.ts
functions/workflowWebhook.ts

### Running Nhost Locally

If local Nhost development is required, install the Nhost CLI and Docker.

Then:

nhost login
nhost init
nhost up

The Nhost CLI can start a local PostgreSQL, Hasura, Auth, Storage and Functions environment.

For the hosted project, the frontend can instead connect directly to the Nhost project using the environment variables described above.

### LLM Configuration

The LLM step supports an OpenAI-compatible chat completion endpoint.

The following environment variables can be configured for the Nhost Functions environment:

LLM_BASE_URL=<LLM_API_BASE_URL>
LLM_API_KEY=<LLM_API_KEY>
LLM_MODEL=<MODEL_NAME>

For example, when using a Groq-compatible API:

LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=<your-api-key>
LLM_MODEL=llama-3.1-8b-instant

The API key must only be configured on the backend.

It must NOT be exposed through a NEXT_PUBLIC_* variable.

Stubbed LLM Mode

The workflow engine also supports running without an LLM API key.

If:

LLM_API_KEY

is not configured, the LLM step returns a stubbed response.

This allows the workflow engine and UI to be tested without requiring an external LLM API key.

Example stub output:

{
  "stub": true,
  "text": "Stubbed LLM response for: ..."
}

Therefore, an external LLM API key is optional for basic local testing.

### Workflow Execution

A workflow contains ordered steps.

Example:

LLM Call
    ↓
HTTP Request
    ↓
Conditional Branch
    ↓
Approval Gate
    ↓
Notification

When a workflow is run:

A workflow_runs record is created.
A step_runs record is created for each workflow step.
The workflow engine executes the steps according to their position.
Each step-run is updated with its status and output.
The frontend observes step-run changes through a GraphQL subscription.

Possible run states include:

pending
running
paused
completed
failed
### Approval Gate

An approval gate pauses workflow execution.

When the engine reaches an approval gate:

Step status = paused
Workflow run status = paused

Execution stops at that point.

An authorized owner/editor can then click:

Approve

The frontend calls the approveStep Hasura Action.

The backend:

Verifies the step run.
Verifies that the workflow is currently paused.
Verifies that the user belongs to the organization.
Verifies that the user is an owner/editor.
Marks the approval step as completed.
Resumes the remaining workflow steps.

### Permissions

The application uses two authorization layers.

Layer 1 — Hasura GraphQL Permissions

Hasura provides row/column-level permissions for database operations.

These permissions prevent unauthorized users from directly reading or modifying organization data through GraphQL.

For example, organization membership can be used to restrict access to workflows belonging to the user's organization.

Hasura permissions are evaluated using the authenticated user's session and Hasura session variables.

Layer 2 — Backend Function Authorization

Critical workflow operations are also authorized inside Nhost Functions.

For example:

triggerWorkflowRun
approveStep

do not rely solely on the frontend to decide whether a user is allowed to perform an operation.

The backend extracts the authenticated user ID and checks organization membership before performing the operation.

This prevents a user from bypassing frontend restrictions by directly calling the backend endpoint.

### Development Commands

Install dependencies:

```npm install```

Run development server:

```npm run dev```

Type-check:

```npm run typecheck```

Production build:

```npm run build```

Production server:

```npm start```