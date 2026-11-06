import {validateCardUrl,parseCsvRows} from '../../../lib/disc.mjs';
import {checkPublicBody} from '../../../lib/policy.mjs';
import {readData,saveRounds,insertPublicRound} from '../../../lib/store';
import {canManage,checkOrigin,consumeImportLimit,failure,readBody} from '../../../lib/api';
import Papa from 'papaparse';
import {fetchRound} from '../../../lib/import-card.mjs';
import {planCsvImport,buildPlayerAliases} from '../../../lib/csv-history.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const denied=checkOrigin(request);if(denied)return denied;
 try{const owner=await canManage(),body=await readBody(request,owner?1500000:2500);if(!owner)checkPublicBody(body);const saved=await readData();
 if(body.csv){
  if(!owner)throw new Error('CSV imports require the owner.');if(typeof body.csv!=='string')throw new Error('Choose a CSV file.');
  const parsed=Papa.parse(body.csv,{header:true,skipEmptyLines:'greedy'});if(parsed.errors.length)throw new Error('The CSV has malformed rows.');
  const aliases:Record<string,string>={};
  if(body.aliases){if(typeof body.aliases!=='object'||Array.isArray(body.aliases)||Object.keys(body.aliases).length>200)throw new Error('Check player name mappings.');for(const [name,username] of Object.entries(body.aliases)){if(typeof username!=='string'||!saved.players.some(p=>p.username===username))throw new Error('Map names to an existing crew username.');aliases[name]=username;}}
  const mappings=buildPlayerAliases(saved.players,aliases),incoming=parseCsvRows(parsed.data,mappings.aliases,{skipInvalid:true}),plan=planCsvImport(incoming,saved.rounds);
  if(body.preview)return Response.json({roundIds:plan.safe.map(r=>r.id),conflicts:plan.conflicts,newRounds:plan.newRounds,provisionalNames:plan.provisionalNames,teamAppearances:plan.teamAppearances,totalIncoming:plan.totalIncoming});
  const ids=body.roundIds??plan.safe.map(r=>r.id),offset=body.offset??0;
  if(!Array.isArray(ids)||ids.length>1000||ids.some(id=>typeof id!=='string')||!Number.isInteger(offset)||offset<0)throw new Error('Check the CSV batch.');
  const selected=ids.slice(offset,offset+15).map(id=>{const r=plan.safe.find(r=>r.id===id);if(!r)throw new Error('A selected round now has a conflict. Preview the import again.');return r;});
  await saveRounds(selected,saved.rounds);return Response.json({count:selected.length,nextOffset:offset+15<ids.length?offset+15:null,conflicts:plan.conflicts,message:`${selected.length} safe rounds processed. Conflicting entries held for review.`});
 }
 const url=validateCardUrl(body.url||''),id=url.split('/').pop();const existing=saved.rounds.find(r=>r.id===id||r.url===url);
 if(existing&&(!owner||!body.refresh))return Response.json({count:0,duplicate:true,round:existing,message:'This scorecard is already saved. No duplicate added.'});
 const limited=await consumeImportLimit(request);if(limited)return limited;
 const round=await fetchRound(url);
 if(owner&&body.refresh){const combined=await saveRounds([round],saved.rounds),canonical=combined.find(r=>r.url===round.url)||round;return Response.json({count:0,round:canonical,message:'Scorecard refreshed. No duplicate added.'});}
 const result=await insertPublicRound(round,saved.rounds);
 return Response.json({count:result.inserted?1:0,duplicate:!result.inserted,round:result.round,message:result.inserted?'Round saved. Everyone on the card is now in the clubhouse.':'This scorecard is already saved. No duplicate added.'});
 }catch(e){return failure(e);}
}
