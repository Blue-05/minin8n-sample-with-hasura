# Existing schema used by the application

The application intentionally does not recreate the seven core tables. They already exist in the supplied Nhost/Hasura project.

- organizations
- org_members
- workflows
- workflow_steps
- workflow_triggers
- workflow_runs
- step_runs

The repository uses the exact columns supplied by the assignment owner. See `graphqlschema.json` for the exported Hasura metadata.

`database-bootstrap-demo.sql` is optional and only creates Org A/B plus memberships if they do not already exist.
