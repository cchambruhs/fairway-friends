import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {checkOrigin,readBody} from '../../../lib/api';
import {LeagueError,mutateLeague,readLeagues} from '../../../lib/leagues.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await getChatGPTUser(),invite=new URL(request.url).searchParams.get('invite');return Response.json({leagues:await readLeagues(env.DB,user,invite)},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'Could not load leagues. Please try again.'},{status:500});}}
export async function POST(request:Request){const denied=checkOrigin(request);if(denied)return denied;const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to join or manage a league.'},{status:401});try{const body=await readBody(request,100000);return Response.json({league:await mutateLeague(env.DB,user,body)});}catch(e){return Response.json({error:e instanceof Error?e.message:'League update failed.'},{status:e instanceof LeagueError?e.status:400});}}
