export const relative = n => n === 0 ? 'E' : n > 0 ? `+${n}` : `−${Math.abs(n)}`;
export function summarize(rounds) {
  const out = new Map();
  for (const r of rounds) {
    const complete = r.players.filter(p=>p.complete&&!p.isTeam);
    const best = Math.min(...complete.map(p=>p.total));
    const tied = complete.filter(p=>p.total===best).length>1;
    for(const p of r.players.filter(p=>!p.isTeam)) {
      if(!out.has(p.username))out.set(p.username,{username:p.username,name:p.name,rounds:0,partialRounds:0,wins:0,sharedWins:0,strokes:0,relative:0,birdies:0,pars:0,bogeys:0,eagles:0,aces:0,holes:0,best:null,history:[]});
      const s=out.get(p.username);
      if(!p.complete){s.partialRounds++;continue;}
      s.rounds++;s.strokes+=p.total;s.relative+=p.relative;
      if(p.total===best && complete.length>1){if(tied)s.sharedWins++;else s.wins++;}
      if(s.best===null || p.relative<s.best)s.best=p.relative;
      p.scores.forEach((n,i)=>{if(n===null)return;s.holes++;const diff=n-r.pars[i];if(n===1)s.aces++;if(diff<=-2)s.eagles++;else if(diff===-1)s.birdies++;else if(diff===0)s.pars++;else s.bogeys++;});
      s.history.push({date:r.date,course:r.course,layout:r.layout,total:p.total,relative:p.relative,id:r.id});
    }
  }
  return [...out.values()].map(s=>({...s,average:s.rounds?s.strokes/s.rounds:null,averageRelative:s.rounds?s.relative/s.rounds:null,birdieRate:s.holes?(s.birdies+s.eagles)/s.holes*100:0,history:s.history.sort((a,b)=>a.date.localeCompare(b.date))})).sort((a,b)=>(b.wins+b.sharedWins)-(a.wins+a.sharedWins)||b.rounds-a.rounds||(a.averageRelative??Infinity)-(b.averageRelative??Infinity));
}
export function headToHead(rounds,a,b){let out={wins:0,losses:0,ties:0,rounds:0};for(const r of rounds){let x=r.players.find(p=>p.username===a),y=r.players.find(p=>p.username===b);if(!x?.complete||!y?.complete||x.isTeam||y.isTeam)continue;out.rounds++;if(x.total<y.total)out.wins++;else if(x.total>y.total)out.losses++;else out.ties++;}return out;}
const normalize=x=>x.trim().replace(/\s+/g,' ').toLowerCase();
const sameLayout=(a,b)=>a.source==='udisc'&&b.source==='udisc'?a.layoutKey===b.layoutKey:normalize(a.course)===normalize(b.course)&&normalize(a.layout)===normalize(b.layout);
export function mergeRounds(old,incoming){
 const all=new Map(old.map(r=>[r.id,r]));
 for(const r of incoming){
  const matches=[...all.values()].filter(x=>sameLayout(x,r));
  if(r.source==='csv'&&new Set(matches.filter(x=>x.source==='udisc').map(x=>x.layoutKey)).size>1)throw new Error('CSV layout name matches multiple official layouts. Import a shared UDisc card instead.');
  const known=matches[0];
  const previous=all.get(r.id)||[...all.values()].find(x=>sameLayout(x,r)&&x.date.slice(0,16)===r.date.slice(0,16));
  let next={...r,layoutKey:known?.layoutKey||r.layoutKey};
  if(previous){
   if(previous.id!==r.id&&!r.players.some(p=>previous.players.some(q=>q.username===p.username)))throw new Error('Same-time cards have disjoint rosters. Review them before merging.');
   if(r.source==='csv'){
    if(JSON.stringify(previous.pars)!==JSON.stringify(r.pars))throw new Error('CSV pars conflict with the saved round. Review this card before importing.');
    for(const p of r.players){const prior=previous.players.find(q=>q.username===p.username);if(prior&&p.scores.some((n,i)=>n!==null&&prior.scores[i]!==null&&n!==prior.scores[i]))throw new Error('CSV scores conflict with the saved round. Review this card before importing.');}
    const ps=new Map(previous.players.map(p=>[p.username,p]));
    for(const p of r.players){const prior=ps.get(p.username);ps.set(p.username,prior?{...p,scores:p.scores.map((n,i)=>n??prior.scores[i])}:p);}
    next={...previous,importedAt:r.importedAt,players:[...ps.values()]};
   }else{const roster=new Map(previous.players.map(p=>[p.username,p]));for(const p of r.players)roster.set(p.username,{...roster.get(p.username),...p,roundRating:p.roundRating??roster.get(p.username)?.roundRating??null});next={...next,id:previous.id,players:[...roster.values()]};}
  }
  all.set(next.id,next);
 }
 return [...all.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
