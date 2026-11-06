import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Fairway Friends — Your crew. Every throw.',description:'The scoreboard for your disc golf crew. UDisc rounds, head-to-head rivalries, and PDGA player profiles.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
