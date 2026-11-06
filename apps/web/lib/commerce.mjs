const integerCents=value=>Number.isInteger(value)&&value>=0?value:0;

export function leagueActivationQuote(capacity){
 const safe=Math.max(2,Math.min(100,Number.isInteger(capacity)?capacity:10));
 if(safe<=10)return {capacity:safe,feeCents:100,label:'Up to 10 players'};
 if(safe<=20)return {capacity:safe,feeCents:500,label:'Up to 20 players'};
 return {capacity:safe,feeCents:5000,label:'21–100 players'};
}

export function prizePoolQuote(grossCents,kind='league'){
 const gross=integerCents(grossCents),rate=kind==='standalone'?0.045:0.1,feeCents=Math.round(gross*rate);
 return {grossCents:gross,feeCents,netPoolCents:kind==='standalone'?gross-feeCents:gross,rate};
}

export function bettingPoolQuote(grossCents){
 const gross=integerCents(grossCents);
 return {enabled:false,reason:'Betting pools are not available yet.',grossCents:gross,feeCents:0,netPoolCents:gross};
}

export function subscriptionQuote(plan){
 if(plan==='founder')return {plan:'Founder',amountCents:0,interval:null};
 if(plan==='annual')return {plan:'Annual',amountCents:800,interval:'year'};
 return {plan:'Monthly',amountCents:99,interval:'month'};
}
