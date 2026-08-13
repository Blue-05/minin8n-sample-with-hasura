import { Request, Response } from "express";
import { callerId, input, jsonResponse } from "./_shared";
import { resumeWorkflow } from "./engine";
export default async function approveStep(req:Request,res:Response){try{const userId=callerId(req);const body=input(req);if(!body.step_run_id)return jsonResponse(res,400,{success:false,error:"step_run_id is required"});const result=await resumeWorkflow(body.workflow_run_id,body.step_run_id,userId);return jsonResponse(res,200,{success:result.status!=="failed",workflow_run_id:result.workflow_run_id||body.workflow_run_id,status:result.status,error:result.error??null});}catch(e:any){return jsonResponse(res,403,{success:false,error:e.message||"Approval failed"})}}
