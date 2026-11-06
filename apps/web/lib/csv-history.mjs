import {mergeRounds} from './stats.mjs';
export function buildPlayerAliases(players,explicit={}){
 const normalize=s=>s.trim().replace(/\s+/g,' ').toLowerCase(),groups=new Map();
 for(const p of players){const name=normalize(p.name);if(!groups.has(name))groups.set(name,new Set());groups.get(name).add(p.username);}
 const aliases={},ambiguousNames=[];
 for(const [name,usernames] of groups){if(usernames.size===1)aliases[name]=[...usernames][0];else ambiguousNames.push(name);}
 for(const [name,username] of Object.entries(explicit))aliases[normalize(name)]=username;
 return {aliases,ambiguousNames};
}
export function planCsvImport(incoming,saved){
 const safe=[],conflicts=[];let current=saved;
 for(const r of incoming){try{if(r.csvError)throw new Error(r.csvError);if(r.csvConflict)throw new Error('Different scorecards share this course, layout and start time. Review both before importing.');const next=mergeRounds(current,[r]);safe.push(r);current=next;}catch(e){conflicts.push({id:r.id,course:r.course,date:r.date,reason:e.message});}}
 return {safe,conflicts,newRounds:current.length-saved.length,totalIncoming:incoming.length,provisionalNames:[...new Set(safe.flatMap(r=>r.players.filter(p=>p.username.startsWith('csv:')).map(p=>p.name)))],teamAppearances:safe.reduce((s,r)=>s+r.players.filter(p=>p.isTeam).length,0)};
}
