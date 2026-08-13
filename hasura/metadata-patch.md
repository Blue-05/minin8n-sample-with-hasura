# Hasura metadata additions

The uploaded project already contains the seven core tables, relationships and row permissions. Do **not** replace those permissions.

Add the two Action definitions from `actions.yaml` / `actions.graphql`.

For the optional trigger functions, configure Hasura Event/Cron triggers only after importing/validating the function URLs in the Nhost project:

- `workflowWebhook`: `https://mlimswxxskorovtgheqc.functions.ap-south-1.nhost.run/v1/workflowWebhook`
- `scheduledWorkflow`: `https://mlimswxxskorovtgheqc.functions.ap-south-1.nhost.run/v1/scheduledWorkflow`
- `databaseEvent`: `https://mlimswxxskorovtgheqc.functions.ap-south-1.nhost.run/v1/databaseEvent`

The Action handlers use forwarded Hasura client headers. The functions independently verify `x-hasura-user-id` against `org_members` before starting or approving a run.
