import {getChatGPTUser} from '../app/chatgpt-auth';
import {env} from 'cloudflare:workers';
import {isOwner} from './policy.mjs';
export async function canManage(){return isOwner(await getChatGPTUser(),env.OWNER_EMAIL||'');}
export function checkOrigin(request:Request){const origin=request.headers.get('origin');if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'Use the app to make this change.'},{status:403});return null;}
export async function authorize(request:Request){const originError=checkOrigin(request);if(originError)return originError;if(!await canManage())return Response.json({error:'Only the clubhouse owner can change player profiles, refresh cards or upload CSV files.'},{status:403});return null;}
export async function readBody(request:Request,max=1500000){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('Send a JSON import request.');
 if(Number(request.headers.get('content-length'))>max)throw new Error('That import is too large.');
 const reader=request.body?.getReader();if(!reader)throw new Error('The import request is empty.');let text='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('That import is too large.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);
}
export function failure(e:unknown){return Response.json({error:e instanceof Error?e.message:'Something went wrong. Try again.'},{status:400});}
export async function consumeImportLimit(request:Request){
 if(!env.DB)throw new Error('Import storage is temporarily unavailable.');
 const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/900),ip=request.headers.get('cf-connecting-ip')||'unknown';
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+'|'+bucket));const id=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 await env.DB.prepare('DELETE FROM import_limits WHERE expires < ?').bind(now).run();
 const result=await env.DB.prepare('INSERT INTO import_limits (id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 WHERE hits<12 RETURNING hits').bind(id,(bucket+1)*900).first();
 return result?null:Response.json({error:'New-card import limit reached. Try again in a few minutes.'},{status:429,headers:{'Retry-After':String((bucket+1)*900-now)}});
}
