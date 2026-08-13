import { Request, Response } from "express";
import { jsonResponse } from "./_shared";

export default async function notifyEvent(req:Request,res:Response){
  const event=req.body?.event?.data?.new;
  if(!event)return jsonResponse(res,400,{ok:false,error:"Missing event payload"});
  // Replace this with Slack/email delivery in production. The event trigger
  // has already decoupled notification delivery from workflow execution.
  console.log("AgentFlow notification", {workflowRunId:event.workflow_run_id, message:event.message});
  return jsonResponse(res,200,{ok:true});
}
