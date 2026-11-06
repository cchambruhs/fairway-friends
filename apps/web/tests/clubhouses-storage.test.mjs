import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
import {readClubs,mutateClub} from '../lib/clubhouses.mjs';
const {Miniflare}=createRequire(import.meta.resolve('wrangler/package.json'))('miniflare');
test('Clubhouse membership and messages persist privately with concurrent writes guarded',async()=>{
 const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:['DB'],cf:false});
 try{const db=await mf.getD1Database('DB');await db.prepare(readFileSync(new URL('../drizzle/0007_clubhouses.sql',import.meta.url),'utf8')).run();
 const alice={userId:'alice',fullName:'Alice'},bob={userId:'bob',fullName:'Bob'},eve={userId:'eve'};
 const c=await mutateClub(db,alice,{action:'create',name:'Sunday crew'});
 assert.equal((await readClubs(db,eve)).length,0);assert.deepEqual(await readClubs(db,null),[]);
 await assert.rejects(()=>mutateClub(db,eve,{action:'message',clubId:c.id,text:'intruder'}),e=>e.status===403);
 await mutateClub(db,bob,{action:'join',code:c.code});await mutateClub(db,bob,{action:'join',code:c.code});assert.equal((await readClubs(db,alice))[0].members.length,2);
 await mutateClub(db,bob,{action:'message',clubId:c.id,text:'See you on the tee'});assert.equal((await readClubs(db,alice))[0].messages[0].text,'See you on the tee');
 const results=await Promise.allSettled([1,2].map(i=>mutateClub(db,alice,{action:'poll',clubId:c.id,question:'Course '+i,options:['A','B']})));
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.ok(results.every(r=>r.status==='fulfilled'||r.reason.status===409));
 assert.equal((await readClubs(db,eve)).length,0);
 }finally{await mf.dispose();}
});
