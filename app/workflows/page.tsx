"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useAuth} from "../../lib/nhost/AuthProvider";
import {gql} from "../../lib/graphql";
import {MEMBERS_QUERY,ORGS_QUERY,WORKFLOWS_QUERY} from "../../lib/queries";
import {CREATE_WORKFLOW} from "../../lib/mutations";
import type {Member,Org,Workflow} from "../../lib/types";

export default function Workflows(){
    const {user,loading}=useAuth();
    const router=useRouter();
    const [workflows,setWorkflows]=useState<Workflow[]>([]);
    const [members,setMembers]=useState<Member[]>([]);
    const [orgs,setOrgs]=useState<Org[]>([]);
    const [name,setName]=useState("AI Research Pipeline");
    const [orgId,setOrgId]=useState("");
    const [error,setError]=useState("");
    useEffect(()=>{
        if(!loading&&!user)router.replace("/login")
        },
    [loading,user,router]);
    async function load(){
        try{
            const [w,m,o]=await Promise.all(
                [gql<{workflows:Workflow[]}>(WORKFLOWS_QUERY),gql<{org_members:Member[]}>(MEMBERS_QUERY),gql<{organizations:Org[]}>(ORGS_QUERY)]);
                setWorkflows(w.workflows);
                setMembers(m.org_members);
                setOrgs(o.organizations);
                if(!orgId&&o.organizations[0]) setOrgId(o.organizations[0].id)
                }
        catch(e:any){
            setError(e.message)
        }
    }
    useEffect(()=>{if(user)load()},[user]);
    const mine=useMemo(()=>{const ids=new Set(members.filter(m=>m.user_id===user?.id).map(m=>m.org_id));
    return workflows.filter(w=>ids.has(w.org_id))},[workflows,members,user]);
    const roleByOrg=new Map(members.filter(m=>m.user_id===user?.id).map(m=>[m.org_id,m.role]));
    async function create(){
        if(!orgId) return;
        try{
            const r=await gql<{insert_workflows_one:{id:string}}>(CREATE_WORKFLOW,
            {object:{org_id:orgId,name,description:"AI workflow created in AgentFlow",created_by:user?.id}});
            router.push(`/workflows/${r.insert_workflows_one.id}`)
        }
        catch(e:any){
            setError(e.message)
        }
    }
    if(loading) return <main className="container">Loading…</main>;
    return <main className="container"><div className="row space">
        <div><h1>Workflows</h1><p className="muted">Only workflows visible through your Hasura org predicates appear here.</p></div>
        <div className="row"><select className="select" style={{width:220}} value={orgId} onChange={e=>setOrgId(e.target.value)}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <input className="input" style={{width:240}} value={name} onChange={e=>setName(e.target.value)}/>
        <button className="btn primary" onClick={create} disabled={roleByOrg.get(orgId)==="viewer"}>Create</button>
        </div>
        </div>
        {error&&<div className="error">{error}</div>}
        <div className="grid" style={{marginTop:20}}>{mine.map(w=><Link className="card" key={w.id} href={`/workflows/${w.id}`}>
        <div className="row space">
            <h3>{w.name}</h3>
            <span className="badge">{roleByOrg.get(w.org_id)}</span>
        </div>
        <p className="muted">{w.description||"No description"}</p>
        <p className="muted">{w.workflow_steps.length} steps · {w.workflow_triggers.length} triggers · last run: {w.workflow_runs[0]?.status||"never"}</p></Link>)}</div></main>}
