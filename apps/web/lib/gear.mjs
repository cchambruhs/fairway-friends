export class GearError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function text(value,max,label){if(value===undefined||value===null)return '';if(typeof value!=='string'||value.trim().length>max)throw new GearError(`${label} must be text, at most ${max} characters.`);return value.trim();}
export function normalizeGear(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new GearError('Check your bag details.');
 const brand=text(input.brand,70,'Manufacturer'),relationship=input.relationship??'favorite';if(!['favorite','sponsor'].includes(relationship))throw new GearError('Choose favorite manufacturer or self-reported sponsor.');
 const discs=input.discs??[];if(!Array.isArray(discs)||discs.length>5)throw new GearError('Your top bag can have up to five discs.');
 return {brand,relationship,discs:discs.map(d=>{if(!d||typeof d!=='object'||Array.isArray(d))throw new GearError('Check the disc details.');const mold=text(d.mold,80,'Disc mold');if(!mold)throw new GearError('Enter a mold name for each disc you add.');let weightGrams=d.weightGrams??null;if(weightGrams!==null&&(typeof weightGrams!=='number'||!Number.isFinite(weightGrams)||weightGrams<1||weightGrams>250||Math.abs(weightGrams*10-Math.round(weightGrams*10))>.000001))throw new GearError('Disc weights must be 1–250 grams, with up to one decimal.');return {mold,manufacturer:text(d.manufacturer,70,'Disc manufacturer'),plastic:text(d.plastic,70,'Plastic'),weightGrams};})};
}
async function knownPlayer(db,username){if(typeof username!=='string'||!username||username.length>100)throw new GearError('Choose a valid player.');const p=await db.prepare('SELECT username FROM players WHERE username=?').bind(username).first();if(!p)throw new GearError('Player not found. Import a scorecard with this player first.',404);}
export async function claimPlayerGear(db,username,userId){
 if(!userId)throw new GearError('Sign in to claim your profile.',401);await knownPlayer(db,username);
 try{const r=await db.prepare('INSERT INTO player_gear(username,claimant,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(username) DO UPDATE SET claimant=excluded.claimant,updated_at=excluded.updated_at WHERE player_gear.claimant IS NULL OR player_gear.claimant=excluded.claimant RETURNING username').bind(username,userId,JSON.stringify(normalizeGear()),new Date().toISOString()).all();if(!r.results.length)throw new GearError('This player profile has already been claimed.',409);return {username};}
 catch(e){if(e instanceof GearError)throw e;if(/unique constraint/i.test(e.message))throw new GearError('This account already has a claimed player profile.',409);throw e;}
}
export async function savePlayerGear(db,username,userId,owner,input){
 if(!userId)throw new GearError('Sign in to edit your bag.',401);await knownPlayer(db,username);const data=normalizeGear(input),updatedAt=new Date().toISOString();
 if(owner){await db.prepare('INSERT INTO player_gear(username,claimant,data,updated_at) VALUES (?,NULL,?,?) ON CONFLICT(username) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(username,JSON.stringify(data),updatedAt).run();}
 else{const r=await db.prepare('UPDATE player_gear SET data=?,updated_at=? WHERE username=? AND claimant=? RETURNING username').bind(JSON.stringify(data),updatedAt,username,userId).all();if(!r.results.length)throw new GearError('Claim this profile before editing its bag. You cannot edit another player’s bag.',403);}
 return {username,...data};
}
/** @param {any} db @param {string|null} [userId] */
export async function readPlayerGear(db,userId=null){const result=await db.prepare('SELECT username,claimant,data,updated_at FROM player_gear').all();return {claimedUsername:userId?result.results.find(r=>r.claimant===userId)?.username||null:null,bags:result.results.map(r=>({username:r.username,claimed:!!r.claimant,updatedAt:r.updated_at,...normalizeGear(JSON.parse(r.data))}))};}
export async function releasePlayerGear(db,username,owner){if(!owner)throw new GearError('Only the host can release a profile claim.',403);await knownPlayer(db,username);await db.prepare('UPDATE player_gear SET claimant=NULL WHERE username=?').bind(username).run();return {username};}
