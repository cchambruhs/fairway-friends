import test from 'node:test';
import assert from 'node:assert/strict';
import {leagueActivationQuote,prizePoolQuote,bettingPoolQuote,subscriptionQuote} from '../lib/commerce.mjs';

test('league activation tiers use the configured player cap',()=>{
 assert.deepEqual(leagueActivationQuote(10),{capacity:10,feeCents:100,label:'Up to 10 players'});
 assert.deepEqual(leagueActivationQuote(11),{capacity:11,feeCents:500,label:'Up to 20 players'});
 assert.deepEqual(leagueActivationQuote(21),{capacity:21,feeCents:5000,label:'21–100 players'});
});

test('league prize pool quote keeps service fees and player pool separate',()=>{
 assert.deepEqual(prizePoolQuote(6000,'league'),{grossCents:6000,feeCents:600,netPoolCents:6000,rate:0.1});
 assert.deepEqual(prizePoolQuote(6000,'standalone'),{grossCents:6000,feeCents:270,netPoolCents:5730,rate:0.045});
});

test('betting remains unavailable until a regulated real-money workflow exists',()=>{
 assert.deepEqual(bettingPoolQuote(2000),{enabled:false,reason:'Betting pools are not available yet.',grossCents:2000,feeCents:0,netPoolCents:2000});
});

test('founders and annual subscribers receive the correct membership quote',()=>{
 assert.deepEqual(subscriptionQuote('founder'),{plan:'Founder',amountCents:0,interval:null});
 assert.deepEqual(subscriptionQuote('annual'),{plan:'Annual',amountCents:800,interval:'year'});
});
