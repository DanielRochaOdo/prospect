import type {Metadata} from 'next';
import './globals.css';

export const metadata:Metadata={title:'Prospect Odontoart',description:'Plataforma de inteligência comercial e prospecção B2B'};

// Aplicar preferência antes do primeiro render para evitar mudança perceptível de cores.
const initialThemeScript = `(function(){try{var saved=localStorage.getItem('prospect-odontoart-theme');var theme=(saved==='light'||saved==='dark')?saved:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="pt-BR" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{__html:initialThemeScript}}/></head>
    <body>{children}</body>
  </html>;
}
