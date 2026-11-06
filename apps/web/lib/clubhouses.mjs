export class ClubError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail=(s,status=400)=>{throw new ClubError(s,status)};
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
export function publicClub(club,userId){
 const member=club.members.some(m=>m.id===userId);
 if(!member)return {id:club.id,name:club.name,memberCount:club.members.length,preview:true};
 return {...club,isAdmin:club.admin===userId,isMember:true};
}
export function changeClub(club,user,body,now=new Date().toISOString()){
 const c=structuredClone(club),member=c.members.find(m=>m.id===user.userId);
 if(!member)fail('Join this Clubhouse first.',403);
 const admin=c.admin===user.userId;
 if(body.action==='message'){
  const content=text(body.text,2000);if(!content)fail('Write a message first.');
  if(c.messages.some(m=>m.author===user.userId&&Date.parse(now)-Date.parse(m.at)<2000))fail('Wait a moment before sending again.',429);
  c.messages.push({id:crypto.randomUUID(),author:user.userId,name:member.name,text:content,at:now,pinned:false});c.messages=c.messages.slice(-300);
 }else if(body.action==='pin'){
  if(!admin)fail('Only the Clubhouse administrator can pin announcements.',403);
  const m=c.messages.find(m=>m.id===body.messageId);if(!m)fail('Message not found.',404);m.pinned=!m.pinned;
 }else if(body.action==='poll'){
  const question=text(body.question,150),options=(Array.isArray(body.options)?body.options:[]).map(v=>text(v,100)).filter(Boolean);
  if(!question||options.length<2||options.length>8||new Set(options).size!==options.length)fail('Add a question and 2–8 different choices.');
  if(c.polls.length>=50)fail('This Clubhouse has reached its poll limit.');
  c.polls.push({id:crypto.randomUUID(),question,options,votes:{},author:user.userId,at:now});
 }else if(body.action==='vote'){
  const p=c.polls.find(p=>p.id===body.pollId);if(!p||!Number.isInteger(body.option)||!p.options[body.option])fail('Choose an available poll option.');p.votes[user.userId]=body.option;
 }else if(body.action==='event'){
  const title=text(body.title,100),course=text(body.course,150),timezone=text(body.timezone,80),startsAt=text(body.startsAt,40);
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format();}catch{fail('Choose a valid timezone.');}
  if(!title||!course||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(startsAt)||!Number.isFinite(Date.parse(startsAt))||Date.parse(startsAt)<=Date.parse(now))fail('Enter a title, course, and future start time.');
  if(c.events.length>=100)fail('This Clubhouse has reached its event limit.');
  c.events.push({id:crypto.randomUUID(),title,course,startsAt,timezone,organizer:user.userId,rsvps:{[user.userId]:'Going'},at:now});
 }else if(body.action==='rsvp'){
  const e=c.events.find(e=>e.id===body.eventId);if(!e||!['Going','Maybe','Not going'].includes(body.response))fail('Choose a valid round and RSVP.');e.rsvps[user.userId]=body.response;
 }else fail('Choose a supported Clubhouse action.');
 return c;
}
export async function readClubs(db,user){
 if(!user)return [];
 const rows=(await db.prepare('SELECT data FROM clubhouses').all()).results;
 return rows.map(r=>JSON.parse(r.data)).filter(c=>c.members.some(m=>m.id===user.userId)).map(c=>publicClub(c,user.userId));
}
export async function mutateClub(db,user,body){
 if(!user)fail('Sign in to use a private Clubhouse.',401);
 const now=new Date().toISOString();
 if(body.action==='create'){
  const name=text(body.name,80);if(!name)fail('Give your Clubhouse a name.');
  const own=await readClubs(db,user);if(own.length>=20)fail('You can join up to 20 Clubhouses.');
  const id=crypto.randomUUID(),code='FF-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
  const c={id,name,code,admin:user.userId,members:[{id:user.userId,name:user.fullName||user.displayName||'Player'}],messages:[],polls:[],events:[],createdAt:now};
  await db.prepare('INSERT INTO clubhouses(id,code,data,revision) VALUES (?,?,?,0)').bind(id,code,JSON.stringify(c)).run();return publicClub(c,user.userId);
 }
 const row=body.action==='join'?await db.prepare('SELECT * FROM clubhouses WHERE code=?').bind(text(body.code,40).toUpperCase()).first():await db.prepare('SELECT * FROM clubhouses WHERE id=?').bind(text(body.clubId,80)).first();
 if(!row)fail('Clubhouse not found. Check the invite code.',404);
 let c=JSON.parse(row.data);
 if(body.action==='join'){
  if(c.members.some(m=>m.id===user.userId))return publicClub(c,user.userId);
  if(c.members.length>=100)fail('This Clubhouse is full.');
  if((await readClubs(db,user)).length>=20)fail('You can join up to 20 Clubhouses.');
  c.members.push({id:user.userId,name:user.fullName||user.displayName||'Player'});
 }else c=changeClub(c,user,body,now);
 const result=await db.prepare('UPDATE clubhouses SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(c),row.id,row.revision).run();
 if(!result.meta.changes)fail('Another member just updated this Clubhouse. Refresh and try again.',409);
 return publicClub(c,user.userId);
}
