"use client";
import { createClient, type Client } from "graphql-ws";
import { graphqlWsUrl } from "./nhost/client";
import { nhost } from "./nhost/client";

let ws: Client | null = null;
function getWs() {
  if (!ws) ws = createClient({ url: graphqlWsUrl, lazy:true, retryAttempts:5, connectionParams: async () => ({ authorization: `Bearer ${nhost.getUserSession()?.accessToken ?? ""}` }) });
  return ws;
}
export function subscribeStepRuns<T>(runId:string, next:(value:T)=>void, error:(err:unknown)=>void) {
  const dispose = getWs().subscribe({query:`subscription StepRuns($runId:uuid!){step_runs(where:{workflow_run_id:{_eq:$runId}},order_by:{created_at:asc}){id workflow_run_id workflow_step_id status input output error attempt_count approved_by approved_at started_at completed_at}}`,variables:{runId}}, {next: (v:any)=>next(v.data), error, complete:()=>{}});
  return dispose;
}
