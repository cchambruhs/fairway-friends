import {parseHTML} from 'linkedom';
export {summarize,headToHead,mergeRounds} from './stats.mjs';
const clean=x=>(x?.textContent??'').trim();
export function validateCardUrl(input){let u;try{u=new URL(input.trim())}catch{throw new Error('Paste a valid UDisc scorecard link.')}if(u.protocol!=='https:'||u.hostname!=='udisc.com'||u.port||u.username||u.password||!/^\/scorecards\/(?:scorecard_[a-z0-9]{8,80}|[A-Za-z0-9]{10})\/?$/.test(u.pathname))throw new Error('Only shared https://udisc.com/scorecards/… links are supported.');return 'https://udisc.com'+u.pathname.replace(/\/$/,'');}
function finishPlayer(p,pars){const scores=p.scores;const holesPlayed=scores.filter(s=>s!==null).length;return {...p,total:scores.reduce((a,b)=>a+(b??0),0),relative:scores.reduce((a,b,i)=>a+(b===null?0:b-pars[i]),0),complete:holesPlayed===pars.length,holesPlayed};}
export function validateRound(r){
 if(!r || typeof r.id!=='string'||r.id.length>200||typeof r.course!=='string'||!r.course.trim()||r.course.length>200||typeof r.layout!=='string'||r.layout.length>200||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.date)||!Number.isFinite(Date.parse(r.date)))throw new Error('Round needs a course, layout and valid date/time.');
 if(!Array.isArray(r.pars)||r.pars.length<1||r.pars.length>54||r.pars.some(n=>!Number.isInteger(n)||n<1||n>10))throw new Error('Hole pars are missing or invalid.');
 if(!Array.isArray(r.players)||!r.players.length||r.players.length>100)throw new Error('Player scores are missing.');
 if(r.distancesFt!==undefined&&(!Array.isArray(r.distancesFt)||r.distancesFt.length!==r.pars.length||r.distancesFt.some(n=>n!==null&&(!Number.isFinite(n)||n<=0||n>20000))))throw new Error('Hole distances are invalid.');
 const seen=new Set();
 const players=r.players.map(p=>{if(typeof p.username!=='string'||!p.username||p.username.length>100||typeof p.name!=='string'||!p.name||p.name.length>150||seen.has(p.username))throw new Error('Player identities are missing or duplicated.');seen.add(p.username);if(!Array.isArray(p.scores)||p.scores.length!==r.pars.length||p.scores.some(n=>n!==null&&(!Number.isInteger(n)||n<1||n>40)))throw new Error('Hole scores are missing or invalid.');return finishPlayer({username:p.username,name:p.name,scores:p.scores,isTeam:p.isTeam===true||p.name.includes('+'),isGuest:p.isGuest===true,roundRating:typeof p.roundRating==='number'&&Number.isFinite(p.roundRating)?p.roundRating:null},r.pars);});
 return {...r,players,par:r.pars.reduce((a,b)=>a+b,0)};
}
export function parseScorecard(html,input){
 const url=validateCardUrl(input);const {document:d}=parseHTML(html);const course=clean(d.querySelector('h1'));const layoutEl=[...d.querySelectorAll('a[href]')].find(a=>/\/layouts\/\d+\/caddie-book/.test(a.getAttribute('href')));const table=d.querySelector('table');
 if(!course||!layoutEl||!table)throw new Error('UDisc did not return a readable scorecard. Try its CSV export instead.');
 const header=[...table.querySelectorAll('thead th')].slice(2,-1);const pars=header.map(h=>Number(clean(h.querySelector('div > div > div:last-child'))));
 const units=[...d.querySelectorAll('button')].map(clean);
 const distanceFactor=units.includes('US')?1:units.includes('Metric')?3.28084:null;
 const distancesFt=header.map(h=>{const value=Number(clean(h.querySelector('div > div > div:nth-child(2)')).replace(/,/g,''));return distanceFactor&&Number.isFinite(value)&&value>0?Math.round(value*distanceFactor):null;});
 const metadata=d.querySelector('h1')?.parentElement?.parentElement?.textContent??'';
 const location=clean(d.querySelector('h1')?.parentElement?.parentElement?.querySelector('a[href^="/places/"]'))||null;
 const match=metadata.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM)/);
 if(!match)throw new Error('The scorecard date could not be read. Import a CSV export instead.');
 const [,mon,day,year,hr,min,ampm]=match;const month=String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(mon)+1).padStart(2,'0');const hour=String(Number(hr)%12+(ampm==='PM'?12:0)).padStart(2,'0');
 const players=[];
 for(const row of table.querySelectorAll('tbody tr')){const cells=[...row.querySelectorAll('td')];if(cells.length!==pars.length+3)throw new Error('A scorecard player row changed format. Nothing was imported.');const identity=clean(cells[1]);let match=identity.match(/^(.+?)@([\w.-]+)$/),isGuest=false;if(!match){const primary=clean(cells[1].querySelector('.text-medium-strong'));if(!primary||primary!==identity||identity.includes('@')||cells[1].querySelector('img')?.getAttribute('alt')?.trim()!==primary)throw new Error('A player identity could not be read.');match=[identity,primary,'guest:'+url.split('/').pop()+':'+csvHash(primary.trim().toLowerCase())];isGuest=true;}const scores=cells.slice(2,-1).map(c=>{const s=clean(c);return s==='-'||s==='—'||s===''?null:Number(s)});const p=finishPlayer({name:match[1],username:match[2],scores,isGuest},pars);const totalText=clean(cells.at(-1));const printed=totalText.match(/\((\d+)\)/);if(!printed||Number(printed[1])!==p.total)throw new Error('Score totals did not match. Nothing was imported.');players.push(p);}
 return validateRound({id:url.split('/').pop(),source:'udisc',url,course,location,layout:clean(layoutEl),layoutKey:layoutEl.getAttribute('href'),date:`${year}-${month}-${day.padStart(2,'0')}T${hour}:${min}`,pars,distancesFt,players,importedAt:new Date().toISOString()});
}
const csvNormalize=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
function csvHash(s){let n=14695981039346656037n;for(const c of s){n^=BigInt(c.charCodeAt(0));n=BigInt.asUintN(64,n*1099511628211n);}return n.toString(16);}
export function parseCsvRows(rows,aliases={},options={}){
 if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw new Error('CSV must contain 1–10,000 rows.');
 const groups=new Map(),lookup=new Map(Object.entries(aliases).map(([k,v])=>[csvNormalize(k),v]));
 const get=(row,...keys)=>{for(const key of keys){const found=Object.keys(row).find(k=>k.replace(/[^a-z0-9]/gi,'').toLowerCase()===key.replace(/[^a-z0-9]/gi,'').toLowerCase());if(found&&String(row[found]).trim())return String(row[found]).trim();}return '';};
 for(const row of rows){
  const name=get(row,'PlayerName','Player','Name'),course=get(row,'CourseName','Course'),layout=get(row,'LayoutName','Layout')||'Main',rawDate=get(row,'StartDate','Date','StartTime');
  if(!name||!course||!rawDate)throw new Error('CSV needs PlayerName, CourseName, LayoutName and StartDate on every row.');
  const compact=rawDate.match(/^(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2})([+-]\d{2})(\d{2})$/),iso=compact?`${compact[1]}T${compact[2]}:${compact[3]}:00${compact[4]}:${compact[5]}`:rawDate,parsed=new Date(iso);
  if(Number.isNaN(parsed.valueOf()))throw new Error('CSV has an invalid date.');
  const date=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)?iso.slice(0,16):parsed.toISOString().slice(0,16),key=[csvNormalize(course),csvNormalize(layout),date].join('|');
  const blocks=groups.get(key)||[];let g=blocks.at(-1);
  const holeKeys=Object.keys(row).filter(k=>/^hole\s*\d+$/i.test(k)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  if(!holeKeys.length)throw new Error('CSV needs Hole1, Hole2, … columns.');
  const scores=holeKeys.map(k=>{const v=String(row[k]??'').trim();return !v||v==='-'||v==='0'?null:Number(v);});
  if(!g||(/^par$/i.test(name)&&g.pars)){g={course,layout,layoutKey:course+'|'+layout,date,...(compact?{utcDate:parsed.toISOString()}:{}),source:'csv',pars:null,players:[],rawStartDate:rawDate,importedAt:new Date().toISOString()};blocks.push(g);groups.set(key,blocks);}
  if(/^par$/i.test(name)){let end=scores.length;while(end&&scores[end-1]===null)end--;g.pars=scores.slice(0,end);continue;}
  const isTeam=name.includes('+'),username=isTeam?'team:'+csvNormalize(name):get(row,'Username','UDiscUsername').replace(/^@/,'')||lookup.get(csvNormalize(name))||'csv:'+csvNormalize(name),rating=get(row,'RoundRating');
  g.players.push({username,name,scores,isTeam,roundRating:rating?Number(rating):null,csvTotal:get(row,'Total'),csvRelative:get(row,'+/-')});
 }
 const result=[];
 for(const [key,blocks] of groups){const distinct=new Map();
  for(const g of blocks){try{if(!g.pars)throw new Error(`CSV needs a Par row for ${g.course}; pars are never guessed.`);
   g.players=g.players.map(p=>{const scores=p.scores.slice(0,g.pars.length);if(p.scores.slice(g.pars.length).some(s=>s!==null))throw new Error('Player has scores beyond the Par row.');
    const total=scores.reduce((s,n)=>s+(n??0),0),relative=scores.reduce((s,n,i)=>s+(n===null?0:n-g.pars[i]),0);
    if(p.csvTotal!==''&&Number(p.csvTotal)!==total)throw new Error(`CSV total does not match holes for ${p.name} at ${g.course} (${g.date}).`);
    if(p.csvRelative!==''&&Number(p.csvRelative)!==relative)throw new Error(`CSV relative score does not match holes for ${p.name} at ${g.course} (${g.date}).`);
    return {...p,scores};});
   const signature=JSON.stringify([g.pars,g.players.map(p=>[p.username,p.scores]).sort((a,b)=>a[0].localeCompare(b[0]))]);
   const round=validateRound({...g,id:'csv_'+csvHash(key+'|'+signature)});distinct.set(signature,round);
   }catch(e){if(!options.skipInvalid)throw e;result.push({...g,id:'csv_invalid_'+csvHash(key),csvError:e.message});}
  }
  const conflict=distinct.size>1;for(const r of distinct.values())result.push({...r,csvConflict:conflict});
 }
 return result;
}
