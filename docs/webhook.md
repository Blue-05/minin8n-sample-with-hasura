# Webhook trigger

A webhook trigger is stored in `workflow_triggers` with `type = webhook` and `enabled = true`.

Endpoint:

```text
POST https://mlimswxxskorovtgheqc.functions.ap-south-1.nhost.run/v1/workflowWebhook?trigger_id=<uuid>
```

Optional trigger config:

```json
{
  "secret": "a-long-random-value"
}
```

When `secret` is configured, callers must send:

```text
x-workflow-secret: a-long-random-value
```

The function loads the trigger by UUID, verifies its type/enabled state, optionally checks the secret, then starts the same workflow engine used by the manual Action.
