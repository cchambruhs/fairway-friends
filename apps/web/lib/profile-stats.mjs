import {summarize,headToHead} from './stats.mjs';
export function profileStats(rounds,username){
 const entries=rounds.filter(r=>r.players.some(p=>p.username===username&&!p.isTeam)).map(r=>({r,p:r.players.find(p=>p.username===username&&!p.isTeam)})).sort((a,b)=>a.r.date.localeCompare(b.r.date));
 const base=summarize(rounds).find(p=>p.username===username&&!p.isTeam);
 const out={username,name:base?.name||username,completedRounds:base?.rounds||0,partialRounds:base?.partialRounds||0,averageToPar:base?.averageRelative??null,bestToPar:base?.best??null,wins:base?.wins||0,sharedWins:base?.sharedWins||0,recordedStrokes:0,recordedHoles:0,courseFeet:null,distanceHoles:0,longestHoleFt:null,measuredThrowFeet:null,aces:0,eagles:0,birdies:0,pars:0,bogeys:0,bestBirdieStreak:0,bestCleanStreak:0,bounceBacks:0,bounceBackChances:0,bounceBackRate:null,cleanRounds:0,underParRounds:0,competitiveRounds:0,winRate:null,frontNineBest:null,backNineBest:null,favoriteCourse:null,favoriteDay:null,history:[],courseRecords:[],rivals:[],parTypes:[],monthly:[],badges:[],firstDate:entries[0]?.r.date||null,lastDate:entries.at(-1)?.r.date||null};
 const courses=new Map(),types=new Map(),months=new Map(),weekdays=new Map();let feet=0;
 for(const {r,p} of entries){
  out.recordedStrokes+=p.scores.reduce((sum,n)=>sum+(n??0),0);
  const month=r.date.slice(0,7);months.set(month,(months.get(month)||0)+1);const day=new Date(r.date).getDay();weekdays.set(day,(weekdays.get(day)||0)+1);
  out.history.push({id:r.id,date:r.date,course:r.course,layout:r.layout,layoutKey:r.layoutKey,total:p.total,relative:p.relative,complete:p.complete,holesPlayed:p.holesPlayed??p.scores.filter(n=>n!==null).length,holes:r.pars.length,url:r.url,roundRating:p.roundRating??null});
  let birdieRun=0,cleanRun=0;
  p.scores.forEach((n,i)=>{
   if(n===null){birdieRun=0;cleanRun=0;return;}
   out.recordedHoles++;const diff=n-r.pars[i];
   if(n===1)out.aces++;if(diff<=-2)out.eagles++;else if(diff===-1)out.birdies++;else if(diff===0)out.pars++;else out.bogeys++;
   birdieRun=diff<0?birdieRun+1:0;cleanRun=diff<=0?cleanRun+1:0;out.bestBirdieStreak=Math.max(out.bestBirdieStreak,birdieRun);out.bestCleanStreak=Math.max(out.bestCleanStreak,cleanRun);
   if(i>0&&p.scores[i-1]!==null&&p.scores[i-1]>r.pars[i-1]){out.bounceBackChances++;if(diff<0)out.bounceBacks++;}
   const distance=r.distancesFt?.[i];if(Number.isFinite(distance)&&distance>0){feet+=distance;out.distanceHoles++;out.longestHoleFt=Math.max(out.longestHoleFt??0,distance);}
   const type=types.get(r.pars[i])||{par:r.pars[i],holes:0,strokes:0};type.holes++;type.strokes+=n;types.set(r.pars[i],type);
  });
  if(p.complete){
   if(p.scores.every((n,i)=>n<=r.pars[i]))out.cleanRounds++;
   if(p.relative<0)out.underParRounds++;
   if(r.players.filter(q=>q.complete&&!q.isTeam).length>1)out.competitiveRounds++;
   if(r.pars.length===18){const front=p.scores.slice(0,9).reduce((a,n,i)=>a+n-r.pars[i],0),back=p.scores.slice(9).reduce((a,n,i)=>a+n-r.pars[i+9],0);out.frontNineBest=out.frontNineBest===null?front:Math.min(out.frontNineBest,front);out.backNineBest=out.backNineBest===null?back:Math.min(out.backNineBest,back);}
   const key=r.layoutKey||r.course+'|'+r.layout,course=courses.get(key)||{key,course:r.course,layout:r.layout,rounds:0,total:0,best:p.total,bestToPar:p.relative,bestDate:r.date,par:r.par};course.rounds++;course.total+=p.total;if(p.total<course.best){course.best=p.total;course.bestToPar=p.relative;course.bestDate=r.date;}courses.set(key,course);
  }
 }
 out.courseFeet=out.distanceHoles?feet:null;out.bounceBackRate=out.bounceBackChances?out.bounceBacks/out.bounceBackChances*100:null;out.winRate=out.competitiveRounds?(out.wins+out.sharedWins)/out.competitiveRounds*100:null;
 out.birdieRate=out.recordedHoles?(out.birdies+out.eagles)/out.recordedHoles*100:null;
 out.courseRecords=[...courses.values()].map(c=>({...c,average:c.total/c.rounds})).sort((a,b)=>b.rounds-a.rounds||a.course.localeCompare(b.course));out.favoriteCourse=out.courseRecords[0]?.course||null;
 out.parTypes=[...types.values()].map(p=>({...p,average:p.strokes/p.holes,averageToPar:p.strokes/p.holes-p.par})).sort((a,b)=>a.par-b.par);
 out.monthly=[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,count])=>({month,count}));
 const day=[...weekdays].sort((a,b)=>b[1]-a[1])[0]?.[0];out.favoriteDay=day===undefined?null:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day];
 const peers=new Map(rounds.flatMap(r=>r.players).filter(p=>p.username!==username).map(p=>[p.username,p.name]));
 out.rivals=[...peers].map(([peer,name])=>({username:peer,name,...headToHead(rounds,username,peer)})).filter(p=>p.rounds).sort((a,b)=>b.rounds-a.rounds||b.wins-a.wins);
 if(out.completedRounds)out.badges.push({name:'In the books',note:`${out.completedRounds} completed rounds`,icon:'flag'});
 if(out.birdies+out.eagles>=10)out.badges.push({name:'Birdie club',note:`${out.birdies+out.eagles} holes under par`,icon:'birdie'});
 if(out.aces)out.badges.push({name:'Ace maker',note:`${out.aces} recorded ace${out.aces===1?'':'s'}`,icon:'ace'});
 if(out.bestBirdieStreak>=3)out.badges.push({name:'On a heater',note:`${out.bestBirdieStreak} birdies+ in a row`,icon:'fire'});
 if(out.wins+out.sharedWins)out.badges.push({name:'Bragging rights',note:`${out.wins+out.sharedWins} group first places`,icon:'trophy'});
 if(out.cleanRounds)out.badges.push({name:'Clean slate',note:`${out.cleanRounds} bogey-free rounds`,icon:'clean'});
 return out;
}
