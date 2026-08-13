# Final walkthrough

1. Sign in as `ownerA@example.com`.
2. Open Org A and create a workflow named `AI Research Pipeline`.
3. Add: `llm_call`, `http_request`, `conditional_branch`, `approval_gate` and optionally `db_write`.
4. Add a webhook trigger as the Org A owner.
5. Configure the LLM prompt so it emits a predictable word such as `YES` or `NO`.
6. Configure the conditional step, for example:

```json
{
  "field": "text",
  "operator": "contains",
  "value": "YES",
  "then_positions": [],
  "else_positions": [4]
}
```

7. Click Run. The monitor should update without refresh.
8. The approval gate should become `paused` and show Approve for owner/editor.
9. Approve it and watch the remaining steps resume.
10. Call the webhook URL shown by the deployment setup with the trigger ID. It should create another run without clicking Run.
11. Sign in as `viewerA@example.com`. The Run button is absent and mutations are denied by Hasura.
12. Sign in as `ownerB@example.com` and paste Org A's workflow UUID directly into `/workflows/<id>`. Hasura must return no row, and the Action must reject a guessed ID.
13. Attempt to approve Org A's paused step from Org B. The Action must reject it.
