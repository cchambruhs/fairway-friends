export class PhotoError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function validatePhoto(bytes,type){
 if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>5*1024*1024)throw new PhotoError('Choose a JPEG, PNG or WebP image up to 5 MB.');
 const starts=values=>values.every((n,i)=>bytes[i]===n),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 const actual=starts([137,80,78,71,13,10,26,10])?'image/png':starts([255,216,255])?'image/jpeg':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
 if(!actual||actual!==type)throw new PhotoError('The image contents must match its JPEG, PNG or WebP file type.');return actual;
}
async function authorize(db,userId,owner,username){
 if(!userId)throw new PhotoError('Sign in to edit a profile photo.',401);
 if(typeof username!=='string'||!username||username.length>100)throw new PhotoError('Choose a valid player.');
 const player=await db.prepare('SELECT username FROM players WHERE username=?').bind(username).first();if(!player)throw new PhotoError('Player not found.',404);
 if(!owner){const claim=await db.prepare('SELECT username FROM player_gear WHERE username=? AND claimant=?').bind(username,userId).first();if(!claim)throw new PhotoError('Only this player or the host may edit this photo.',403);}
}
export async function saveProfilePhoto(db,bucket,userId,owner,username,bytes,type){
 await authorize(db,userId,owner,username);const contentType=validatePhoto(bytes,type),key='profile-photos/'+crypto.randomUUID(),updatedAt=new Date().toISOString();
 const old=await db.prepare('SELECT object_key FROM player_photos WHERE username=?').bind(username).first();
 await bucket.put(key,bytes,{httpMetadata:{contentType}});
 try{await db.prepare('INSERT INTO player_photos(username,object_key,content_type,updated_at) VALUES (?,?,?,?) ON CONFLICT(username) DO UPDATE SET object_key=excluded.object_key,content_type=excluded.content_type,updated_at=excluded.updated_at').bind(username,key,contentType,updatedAt).run();}catch(e){await bucket.delete(key);throw e;}
 if(old)await bucket.delete(old.object_key);return {username,updatedAt};
}
export async function removeProfilePhoto(db,bucket,userId,owner,username){
 await authorize(db,userId,owner,username);const old=await db.prepare('DELETE FROM player_photos WHERE username=? RETURNING object_key').bind(username).first();if(old)await bucket.delete(old.object_key);return {username};
}
