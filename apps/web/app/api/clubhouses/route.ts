import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {checkOrigin,readBody} from '../../../lib/api';
import {ClubError,readClubs,mutateClub} from '../../../lib/clubhouses.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try{return Response.json({clubs:await readClubs(env.DB,await getChatGPTUser())},{headers});}catch{return Response.json({error:'Could not load Clubhouses. Try again.'},{status:500,headers});}}
export async function POST(request:Request){const denied=checkOrigin(request);if(denied)return denied;try{return Response.json({club:await mutateClub(env.DB,await getChatGPTUser(),await readBody(request,16000))},{headers});}catch(e){return Response.json({error:e instanceof ClubError?e.message:'Could not save the Clubhouse. Try again.'},{status:e instanceof ClubError?e.status:500,headers});}}
