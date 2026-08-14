"use client";
import {useEffect,useState} from "react";
import {useParams,useRouter} from "next/navigation";
import {useAuth} from "../../../lib/nhost/AuthProvider";
import {gql} from "../../../lib/graphql";
import {WORKFLOW_QUERY,MEMBERS_QUERY,STEP_RUNS_QUERY} from "../../../lib/queries";
import {CREATE_STEP,UPDATE_STEP,DELETE_STEP,UPDATE_WORKFLOW,CREATE_TRIGGER,DELETE_TRIGGER,TRIGGER_RUN,APPROVE_STEP} from "../../../lib/mutations";
import {subscribeStepRuns} from "../../../lib/subscription";
import type {Member,Workflow,Step,StepType,StepRun} from "../../../lib/types";

const defaults:Record<StepType,Record<string,unknown>>={
  llm_call:{
    prompt:"Return a concise answer to: {{input}}",
    model:"llama-3.1-8b-instant"},
    http_request:{
      method:"GET",url:"https://httpbin.org/get"
    },
    db_write:{
      table:"workflow_results",
      note:"This step is intentionally owner-only."},
      notify:{message:"Workflow completed: {{workflow_run_id}}"},
      conditional_branch:{
        field:"text",operator:"contains",
        value:"yes",then:"continue",else:"skip"}
        ,approval_gate:{message:"Approval required before continuing."}
      };


function pretty(o:any)
{try{return JSON.stringify(o,null,2)}catch{return String(o)}}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "An unexpected error occurred.";
}

export default function WorkflowDetail(){
  const {id}=useParams<{id:string}>();
  const router=useRouter();
  const {user,loading}=useAuth();
  const [workflow,setWorkflow]=useState<Workflow|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [error,setError]=useState("");
  const [runId,setRunId]=useState<string|null>(null);
  const [stepRuns,setStepRuns]=useState<StepRun[]>([]);
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState("");
  const [desc,setDesc]=useState("");


  async function load(){
    try{
      setError("");
      const [w,m]=await Promise.all(
        [gql<{workflows_by_pk:Workflow|null}>(WORKFLOW_QUERY,{id}),
        gql<{org_members:Member[]}>(MEMBERS_QUERY)]);
        if(!w.workflows_by_pk){setError("Workflow not found or not visible to this user.");
          return}
          
          setWorkflow(w.workflows_by_pk);
          setName(w.workflows_by_pk.name);
          setDesc(w.workflows_by_pk.description||"");
          setMembers(m.org_members);
          const latest=w.workflows_by_pk.workflow_runs[0];
          if(latest)
            {setRunId(latest.id);
            const s=await gql<{step_runs:StepRun[]}>(STEP_RUNS_QUERY,{runId:latest.id});
            setStepRuns(s.step_runs)}}
            
            catch (error: unknown) {
  setError(getErrorMessage(error));
}}



useEffect(()=>{if(!loading&&!user)router.replace("/login");if(user)load()},[loading,user,id]);
useEffect(() => {
  if (!runId) return;

  const dispose = subscribeStepRuns<{ step_runs: StepRun[] }>(
    runId,
    (value) => {
      setStepRuns(value.step_runs);
    },
    (err) => {
      console.warn("Step-runs subscription unavailable:", err);
    }
  );

  return () => dispose();
}, [runId]);
const role=(workflow&&user)?members.find(m=>m.org_id===workflow.org_id&&m.user_id===user.id)?.role:null;const canEdit=role==="owner"||role==="editor";const isOwner=role==="owner";const latest=workflow?.workflow_runs[0];


async function addStep(type: StepType) {
  if (!workflow) return;

  try {
    const positions = workflow.workflow_steps.map(
      (step) => step.position
    );

    const position =
      positions.length === 0
        ? 0
        : Math.max(...positions) + 1;

    await gql(CREATE_STEP, {
      object: {
        workflow_id: workflow.id,
        position,
        type,
        config: defaults[type],
      },
    });

    await load();
  } catch (e: unknown) {
    setError(getErrorMessage(e));
  }
}
async function updateStep(s:Step,config:string){try{await gql(UPDATE_STEP,{id:s.id,changes:{config:JSON.parse(config)}});await load()}catch(e:any){setError("Config must be valid JSON: "+e.message)}}
async function removeStep(s:Step){try{await gql(DELETE_STEP,{id:s.id});await load()}catch(e:any){setError(e.message)}}
async function moveStep(index:number,dir:-1|1){if(!workflow)return;const target=index+dir;if(target<0||target>=workflow.workflow_steps.length)return;const a=workflow.workflow_steps[index],b=workflow.workflow_steps[target];try{await gql(UPDATE_STEP,{id:a.id,changes:{position:-100-index}});await gql(UPDATE_STEP,{id:b.id,changes:{position:a.position}});await gql(UPDATE_STEP,{id:a.id,changes:{position:b.position}});await load()}catch(e:any){setError(e.message)}}
async function saveWorkflow(){try{await gql(UPDATE_WORKFLOW,{id,changes:{name,description:desc,updated_at:new Date().toISOString()}});setEditing(false);await load()}catch(e:any){setError(e.message)}}
async function addWebhook(){try{await gql(CREATE_TRIGGER,{object:{workflow_id:id,type:"webhook",config:{},enabled:true}});await load()}catch(e:any){setError(e.message)}}
async function removeTrigger(t:any){try{await gql(DELETE_TRIGGER,{id:t.id});await load()}catch(e:any){setError(e.message)}}
async function run(){setBusy(true);setError("");try{const r=await gql<{triggerWorkflowRun:{success:boolean;workflow_run_id:string|null;status:string;error:string|null}}>(TRIGGER_RUN,{workflow_id:id});if(!r.triggerWorkflowRun.success)throw new Error(r.triggerWorkflowRun.error||"Run failed");if(r.triggerWorkflowRun.workflow_run_id)setRunId(r.triggerWorkflowRun.workflow_run_id);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
async function approve(sr:StepRun){setBusy(true);try{const r=await gql<{approveStep:{success:boolean;error:string|null;workflow_run_id:string|null}}>(APPROVE_STEP,{step_run_id:sr.id});if(!r.approveStep.success)throw new Error(r.approveStep.error||"Approval failed");await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
if(loading)return <main className="container">Loading…</main>;if(!workflow)return <main className="container"><div className="error">{error||"Loading workflow…"}</div></main>;
return <main className="container"><div className="row space"><div>{editing?<><input className="input" value={name} onChange={e=>setName(e.target.value)}/><textarea className="textarea" style={{marginTop:8}} value={desc} onChange={e=>setDesc(e.target.value)}/></>:<><h1>{workflow.name}</h1><p className="muted">{workflow.description}</p></>}</div><div className="row">{canEdit&&<>{editing?<><button className="btn primary" onClick={saveWorkflow}>Save</button><button className="btn" onClick={()=>setEditing(false)}>Cancel</button></>:<button className="btn" onClick={()=>setEditing(true)}>Edit</button>}</>}{canEdit&&<button className="btn primary" disabled={busy} onClick={run}>{busy?"Running…":"▶ Run"}</button>}</div></div>{error&&<div className="error" style={{marginTop:15}}>{error}</div>}<div className="grid" style={{marginTop:20,gridTemplateColumns:"1.4fr .8fr"}}><section className="card"><div className="row space"><h2>Workflow steps</h2>{canEdit&&<div className="row">{(["llm_call","http_request","conditional_branch","approval_gate","db_write","notify"] as StepType[]).map(t=><button className="btn" key={t} onClick={()=>addStep(t)} disabled={(t==="db_write"||t==="notify")&&!isOwner}>+ {t}</button>)}</div>}</div><div className="steps">{workflow.workflow_steps.map((s,i)=><div className="step" key={s.id}><div className="stephead"><div className="stepnum">{i+1}</div><strong>{s.type}</strong><span className="badge">position {s.position}</span>{(s.type==="db_write"||s.type==="notify")&&<span className="badge">owner only</span>}<span style={{marginLeft:"auto"}}>{canEdit&&<><button className="btn" onClick={()=>moveStep(i,-1)} disabled={i===0}>↑</button> <button className="btn" onClick={()=>moveStep(i,1)} disabled={i===workflow.workflow_steps.length-1}>↓</button> <button className="btn danger" onClick={()=>removeStep(s)}>Delete</button></>}</span></div>{canEdit?<textarea className="textarea" style={{marginTop:10}} defaultValue={pretty(s.config)} onBlur={e=>updateStep(s,e.target.value)}/>:<pre>{pretty(s.config)}</pre>}</div>)}</div></section><aside className="card"><h2>Triggers</h2><div className="steps">{workflow.workflow_triggers.map(t=><div className="step" key={t.id}><div className="row space"><span className="badge">{t.type}</span><span>{t.enabled?"enabled":"disabled"}</span></div><pre>{pretty(t.config)}</pre>{canEdit&&<button className="btn danger" onClick={()=>removeTrigger(t)}>Remove</button>}</div>)}</div>{canEdit&&<button className="btn" style={{marginTop:10}} onClick={addWebhook} disabled={!isOwner}>+ webhook trigger {isOwner?"":"(owner only)"}</button>}<hr style={{borderColor:"var(--line)",margin:"20px 0"}}/><h2>Usage</h2><p className="muted">Org quota is enforced in the Action function. Use the Nhost dashboard to inspect the authoritative values.</p></aside></div><RunMonitor workflow={workflow} runId={runId} stepRuns={stepRuns} onApprove={approve} canApprove={canEdit}/></main>}
function RunMonitor({workflow,runId,stepRuns,onApprove,canApprove}:{workflow:Workflow;runId:string|null;stepRuns:StepRun[];onApprove:(s:StepRun)=>void;canApprove:boolean}){if(!runId)return null;const status=workflow.workflow_runs.find(r=>r.id===runId)?.status||"live";return <section className="card" style={{marginTop:20}}><div className="row space"><div><h2>Live run</h2><p className="muted">{runId}</p></div><span className={`badge status-${status}`}>{status}</span></div><div className="steps">{stepRuns.map((r,i)=>{const step=workflow.workflow_steps.find(s=>s.id===r.workflow_step_id);return <div className="step" key={r.id}><div className="row space"><div><strong>{i+1}. {step?.type||r.workflow_step_id}</strong><div className={`status-${r.status}`}>{r.status} · attempts {r.attempt_count}</div></div>{r.status==="paused"&&canApprove&&<button className="btn primary" onClick={()=>onApprove(r)}>Approve</button>}</div>{r.error&&<div className="error" style={{marginTop:8}}>{r.error}</div>}{r.output&&<details style={{marginTop:8}}><summary>Output</summary><pre>{pretty(r.output)}</pre></details>}</div>})}</div></section>}
