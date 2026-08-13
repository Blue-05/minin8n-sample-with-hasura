import { Request, Response } from "express";
import { gql, jsonResponse } from "./_shared";
import { createRun } from "./engine";
const Q=`query($id:uuid!){workflow_triggers_by_pk(id:$id){id type enabled workflow{ id org_id name workflow_steps(order_by:{position:asc}){id position type config}}}}`;
export default async function scheduledWorkflow(req:Request,res:Response){try{const id=String(req.body?.trigger_id||req.query.trigger_id||"");if(!id)return jsonResponse(res,400,{error:"trigger_id required"});const q=await gql<any>(Q,{id});const t=q.workflow_triggers_by_pk;if(!t||t.type!=="scheduled"||!t.enabled)return jsonResponse(res,404,{error:"Scheduled trigger not found"});const result=await createRun(t.workflow,"scheduled",req.body?.input??{});return jsonResponse(res,200,{success:result.result.status!=="failed",workflow_run_id:result.runId,status:result.result.status,error:result.result.error??null});}catch(e:any){return jsonResponse(res,500,{success:false,error:e.message})}}
