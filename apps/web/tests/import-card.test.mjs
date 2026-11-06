import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {fetchRound} from '../lib/import-card.mjs';
const url='https://udisc.com/scorecards/scorecard_mns8y9vb4afhk4v7lafcmk8n';
test('upstream network failure gives actionable error rather than internal reference',async()=>{await assert.rejects(()=>fetchRound(url,async()=>{throw new Error('internal error; reference=secret')}),/UDisc.*CSV/);});
test('redirects are rejected without following another destination',async()=>{await assert.rejects(()=>fetchRound(url,async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/'}})),/302/);});
test('valid HTTP HTML response parses real scores',async()=>{let r=await fetchRound(url,async()=>new Response(fs.readFileSync('tests/fixtures/mns8y9vb4afhk4v7lafcmk8n.html'),{headers:{'content-type':'text/html'}}));assert.equal(r.players[1].total,46)});
