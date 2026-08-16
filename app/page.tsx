"use client";
import Link from "next/link";
import { useAuth } from "../lib/nhost/AuthProvider";
export default function Home(){
    const {user,loading}=useAuth();
    return <main className="container hero">
        <div className="badge">Nhost + Hasura + PostgreSQL + GraphQL</div>
        <h1>Build AI agent workflows that actually execute.</h1>
        <p>Chain LLM calls, HTTP requests, conditions and approval gates. Runs stream live through Hasura subscriptions, while organization and role isolation is enforced by Hasura and the Action layer.</p>
        <div className="row"><Link className="btn primary" href={user?"/workflows":"/login"}>{loading?"Loading…":user?"Open workflows":"Sign in"}</Link></div>
        <div className="grid" style={{marginTop:40}}>
            <div className="card">
                <h3>Two-layer security</h3>
                <p className="muted">Org membership predicates protect rows. Action handlers enforce mid-execution approval authorization.</p>
            </div>
            <div className="card">
                <h3>Live execution</h3>
                <p className="muted">Step runs update through a real GraphQL WebSocket subscription—no polling.</p>
            </div>
            <div className="card">
                <h3>Cloud-first</h3>
                <p className="muted">The app connects directly to your existing Nhost Cloud project. No Docker or local database.</p>
                </div>
                </div>
                </main>}
