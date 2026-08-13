# Hasura / Nhost integration

`graphqlschema.json` is the metadata export supplied for the existing project. It contains the existing table relationships and permissions; keep those as the source of truth.

The only new Action needed for the approval path is `approveStep`. The existing `triggerWorkflowRun` Action points at the Nhost Function URL for this project.

Files:

- `actions.graphql` — Action SDL
- `actions.yaml` — Action definitions/handlers
- `metadata-patch.md` — what to add without replacing existing permissions
- `event-trigger.md` — optional notify Event Trigger setup
- `triggers.yaml` — webhook endpoint pattern
