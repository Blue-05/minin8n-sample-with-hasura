# GraphQL operations

## Workflows

```graphql
query Workflows {
  workflows(order_by: {updated_at: desc}) {
    id
    org_id
    name
    workflow_steps(order_by: {position: asc}) { id position type config }
    workflow_triggers { id type config enabled }
    workflow_runs(order_by: {created_at: desc}, limit: 1) { id status trigger_type created_at }
  }
}
```

## Manual run

```graphql
mutation Run($workflow_id: uuid!) {
  triggerWorkflowRun(workflow_id: $workflow_id) {
    success workflow_run_id status error
  }
}
```

## Approval

```graphql
mutation Approve($step_run_id: uuid!) {
  approveStep(step_run_id: $step_run_id) {
    success workflow_run_id status error
  }
}
```

## Live progress

```graphql
subscription RunProgress($runId: uuid!) {
  step_runs(
    where: {workflow_run_id: {_eq: $runId}}
    order_by: {created_at: asc}
  ) {
    id workflow_step_id status input output error attempt_count
    approved_by approved_at started_at completed_at
  }
}
```
