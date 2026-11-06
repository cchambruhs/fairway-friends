/** All standings totals use hundredths of a point, avoiding floating point accumulation. */
export const FIXED_POINTS=[25,20,16,13,11,10,9,8,7,6];
const cents=n=>Math.round((n+Number.EPSILON)*100);
function number(v,fallback,min,max,integer=false){v=v??fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw new Error('Check scoring values and round limits.');return v;}
export function normalizeRules(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Check scoring settings.');
 const method=input.method??'fixed';if(!['fixed','field'].includes(method))throw new Error('Choose fixed placement or field-size scoring.');
 if(input.bonusEnabled!==undefined&&typeof input.bonusEnabled!=='boolean')throw new Error('Choose whether bonuses are enabled.');
 return {method,countedRounds:number(input.countedRounds,0,0,500,true),dropLowest:number(input.dropLowest,0,0,499,true),bonusEnabled:input.bonusEnabled??false,bonuses:{participation:number(input.bonuses?.participation,0,0,100),birdie:number(input.bonuses?.birdie,0,0,100),ace:number(input.bonuses?.ace,0,0,100)},championshipMultiplier:number(input.championshipMultiplier,1,1,10)};
}
export function placementPoints(method,placement,players){
 if(!Number.isInteger(players)||players<1||!Number.isInteger(placement)||placement<1||placement>players)throw new Error('Invalid placement or field size.');
 if(method==='field')return players===1?25:25*(players-placement)/(players-1);
 if(method!=='fixed')throw new Error('Unknown scoring method.');
 return placement<=10?FIXED_POINTS[placement-1]:Math.max(1,16-placement);
}
export function roundPoints(players,pars,rulesInput={},championship=false){
 const rules=normalizeRules(rulesInput);
 const finishers=players.filter(p=>!p.isTeam&&p.complete!==false&&Array.isArray(p.scores)&&p.scores.length===pars.length&&p.scores.every(n=>Number.isInteger(n)&&n>0)).map(p=>({...p,total:p.scores.reduce((a,b)=>a+b,0)})).sort((a,b)=>a.total-b.total||a.username.localeCompare(b.username));
 return finishers.map(p=>{
  const placement=1+finishers.filter(q=>q.total<p.total).length,tied=finishers.filter(q=>q.total===p.total).length;
  const base=Array.from({length:tied},(_,i)=>placementPoints(rules.method,placement+i,finishers.length)).reduce((a,b)=>a+b,0)/tied;
  const birdies=p.scores.filter((n,i)=>n===pars[i]-1).length,aces=p.scores.filter(n=>n===1).length;
  const bonus=rules.bonusEnabled?rules.bonuses.participation+birdies*rules.bonuses.birdie+aces*rules.bonuses.ace:0,multiplier=championship?rules.championshipMultiplier:1;
  return {username:p.username,total:p.total,placement,tied,averagePlacement:placement+(tied-1)/2,basePoints:base,bonusPoints:bonus,multiplier,points:cents((base+bonus)*multiplier)/100,pointCents:cents((base+bonus)*multiplier),birdies,aces};
 });
}
function compare(a,b){return b.totalCents-a.totalCents||b.wins-a.wins||b.seconds-a.seconds||(a.averagePlacement===null&&b.averagePlacement===null?0:(a.averagePlacement??Infinity)-(b.averagePlacement??Infinity));}
export function leagueStandings(league){
 const rules=normalizeRules(league.rules),members=league.members??[],names=new Set(members.map(m=>m.username));
 const rows=members.map(m=>({username:m.username,name:m.name||m.username,results:[]}));
 for(const c of league.cards??[]){if(c.status!=='accepted'||!c.round||c.round.players.some(p=>names.has(p.username)&&(!p.complete||p.scores.some(n=>n===null))))continue;
  for(const result of roundPoints(c.round.players.filter(p=>names.has(p.username)),c.round.pars,rules,c.championship)){
   const row=rows.find(m=>m.username===result.username);if(row)row.results.push({...result,roundId:c.round.id,date:c.round.date,course:c.round.course,layout:c.round.layout,championship:!!c.championship});
  }
 }
 const standings=rows.map(row=>{
  const sorted=[...row.results].sort((a,b)=>b.pointCents-a.pointCents||a.date.localeCompare(b.date)||a.roundId.localeCompare(b.roundId));
  const count=Math.min(Math.max(0,sorted.length-rules.dropLowest),rules.countedRounds||Infinity),counted=sorted.slice(0,count),ids=new Set(counted.map(r=>r.roundId)),totalCents=counted.reduce((s,r)=>s+r.pointCents,0);
  return {...row,results:row.results.map(r=>({...r,counted:ids.has(r.roundId)})).sort((a,b)=>a.date.localeCompare(b.date)),countedRounds:count,playedRounds:sorted.length,totalCents,totalPoints:totalCents/100,wins:counted.filter(r=>r.placement===1).length,seconds:counted.filter(r=>r.placement===2).length,averagePlacement:count?counted.reduce((s,r)=>s+r.averagePlacement,0)/count:null};
 }).sort((a,b)=>compare(a,b)||a.username.localeCompare(b.username));
 const order=league.playoffOrder??[];
 const playoffIndex=u=>order.indexOf(u);
 standings.sort((a,b)=>compare(a,b)||((playoffIndex(a.username)>=0&&playoffIndex(b.username)>=0)?playoffIndex(a.username)-playoffIndex(b.username):0)||a.username.localeCompare(b.username));
 return standings.map((s,i)=>{
  const tied=standings.filter(x=>compare(x,s)===0),resolved=tied.length>1&&tied.every(x=>playoffIndex(x.username)>=0),start=standings.findIndex(x=>compare(x,s)===0);
  return {...s,rank:resolved?i+1:start+1,playoffRequired:s.countedRounds>0&&tied.length>1&&!resolved};
 });
}
export function normalizePayout(input={}){
 const mode=input.mode??'fixed';if(!['fixed','proportional'].includes(mode))throw new Error('Choose fixed or proportional payouts.');
 const poolCents=number(input.poolCents,0,0,100000000,true),places=input.places??[];
 if(!Array.isArray(places)||places.length>100)throw new Error('Use up to 100 prize places.');
 places.forEach(n=>number(n,0,0,100000000,true));if(mode==='fixed'&&places.reduce((a,b)=>a+b,0)>poolCents)throw new Error('Fixed cash prizes exceed the declared pool.');
 return {mode,poolCents,places};
}
function allocate(total,weights){
 const sum=weights.reduce((s,w)=>s+w.value,0);if(!sum)return weights.map(w=>({...w,cents:0}));
 const result=weights.map(w=>{const raw=total*w.value/sum;return {...w,cents:Math.floor(raw),fraction:raw-Math.floor(raw)};});
 let left=total-result.reduce((s,w)=>s+w.cents,0);const order=[...result].sort((a,b)=>b.fraction-a.fraction||a.username.localeCompare(b.username));
 for(let i=0;i<left;i++)order[i%order.length].cents++;
 return result;
}
export function calculatePayouts(standings,input={}){
 standings=standings.filter(s=>s.countedRounds!==0);
 const payout=normalizePayout(input);let payouts=[];
 if(payout.mode==='proportional')payouts=allocate(payout.poolCents,standings.map(s=>({username:s.username,value:s.totalPoints})));
 else for(const rank of new Set(standings.map(s=>s.rank))){const tied=standings.filter(s=>s.rank===rank);const pot=Array.from({length:tied.length},(_,i)=>payout.places[rank-1+i]||0).reduce((a,b)=>a+b,0);payouts.push(...allocate(pot,tied.map(s=>({username:s.username,value:1}))));}
 return {payouts:payouts.map(({username,cents})=>({username,cents})),unallocatedCents:payout.poolCents-payouts.reduce((s,p)=>s+p.cents,0)};
}
