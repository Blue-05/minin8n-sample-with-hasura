import type { Request } from "express";

export const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL!;
export const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;

export function callerId(req: Request): string {
  const fromHeader = req.headers["x-hasura-user-id"];
  if (typeof fromHeader === "string" && fromHeader) return fromHeader;
  const body = req.body?.session_variables?.["x-hasura-user-id"];
  if (typeof body === "string" && body) return body;
  throw new Error("Unauthenticated request");
}

export async function gql<T>(query:string, variables:Record<string,unknown>={}):Promise<T>{
  const response=await fetch(GRAPHQL_URL,{method:"POST",headers:{"content-type":"application/json","x-hasura-admin-secret":ADMIN_SECRET},body:JSON.stringify({query,variables})});
  const json=await response.json() as {data?:T;errors?:Array<{message:string}>};
  if(!response.ok||json.errors?.length) throw new Error(json.errors?.map(e=>e.message).join("; ")||`GraphQL HTTP ${response.status}`);
  return json.data as T;
}

export function jsonResponse(res:any,status:number,body:unknown){return res.status(status).json(body)}

export function input(req:Request){return req.body?.input ?? req.body ?? {}}

export function pickPath(value:any,path?:string){if(!path)return value;return path.split(".").reduce((v,k)=>v?.[k],value)}

export function interpolate(template:string, context:any){return template.replace(/\{\{\s*([^}]+)\s*\}\}/g,(_,path)=>{const v=pickPath(context,String(path).trim());return v==null?"":typeof v==="object"?JSON.stringify(v):String(v)})}

export async function withRetry<T>(fn:()=>Promise<T>, attempts=2):Promise<T>{let last:unknown;for(let i=1;i<=attempts;i++){try{return await fn()}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,500*i));}}throw last}
