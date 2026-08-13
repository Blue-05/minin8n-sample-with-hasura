"use client";

import {
  createClient,
  type Client,
} from "graphql-ws";

import {
  graphqlWsUrl,
  nhost,
} from "./nhost/client";


let wsClient: Client | null = null;


function getWsClient(): Client {
  if (!wsClient) {
    wsClient = createClient({
      url: graphqlWsUrl,

      lazy: true,

      retryAttempts: 5,

      connectionParams: async () => {
        const token =
          nhost.getUserSession()?.accessToken;

        console.log(
          "GraphQL WebSocket URL:",
          graphqlWsUrl
        );

        console.log(
          "WebSocket authenticated:",
          Boolean(token)
        );

        return {
          headers: {
            Authorization: token
              ? `Bearer ${token}`
              : "",
          },
        };
      },

      on: {
        connected: () => {
          console.log(
            "GraphQL WebSocket connected"
          );
        },

        closed: (event) => {
          console.log(
            "GraphQL WebSocket closed:",
            event
          );
        },

        error: (error) => {
          console.error(
            "GraphQL WebSocket error:",
            error
          );
        },
      },
    });
  }

  return wsClient;
}


export function subscribeStepRuns<T>(
  runId: string,
  next: (value: T) => void,
  error: (err: unknown) => void
) {
  const client = getWsClient();

  const dispose = client.subscribe(
    {
      query: `
        subscription StepRuns(
          $runId: uuid!
        ) {
          step_runs(
            where: {
              workflow_run_id: {
                _eq: $runId
              }
            }
            order_by: {
              created_at: asc
            }
          ) {
            id
            workflow_run_id
            workflow_step_id
            status
            input
            output
            error
            attempt_count
            approved_by
            approved_at
            started_at
            completed_at
          }
        }
      `,

      variables: {
        runId,
      },
    },

    {
      next: (result) => {
        console.log(
          "Step-runs subscription update:",
          result
        );

        next(
          (result as any).data
        );
      },

      error: (err) => {
        console.error(
          "Step-runs subscription error:",
          err
        );

        error(err);
      },

      complete: () => {
        console.log(
          "Step-runs subscription completed"
        );
      },
    }
  );

  return dispose;
}
