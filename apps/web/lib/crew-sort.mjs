const ascendingFirst=new Set(['name','averageRelative','best','pdgaNumber']);
export function nextCrewSort(current,column){return {column,direction:current.column===column?(current.direction==='asc'?'desc':'asc'):(ascendingFirst.has(column)?'asc':'desc')};}
export function sortCrewStats(stats,players,column,direction){
 const sorted=[...stats];if(!column)return sorted;
 const profiles=new Map(players.map(p=>[p.username,p])),names=new Intl.Collator('en-US',{numeric:true,sensitivity:'base'}),sign=direction==='desc'?-1:1;
 const value=s=>{if(column==='pdgaNumber'){const number=Number(profiles.get(s.username)?.pdgaNumber);return number>0&&Number.isFinite(number)?number:null;}return s[column]??null;};
 return sorted.sort((a,b)=>{const x=value(a),y=value(b);if(x===null&&y!==null)return 1;if(y===null&&x!==null)return -1;const compared=x===null?0:column==='name'?names.compare(String(x),String(y)):Number(x)-Number(y);return sign*compared||names.compare(a.name,b.name)||a.username.localeCompare(b.username);});
}
