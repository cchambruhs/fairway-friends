import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {canManage,checkOrigin,readBody} from '../../../lib/api';
import {GearError,claimPlayerGear,savePlayerGear,releasePlayerGear} from '../../../lib/gear.mjs';
export async function POST(request:Request){
 const denied=checkOrigin(request);if(denied)return denied;
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in with ChatGPT to claim your profile and edit your bag.'},{status:401});
 try{const body=await readBody(request,16000),owner=await canManage();if(!body||typeof body!=='object'||Array.isArray(body))throw new GearError('Check your profile update.');if(!env.DB)throw new Error('Database unavailable');let result;
 if(body.action==='claim')result=await claimPlayerGear(env.DB,body.username,user.userId);
 else if(body.action==='save')result=await savePlayerGear(env.DB,body.username,user.userId,owner,body.gear);
 else if(body.action==='release')result=await releasePlayerGear(env.DB,body.username,owner);
 else throw new GearError('Choose claim, save or release.');
 return Response.json(result);
 }catch(e){return Response.json({error:e instanceof GearError?e.message:'Your bag could not be saved. Please try again.'},{status:e instanceof GearError?e.status:500});}
}
