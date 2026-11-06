import {getDb} from '../db';
import {rounds,players} from '../db/schema';
import {eq} from 'drizzle-orm';
import {env} from 'cloudflare:workers';
import {persistPublicRound,roundFingerprint,backfillRoundFingerprints,seedData} from './persistence.mjs';
import seed from './seed.json';
import distances from './distance-supplement.json';
import {mergeRounds} from './stats.mjs';
import {validateRound} from './disc.mjs';
export async function readData(){
 const db=getDb();
 if(!env.DB)throw new Error('Round storage unavailable.');
 await seedData(env.DB,seed);
 const rs=await db.select().from(rounds),ps=await db.select().from(players);
 if(env.DB)await backfillRoundFingerprints(env.DB,rs);
 return {rounds:rs.map(r=>{const card=JSON.parse(r.data),extra=(distances as Record<string,any>)[card.id];return extra&&extra.course===card.course&&extra.layoutKey===card.layoutKey&&extra.distancesFt.length===card.pars.length&&!card.distancesFt?.some((n:any)=>n!==null)?{...card,distancesFt:extra.distancesFt}:card;}).sort((a,b)=>b.date.localeCompare(a.date)),players:ps.map(p=>JSON.parse(p.data))};
}
export async function saveRounds(incoming:any[],existing:any[]=[]){
 const db=getDb();
 const statements:any[]=[];
 const previous=new Map(existing.map(r=>[r.id,r]));
 const combined=mergeRounds(existing,incoming);
 const updated=combined.filter(r=>r!==previous.get(r.id)).map(validateRound);
 for(const r of updated){const fingerprint=await roundFingerprint(r);statements.push(db.insert(rounds).values({id:r.id,data:JSON.stringify(r),fingerprint}).onConflictDoUpdate({target:rounds.id,set:{data:JSON.stringify(r),fingerprint}}));for(const p of r.players.filter((p:any)=>!p.isTeam))statements.push(db.insert(players).values({username:p.username,data:JSON.stringify({username:p.username,name:p.name,pdgaNumber:null})}).onConflictDoNothing());}
 await db.batch(statements as any);
 return combined;
}
export async function linkPlayer(username:string,number:string|null,fullName:string){
 const data=await readData();const player=data.players.find(p=>p.username===username);if(!player)throw new Error('Player not found.');
 if(number && data.players.some(p=>p.username!==username&&p.pdgaNumber===number))throw new Error('That PDGA number is already linked to another player.');
 const same=player.pdgaNumber===number;
 const next={...player,fullName:fullName||player.fullName,pdgaNumber:number,verified:false,confirmedAt:new Date().toISOString(),...(same?{}:{rating:null,ratingDate:null,careerEvents:null,careerWins:null,statsChecked:null})};
 await getDb().update(players).set({data:JSON.stringify(next)}).where(eq(players.username,username));return next;
}

export async function insertPublicRound(round:any,_existing:any[]){
 if(!env.DB)throw new Error('Import storage is temporarily unavailable.');
 return persistPublicRound(env.DB,validateRound(round),_existing);
}
