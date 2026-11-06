import {normalizeRules,normalizePayout,leagueStandings,calculatePayouts} from './league-scoring.mjs';
export class LeagueError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status=400)=>{throw new LeagueError(message,status)};
const text=(s,max=200)=>typeof s==='string'?s.trim().slice(0,max):'';
function settings(input={}){
 const name=text(input.name,80),startDate=text(input.startDate,10),endDate=text(input.endDate,10),timezone=input.timezone??'America/Chicago';
 if(!name||![startDate,endDate].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d)))||endDate<startDate)fail('Enter a league name and valid start/end dates.');
 try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format()}catch{fail('Choose a valid timezone.');}
 const buyInCents=input.buyInCents??0;if(!Number.isInteger(buyInCents)||buyInCents<0||buyInCents>100000000)fail('Enter a valid buy-in.');
 const maxPlayers=input.maxPlayers??10;if(!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>100)fail('Choose a player capacity from 2 to 100.');
 const region=input.region??'IN';if(!['IN','KY','IL'].includes(region))fail('Choose Indiana, Kentucky, or Illinois for this league.');
 return {name,startDate,endDate,timezone,description:text(input.description,1500),prizeNotes:text(input.prizeNotes,1500),courseKey:text(input.courseKey),buyInCents,maxPlayers,region,rules:normalizeRules(input.rules),payout:normalizePayout(input.payout)};
}
function localTime(value,timezone){
 if(!value.endsWith('Z')&&!/[+-]\d{2}:?\d{2}$/.test(value))return value.slice(0,16);
 return new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');
}
export function reviewVersion(r){return JSON.stringify([r.date,r.utcDate??null,r.course,r.layoutKey,r.pars,r.players.map(p=>[p.username,p.scores]).sort((a,b)=>a[0].localeCompare(b[0]))]);}
async function roundMap(db){const rows=(await db.prepare('SELECT id,data FROM rounds').all()).results;return Object.assign(new Map(rows.map(r=>[r.id,JSON.parse(r.data)])),{rawById:new Map(rows.map(r=>[r.id,r.data]))});}
function sync(l,map){
 if(l.status==='completed')return l;
 for(const c of l.cards){const r=map.get(c.roundId);if(c.status==='accepted'&&(!r||reviewVersion(r)!==c.signature)){c.status='needs-review';c.reason='Source scores changed. Leader re-review required.';}
  c.reviewVersion=r?reviewVersion(r):null;if(r&&c.status!=='accepted')c.round=structuredClone(r);
 }
 return l;
}
function eligibility(l,r){
 if(!r)fail('The saved scorecard was not found.',404);
 const date=localTime(r.utcDate||r.date,l.timezone),start=localTime(l.startedAt,l.timezone);
 if(date.slice(0,10)<l.startDate||date.slice(0,10)>l.endDate||date<start)fail('The round must be played within league dates and after Start.');
 if(l.courseKey&&l.courseKey!==r.layoutKey)fail('This card is not on the league’s selected course/layout.');
 const members=new Set(l.members.map(m=>m.username)),participants=r.players.filter(p=>members.has(p.username));
 if(!participants.length)fail('The card needs a league participant.');
 if(participants.some(p=>!p.complete||p.scores.length!==r.pars.length||p.scores.some(n=>!Number.isInteger(n)||n<1)))fail('All league participants on this card must finish their round before approval.');
 if(participants.some(p=>p.isTeam||p.username.includes('+')))fail('Team scorecards cannot count as individual league rounds.');
 return participants;
}
async function actor(db,user){
 if(!user?.userId)fail('Sign in to manage or join a league.',401);
 const row=await db.prepare('SELECT username FROM player_gear WHERE claimant=?').bind(user.userId).first();
 if(!row)fail('Claim your player profile under The crew before joining or creating a league.',403);
 return {userId:user.userId,username:row.username,name:row.username};
}
function requireLeader(l,a){if(l.leaderId!==a.userId||!l.members.some(m=>m.userId===a.userId&&m.username===a.username))fail('Only this League Leader can do that.',403);}
function requireMember(l,a){if(!l.members.some(m=>m.userId===a.userId&&m.username===a.username))fail('Join this league with your claimed profile first.',403);}
export async function mutateLeague(db,user,body,now=new Date().toISOString()){
 if(!body||typeof body!=='object'||Array.isArray(body))fail('Choose a league action.');
 const a=await actor(db,user);
 if(body.action==='create'){
  const count=await db.prepare('SELECT COUNT(*) AS n FROM leagues').first();if(count.n>=200)fail('Clubhouse league limit reached.');
  const l={id:crypto.randomUUID(),...settings(body.settings),leaderId:a.userId,status:'draft',inviteToken:crypto.randomUUID()+crypto.randomUUID(),members:[a],cards:[],activity:[],createdAt:now};
  await db.prepare('INSERT INTO leagues(id,data,revision) VALUES (?,?,0)').bind(l.id,JSON.stringify(l)).run();return project(l,a.userId);
 }
 if(typeof body.leagueId!=='string')fail('Choose a league.');
 const row=await db.prepare('SELECT data,revision FROM leagues WHERE id=?').bind(body.leagueId).first();if(!row)fail('League not found.',404);
 const map=await roundMap(db),l=sync(JSON.parse(row.data),map),was=JSON.stringify(l);const leader=()=>requireLeader(l,a);
 const active=()=>{if(l.status!=='active')fail('This league is not active.');};
 const withinSubmissionWindow=()=>{if(localTime(now,l.timezone).slice(0,10)>l.endDate)fail('The league has ended. The leader can review existing submissions.');};
 switch(body.action){
  case 'save':leader();if(l.status!=='draft')fail('Scoring and league settings are locked after Start.',409);Object.assign(l,settings(body.settings));break;
  case 'invite':leader();if(l.status!=='draft')fail('Invitations close when the league starts.');l.inviteToken=crypto.randomUUID()+crypto.randomUUID();break;
  case 'join':
   if(l.status!=='draft')fail('This league has already started; membership is locked.');
   if(typeof body.inviteToken!=='string'||body.inviteToken!==l.inviteToken)fail('This invitation is invalid or has been replaced.',403);
   if(l.members.some(m=>m.userId===a.userId||m.username===a.username))break;
   if(l.members.length>=(l.maxPlayers??100))fail('This league has reached its player capacity.');l.members.push(a);break;
  case 'start':leader();if(l.status!=='draft')fail('League already started.',409);if(l.members.length<2)fail('Invite at least one other player before starting.');if(localTime(now,l.timezone).slice(0,10)>l.endDate)fail('Choose a future league end date before starting.');l.status='active';l.startedAt=now;break;
  case 'submit':{
   active();requireMember(l,a);withinSubmissionWindow();const r=map.get(body.roundId);if(!r||!r.players.some(p=>p.username===a.username))fail('Your claimed player must be on the submitted card.');
   if(l.cards.some(c=>c.roundId===r.id))break;if(l.cards.length>=500)fail('This league has reached its 500-card limit.');
   l.cards.push({roundId:r.id,status:'pending',submittedBy:a.userId,submittedAt:now});break;
  }
  case 'review':{
   active();leader();if(!['accepted','rejected'].includes(body.decision))fail('Accept or reject this card.');const c=l.cards.find(c=>c.roundId===body.roundId);if(!c)fail('Submission not found.',404);
   if(body.decision==='accepted'){const r=map.get(c.roundId);eligibility(l,r);if(body.reviewVersion!==reviewVersion(r))fail('The source card changed or was not reviewed. Reload its latest scores before accepting.',409);c.round=structuredClone(r);c.signature=reviewVersion(r);c.championship=body.championship===true;}
   c.status=body.decision;c.reviewedAt=now;c.reason=text(body.reason,500);l.playoffOrder=[];break;
  }
  case 'remove':{active();leader();const c=l.cards.find(c=>c.roundId===body.roundId);if(!c)fail('Card not found.');c.status='rejected';c.reason='Removed by League Leader';l.playoffOrder=[];break;}
  case 'complete':{
   active();leader();if(l.cards.some(c=>['pending','needs-review'].includes(c.status)))fail('Review every pending or changed card before finishing.');
   const raw=leagueStandings(l),tied=raw.filter(s=>s.playoffRequired);if(!raw.some(s=>s.countedRounds>0))fail('Approve at least one counted round before finalizing this league.');
   const order=body.playoffOrder??[];if(!Array.isArray(order)||new Set(order).size!==order.length||order.some(u=>typeof u!=='string'||!tied.some(s=>s.username===u)))fail('Enter each tied player once in playoff finishing order.');
   if(tied.some(s=>!order.includes(s.username)))fail('Playoff required: enter the playoff finishing order for tied players.');
   l.playoffOrder=order;const standings=leagueStandings(l);l.final={standings,payouts:calculatePayouts(standings,l.payout),finalizedAt:now};l.status='completed';l.completedAt=now;break;
  }
  default:fail('Unknown league action.');
 }
 if(JSON.stringify(l)!==was){l.activity.push({action:body.action,at:now,roundId:typeof body.roundId==='string'?body.roundId:null});l.activity=l.activity.slice(-100);}
 // The league revision alone cannot detect a canonical score refresh. Check the
 // exact source rows in this same SQLite statement before approving or freezing.
 const guardedIds=body.action==='complete'?l.cards.filter(c=>c.status==='accepted').map(c=>c.roundId):body.action==='review'&&body.decision==='accepted'?[body.roundId]:[];
 const expected=guardedIds.map(id=>({id,data:map.rawById.get(id)}));
 const updated=await db.prepare("UPDATE leagues SET data=?,revision=revision+1 WHERE id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM json_each(?) AS v LEFT JOIN rounds AS r ON r.id=json_extract(v.value,'$.id') WHERE r.data IS NULL OR r.data!=json_extract(v.value,'$.data')) RETURNING id").bind(JSON.stringify(l),l.id,row.revision,JSON.stringify(expected)).all();
 if(!updated.results.length)fail('This league changed while you were saving. Reload and try again.',409);
 return project(l,a.userId);
}
function project(l,userId,inviteToken=null,claimedUsername=undefined){
 const member=l.members.find(m=>m.userId===userId&&(claimedUsername===undefined||m.username===claimedUsername)),canLead=!!member&&l.leaderId===userId;
 const standings=l.final?.standings??leagueStandings(l),payouts=l.final?.payouts??calculatePayouts(standings,l.payout);
 return {id:l.id,name:l.name,description:l.description,startDate:l.startDate,endDate:l.endDate,timezone:l.timezone,courseKey:l.courseKey,buyInCents:l.buyInCents,maxPlayers:l.maxPlayers??100,region:l.region??'IN',prizeNotes:l.prizeNotes,rules:l.rules,payout:l.payout,status:l.status,startedAt:l.startedAt,completedAt:l.completedAt,canLead,isMember:!!member,canJoin:l.status==='draft'&&l.members.length<(l.maxPlayers??100)&&!!inviteToken&&inviteToken===l.inviteToken,members:l.members.map(({username,name})=>({username,name})),...(canLead?{inviteToken:l.inviteToken}:{}),cards:l.cards.filter(c=>c.status==='accepted'||canLead||userId&&c.submittedBy===userId).map(({submittedBy,signature,...c})=>({...c,isOwn:submittedBy===userId})),standings,payouts,activity:canLead?l.activity:[]};
}
/** @param {any} db @param {any} [user] @param {string|null} [inviteToken] */
export async function readLeagues(db,user=null,inviteToken=null){
 const rows=(await db.prepare('SELECT data FROM leagues').all()).results,map=await roundMap(db);
 const claim=user?.userId?await db.prepare('SELECT username FROM player_gear WHERE claimant=?').bind(user.userId).first():null;
 return rows.map(row=>sync(JSON.parse(row.data),map)).map(l=>project(l,user?.userId??null,inviteToken,claim?.username??null)).sort((a,b)=>Number(b.isMember)-Number(a.isMember)||a.name.localeCompare(b.name));
}
