import {validateCardUrl,parseScorecard} from './disc.mjs';
export async function fetchRound(input,fetcher=fetch){
 const url=validateCardUrl(input);let response;
 try{response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html'}});}catch{throw new Error('UDisc is not reachable from this server right now. Try a CSV export or retry later.');}
 if(!response.ok)throw new Error(`UDisc could not provide this scorecard (${response.status}). Try a CSV export.`);
 if(!response.headers.get('content-type')?.includes('text/html'))throw new Error('UDisc did not return a scorecard page.');
 const reader=response.body?.getReader();if(!reader)throw new Error('The scorecard was empty.');let html='',size=0;const decoder=new TextDecoder();
 while(true){let chunk;try{chunk=await reader.read();}catch{throw new Error('UDisc interrupted the scorecard download. Try a CSV export or retry later.');}if(chunk.done)break;size+=chunk.value.length;if(size>2000000){await reader.cancel();throw new Error('Scorecard page is too large. Try CSV instead.');}html+=decoder.decode(chunk.value,{stream:true});}html+=decoder.decode();return parseScorecard(html,url);
}
