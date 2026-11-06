export async function roundFingerprint(round){
 const key=JSON.stringify({layout:round.layoutKey||[round.course.trim().toLowerCase(),round.layout.trim().toLowerCase()].join('|'),date:round.date,pars:round.pars,players:round.players.map(p=>({username:p.username,scores:p.scores})).sort((a,b)=>a.username.localeCompare(b.username))});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function persistPublicRound(db,round,existingRounds=[]){
 const normalize=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
 const csvMatches=existingRounds.filter(r=>r.source==='csv'&&normalize(r.course)===normalize(round.course)&&normalize(r.layout)===normalize(round.layout)&&r.date.slice(0,16)===round.date.slice(0,16)&&JSON.stringify(r.pars)===JSON.stringify(round.pars)).filter(r=>{const common=round.players.filter(p=>r.players.some(q=>q.username===p.username));return common.length&&common.every(p=>JSON.stringify(p.scores)===JSON.stringify(r.players.find(q=>q.username===p.username).scores));});
 if(csvMatches.length>1)throw new Error('More than one historical card matches this link. The owner needs to review the match.');
 if(csvMatches.length===1){
  const previous=csvMatches[0],row=await db.prepare('SELECT data FROM rounds WHERE id=?').bind(previous.id).first();if(!row)throw new Error('Historical card changed. Try importing again.');
  const current=JSON.parse(row.data),players=new Map(current.players.map(p=>[p.username,p]));
  for(const p of round.players){const prior=players.get(p.username);if(prior&&JSON.stringify(prior.scores)!==JSON.stringify(p.scores))throw new Error('Scores conflict with saved history. The owner needs to review this card.');
   if(!prior&&current.players.some(q=>normalize(q.name)===normalize(p.name)&&q.username!==p.username))throw new Error('A matching player name has a different identity in history. Ask the owner to map the identities before importing.');
   players.set(p.username,{...prior,...p,roundRating:p.roundRating??prior?.roundRating??null});
  }
  const enriched={...current,...round,id:current.id,players:[...players.values()]},data=JSON.stringify(enriched),fingerprint=await roundFingerprint(enriched);
  const results=await db.batch([
   db.prepare('UPDATE rounds SET data=?,fingerprint=? WHERE id=? AND data=? RETURNING id').bind(data,fingerprint,current.id,row.data),
   ...enriched.players.filter(p=>!p.isTeam).map(p=>db.prepare('INSERT INTO players(username,data) VALUES (?,?) ON CONFLICT(username) DO NOTHING').bind(p.username,JSON.stringify({username:p.username,name:p.name,isGuest:!!p.isGuest,pdgaNumber:null})))
  ]);
  if(!results[0].results.length)throw new Error('Historical card changed while saving. Retry the import.');
  return {inserted:false,round:enriched};
 }
 const fingerprint=await roundFingerprint(round);
 const results=await db.batch([
  db.prepare('INSERT INTO rounds(id,data,fingerprint) VALUES (?,?,?) ON CONFLICT DO NOTHING RETURNING id').bind(round.id,JSON.stringify(round),fingerprint),
  ...round.players.map(p=>db.prepare('INSERT INTO players(username,data) VALUES (?,?) ON CONFLICT(username) DO NOTHING').bind(p.username,JSON.stringify({username:p.username,name:p.name,isGuest:!!p.isGuest,pdgaNumber:null})))
 ]);
 if(results[0].results.length)return {inserted:true,round};
 const existing=await db.prepare('SELECT data FROM rounds WHERE id=? OR fingerprint=? LIMIT 1').bind(round.id,fingerprint).first();
 return {inserted:false,round:existing?JSON.parse(existing.data):round};
}
export async function backfillRoundFingerprints(db,rows){
 const values=await Promise.all(rows.filter(r=>!r.fingerprint).map(async r=>({id:r.id,fingerprint:await roundFingerprint(JSON.parse(r.data))})));
 if(values.length)await db.batch(values.map(r=>db.prepare('UPDATE rounds SET fingerprint=? WHERE id=? AND fingerprint IS NULL').bind(r.fingerprint,r.id)));
}

/** Apply owner-provided public cards once; repeat requests do not repeat writes. */
export async function seedData(db,seed){
 const version=seed.version||'initial-cards';
 if(await db.prepare('SELECT version FROM seed_runs WHERE version=?').bind(version).first())return false;
 const existing=(await db.prepare('SELECT id,data,fingerprint FROM rounds').all()).results;
 await backfillRoundFingerprints(db,existing);
 const fingerprints=await Promise.all(seed.rounds.map(roundFingerprint));
 const profiles=new Map((seed.players||[]).map(p=>[p.username,p]));
 for(const round of seed.rounds)for(const p of round.players)if(!p.isTeam&&!profiles.has(p.username))profiles.set(p.username,{username:p.username,name:p.name,isGuest:!!p.isGuest,pdgaNumber:null});
 await db.batch([
  ...seed.rounds.map((r,i)=>db.prepare('INSERT INTO rounds(id,data,fingerprint) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(r.id,JSON.stringify(r),fingerprints[i])),
  ...[...profiles.values()].map(p=>db.prepare('INSERT INTO players(username,data) VALUES (?,?) ON CONFLICT(username) DO NOTHING').bind(p.username,JSON.stringify(p))),
  db.prepare('INSERT INTO seed_runs(version) VALUES (?) ON CONFLICT DO NOTHING').bind(version)
 ]);
 return true;
}
