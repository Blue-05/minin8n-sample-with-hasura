# Notify Event Trigger

The supplied core schema has no notification/outbox table. To satisfy the assignment without changing the seven core tables, `database/notify-event.sql` adds a small `workflow_notifications` outbox table.

Track the table in Hasura and create an Event Trigger:

- table: `workflow_notifications`
- operation: INSERT
- webhook: `https://mlimswxxskorovtgheqc.functions.ap-south-1.nhost.run/v1/notifyEvent`

The `notify` workflow step inserts an outbox row. Hasura then invokes `notifyEvent`, decoupling notification delivery from the execution loop.
