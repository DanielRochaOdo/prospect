import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:'Prospect Odontoart',description:'Plataforma de inteligência comercial e prospecção B2B'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}
