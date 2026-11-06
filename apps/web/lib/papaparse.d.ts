declare module 'papaparse' {
 export interface ParseResult<T> {data:T[];errors:{type:string;code:string;message:string;row?:number}[];meta:Record<string,unknown>}
 const Papa:{parse<T=Record<string,string>>(text:string,options:{header?:boolean;skipEmptyLines?:boolean|'greedy'}):ParseResult<T>};
 export default Papa;
}
