'use client';

import {useEffect,useMemo,useState} from 'react';
import {mergeLoaded,pageSlice,canAdvance,RESULTS_PER_PAGE} from '@/lib/pagination';
import {useAutomaticPeople} from '@/hooks/useAutomaticPeople';
import Link from 'next/link';
import {Search,MapPin,Building2,Phone,Mail,Plus,ArrowRight,Info,AlertTriangle,LoaderCircle,CheckCircle2,ExternalLink,ShieldCheck,UsersRound,FileDown,ChevronLeft,ChevronRight} from 'lucide-react';
import {apiRequest,post,formatCnpj} from '@/lib/client';
import type {CompanyResult,PlaceResult} from '@/services/providers';
import type {DecisionMaker} from '@/lib/people';

type Query={cnpj:string;name:string;segment:string;cnae:string;city:string;state:string;district:string;activeOnly:boolean;branches:'all'|'headquarters'|'branches';pageSize:number;cursor?:string};
type Status={service:'cnpjai'|'localiza'|'google';state:'ok'|'error'|'skipped';message?:string};
type SearchResult={items:CompanyResult[];places:PlaceResult[];nextCursor:string|null;partial:boolean;phoneCount:number;sourceStatus:Status[]};
type Segment={id:string;name:string;search_term:string;cnae:string|null;active:boolean};
const empty:Query={cnpj:'',name:'',segment:'',cnae:'',city:'',state:'',district:'',activeOnly:true,branches:'all',pageSize:RESULTS_PER_PAGE};
const statusName:Record<Status['service'],string>={cnpjai:'CNPJ.ai',localiza:'LocalizaCNPJ',google:'Google Places'};
const normalizePhone=(s:string)=>s.replace(/[^\d+]/g,'');

export default function Pesquisa(){
 const [segments,setSegments]=useState<Segment[]>([]);
 const [query,setQuery]=useState<Query>({...empty});
 const [result,setResult]=useState<SearchResult|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [saved,setSaved]=useState<string[]>([]);
 const [saving,setSaving]=useState('');
 const [lastQuery,setLastQuery]=useState<Query|null>(null);
 const [pageNumber,setPageNumber]=useState(1);
 const [preferPhone,setPreferPhone]=useState(true);
 const [searchVersion,setSearchVersion]=useState(0);
 const companies=useMemo(()=>result?.items??[],[result]);
 const pageCompanies=useMemo(()=>{
  const items=pageSlice(companies,pageNumber);
  return preferPhone?[...items].sort((a,b)=>Number(!!b.phone)-Number(!!a.phone)):items;
 },[companies,pageNumber,preferPhone]);
 const {byRoot:peopleByRoot,queuedCount}=useAutomaticPeople(pageCompanies,searchVersion);
 const [exporting,setExporting]=useState(false);
 useEffect(()=>{apiRequest<{segments:Segment[]}>('/api/segments').then(d=>setSegments(d.segments.filter(x=>x.active))).catch(()=>{});},[]);
 const set=(name:keyof Query,value:string|boolean)=>setQuery(prev=>({...prev,[name]:value}));
 async function run(){
  if(loading)return;
  const payload={...query,pageSize:RESULTS_PER_PAGE};
  setLoading(true);setError('');
  try{
   const data=await post('/api/search',payload) as SearchResult;
   setSearchVersion(v=>v+1);setResult({...data,items:mergeLoaded([],data.items)});
   setLastQuery(payload);setPageNumber(1);setSaved([]);
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 async function nextPage(){
  if(!result||loading)return;
  const target=pageNumber+1;
  if(result.items.length>(target-1)*RESULTS_PER_PAGE){setPageNumber(target);return;}
  if(!lastQuery||!result.nextCursor)return;
  setLoading(true);setError('');
  let records=[...result.items];
  let cursor:string|null=result.nextCursor;
  let statuses=[...result.sourceStatus];
  const visited=new Set<string>();
  try{
   // Algumas páginas dos fornecedores podem conter somente CNPJs repetidos ou
   // registros removidos pelos filtros locais. Continue até completar 10.
   let scanned=0;
   while(records.length<target*RESULTS_PER_PAGE-RESULTS_PER_PAGE+1&&cursor&&scanned<8){
    if(visited.has(cursor))throw new Error('Cursor repetido. Reinicie a pesquisa para continuar.');
    visited.add(cursor);
    const data=await post('/api/search',{...lastQuery,cursor,pageSize:RESULTS_PER_PAGE}) as SearchResult;
    records=mergeLoaded(records,data.items);
    cursor=data.nextCursor;
    statuses.push(...data.sourceStatus.filter(s=>s.state==='error'));
    scanned++;
   }
   setResult({...result,items:records,nextCursor:cursor,partial:!!cursor,
      sourceStatus:statuses,phoneCount:records.filter(x=>!!x.phone).length});
   if(records.length>(target-1)*RESULTS_PER_PAGE)setPageNumber(target);
   else if(cursor)setError('As próximas páginas não trouxeram novos registros. Tente avançar novamente ou refine os filtros.');
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 async function exportXlsx(){
  if(!companies.length)return;
  setExporting(true);setError('');
  try{
   const people=companies.flatMap(company=>(peopleByRoot[company.cnpjRoot]?.result?.people||[]).map(person=>({cnpj:company.cnpj,...person})));
   const response=await fetch('/api/export/xlsx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companies,people})});
   if(!response.ok){const data=await response.json().catch(()=>({error:'Não foi possível exportar o arquivo.'}));throw new Error(data.error||'Falha na exportação XLSX');}
   const blob=await response.blob();
   const url=URL.createObjectURL(blob);
   const anchor=document.createElement('a');anchor.href=url;anchor.download='prospect-resultados.xlsx';document.body.appendChild(anchor);anchor.click();anchor.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError((e as Error).message);}
  finally{setExporting(false);}
 }
 async function save(item:CompanyResult){
  setSaving(item.cnpj);setError('');
  try{await post('/api/leads',{company:item,notes:''});setSaved(arr=>[...arr,item.cnpj]);}
  catch(e){setError((e as Error).message);}finally{setSaving('');}
 }
 const failures=Array.from(new Map(result?.sourceStatus.filter(s=>s.state==='error').map(s=>[s.service,s])||[]).values());
 const phones=result?.items.filter(x=>!!x.phone).length||0;
 const loaded=companies.length;
 const failedSources=Array.from(new Map(result?.sourceStatus.filter(s=>s.state==='error').map(s=>[s.service,s])||[]).values());
 const totalIsExact=!!result&&!result.nextCursor&&!failedSources.length;
 const firstShown=(pageNumber-1)*RESULTS_PER_PAGE+1;
 const lastShown=Math.min(pageNumber*RESULTS_PER_PAGE,loaded);
 return <>
  <div className="page-head"><div><span className="eyebrow">PESQUISA EMPRESARIAL</span><h1>Encontrar empresas</h1><p>Pesquise pelo dado que você conhece. Os registros são complementados automaticamente.</p></div><Link href="/leads" className="btn outline"><Building2 size={16}/>Meus leads</Link></div>
  <section className="panel prospect-search-panel">
   <div className="prospect-search-heading"><div><h2 className="panel-title">O que você está procurando?</h2><p className="panel-subtitle">Preencha um ou mais campos. CNPJ pode ser completo ou apenas a raiz de 8 caracteres.</p></div><Search size={21} aria-hidden="true"/></div>
   <form onSubmit={e=>{e.preventDefault();void run();}}>
    <div className="prospect-filter-grid">
     <label className="prospect-filter-wide">CNPJ ou raiz<input value={query.cnpj} onChange={e=>set('cnpj',e.target.value)} placeholder="Ex.: 03.187.913 ou 03.187.913/0001-00" autoComplete="off"/></label>
     <label>Setor empresarial<select value="" onChange={e=>{const segment=segments.find(x=>x.id===e.target.value);if(segment)setQuery(q=>({...q,segment:segment.search_term,cnae:segment.cnae||''}));}}><option value="">Selecionar setor</option>{segments.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <label>Nome da empresa<input value={query.name} onChange={e=>set('name',e.target.value)} placeholder="Razão social ou nome fantasia"/></label>
     <label>Atividade ou setor<input value={query.segment} onChange={e=>set('segment',e.target.value)} placeholder="Ex.: educação, indústria, logística"/></label>
     <label>CNAE<input value={query.cnae} onChange={e=>set('cnae',e.target.value.replace(/\D/g,'').slice(0,7))} placeholder="Ex.: 4711302"/></label>
     <label>Cidade<input value={query.city} onChange={e=>set('city',e.target.value)} placeholder="Fortaleza"/></label>
     <label>UF<input value={query.state} onChange={e=>set('state',e.target.value.toUpperCase().slice(0,2))} placeholder="CE" maxLength={2}/></label>
     <label>Bairro<input value={query.district} onChange={e=>set('district',e.target.value)} placeholder="Aldeota"/></label>
     <label>Estabelecimentos<select value={query.branches} onChange={e=>setQuery(q=>({...q,branches:e.target.value as Query['branches']}))}><option value="all">Matriz e filiais</option><option value="headquarters">Somente matrizes</option><option value="branches">Somente filiais</option></select></label>
    </div>
    <div className="prospect-search-actions">
      <div className="prospect-filter-options">
        <label><input type="checkbox" checked={query.activeOnly} onChange={e=>set('activeOnly',e.target.checked)}/>Apenas empresas ativas</label>
        <label><input type="checkbox" checked={preferPhone} onChange={e=>setPreferPhone(e.target.checked)}/>Priorizar com telefone</label>
      </div>
      <div className="result-actions"><button type="button" className="btn" disabled={loading} onClick={()=>{setQuery({...empty});setResult(null);setLastQuery(null);setPageNumber(1);setSearchVersion(v=>v+1);setError('');}}>Limpar</button><button className="btn primary" disabled={loading} type="submit">{loading?<LoaderCircle size={16} className="prospect-spin"/>:<Search size={16}/>} {loading?'Consultando...':'Pesquisar empresas'}<ArrowRight size={15}/></button></div>
    </div>
   </form>
   <div className="prospect-privacy-note"><ShieldCheck size={16}/><span>Contatos para o CRM vêm de fontes cadastrais. Informações do Google Maps, quando exibidas, são apenas para consulta pontual e não são armazenadas ou exportadas.</span></div>
  </section>

  {error&&<div className="alert error section-space" role="alert"><AlertTriangle size={16}/> {error}</div>}
  {result&&<section className="section-space" aria-live="polite">
   <div className="prospect-result-overview">
    <div><span className="eyebrow">RESULTADOS</span><h2>{totalIsExact?`${loaded.toLocaleString('pt-BR')} empresas encontradas`:`Pelo menos ${loaded.toLocaleString('pt-BR')} empresas encontradas`}</h2><p>{totalIsExact?'Total confirmado após percorrer os resultados.':'Ainda há resultados a consultar ou fontes indisponíveis; o total exato não está disponível.'} {phones.toLocaleString('pt-BR')} com telefone identificado.</p></div>
    <div className="prospect-overview-metrics"><span><Phone size={17}/><strong>{phones}</strong> com telefone</span><span><Building2 size={17}/><strong>{result.items.length}</strong> empresas</span>{queuedCount>0&&<span><UsersRound size={16}/><strong>{queuedCount}</strong> aguardando gestores</span>}</div>
    <button className="btn primary" type="button" disabled={exporting||!result.items.length} onClick={exportXlsx}><FileDown size={16}/>{exporting?'Gerando XLSX...':'Exportar XLSX'}</button>
   </div>
   {failures.length>0&&<div className="alert section-space" role="status"><AlertTriangle size={15}/> Algumas consultas não foram concluídas: {failures.map(f=>`${statusName[f.service]} — ${f.message||'indisponível'}`).join(' • ')}. Os resultados obtidos permanecem disponíveis.</div>}
   {!result.items.length&&<div className="panel empty section-space"><Search size={30}/><h3>Nenhuma empresa nesta página</h3><p>{result.nextCursor?'Há mais páginas disponíveis; avance para continuar.':'Tente ampliar a cidade, alterar o CNAE ou pesquisar a raiz do CNPJ.'}</p></div>}
   {pageCompanies.length>0&&<div className="card-stack section-space">{pageCompanies.map(item=><article key={item.cnpj} className="result-card prospect-result-card"><div className="prospect-company-info"><div className="prospect-company-top"><h3>{item.tradeName||item.legalName}</h3><span className="badge gray">{item.isHeadquarters===true?'Matriz':item.isHeadquarters===false?'Filial':'Estabelecimento'}</span></div>{item.tradeName&&item.tradeName!==item.legalName&&<p>{item.legalName}</p>}
    <div className="result-meta"><span><Building2 size={14}/>{formatCnpj(item.cnpj)}</span><span><MapPin size={14}/>{[item.city,item.state].filter(Boolean).join(' / ')||'Localização não informada'}</span></div>
    <div className="prospect-contact-grid"><div className={`prospect-contact ${item.phone?'has-phone':''}`}><Phone size={16}/><div><small>TELEFONE</small>{item.phone?<a href={`tel:${normalizePhone(item.phone)}`}>{item.phone}</a>:<span>Não informado</span>}</div></div><div className="prospect-contact"><Mail size={16}/><div><small>E-MAIL</small>{item.email?<a href={`mailto:${item.email}`}>{item.email}</a>:<span>Não informado</span>}</div></div></div>
    {item.address&&<p className="prospect-address">{item.address}</p>}
    <div className="prospect-managers">
     <div className="prospect-managers-head"><UsersRound size={17}/><strong>Gestores e decisores</strong><span className="muted-small">RH, Benefícios, Diretoria e sócios-administradores</span></div>
     {peopleByRoot[item.cnpjRoot]?.state==='loading'||!peopleByRoot[item.cnpjRoot]?
      <p className="prospect-people-loading"><LoaderCircle size={15} className="prospect-spin"/> Pesquisando gestores automaticamente...</p>:
      peopleByRoot[item.cnpjRoot]?.state==='error'?
       <p className="prospect-manager-error" role="status">{peopleByRoot[item.cnpjRoot]?.error||'Não foi possível consultar os gestores.'}</p>:
      (peopleByRoot[item.cnpjRoot]?.result?.people.length||0)>0?
       <div className="prospect-person-list">{peopleByRoot[item.cnpjRoot]?.result?.people.map((person,i)=><div className="prospect-person" key={person.source+person.name+i}>
        <span className="prospect-person-avatar"><UsersRound size={15}/></span><div><strong>{person.name}{person.partialName?' (parcial)':''}</strong><small>{person.role}</small><small>{({exa:'Perfil profissional · Exa',opencnpj:'Quadro societário · OpenCNPJ',apollo:'Perfil profissional · Apollo',hunter:'Contato profissional · Hunter'} as const)[person.source]}</small></div>
       </div>)}</div>:
       <p className="muted-small" style={{marginTop:10}}>Nenhum gestor identificado com correspondência confiável para esta empresa.</p>}
     {peopleByRoot[item.cnpjRoot]?.result?.statuses.filter(s=>s.state==='error').map(s=><p className="prospect-manager-error" key={s.provider}>{({exa:'Exa',opencnpj:'OpenCNPJ',apollo:'Apollo',hunter:'Hunter'} as const)[s.provider]}: {s.message}</p>)}
     <p className="prospect-manager-note">Busca automática com OpenCNPJ, Exa, Apollo e Hunter. Consultas Hunter podem consumir créditos, dentro dos limites configurados.</p>
    </div>
    </div><div className="result-actions"><button className="btn small primary" disabled={saved.includes(item.cnpj)||saving===item.cnpj} onClick={()=>save(item)}>{saved.includes(item.cnpj)?<CheckCircle2 size={15}/>:<Plus size={15}/>} {saved.includes(item.cnpj)?'Lead salvo':saving===item.cnpj?'Salvando...':'Salvar lead'}</button></div>
   </article>)}</div>}
   {(loaded>0||!!result.nextCursor)&&<nav className="prospect-pagination" aria-label="Navegação dos resultados">
    <span className="muted-small">Exibindo {loaded?firstShown.toLocaleString('pt-BR'):'0'}–{lastShown.toLocaleString('pt-BR')} de {loaded.toLocaleString('pt-BR')} carregados{result.nextCursor?' (há mais páginas)':''}</span>
    <div className="prospect-pagination-controls">
     <button type="button" className="btn small outline" disabled={loading||pageNumber<=1} onClick={()=>setPageNumber(n=>Math.max(1,n-1))}><ChevronLeft size={15}/> Anterior</button>
     <span className="prospect-page-number" aria-current="page">Página {pageNumber}</span>
     <button type="button" className="btn small outline" disabled={loading||!canAdvance(loaded,pageNumber,!!result.nextCursor)} onClick={()=>void nextPage()}>{loading?'Carregando...':'Próxima'} <ChevronRight size={15}/></button>
    </div>
   </nav>}

   {result.places.length>0&&<section className="panel section-space" aria-labelledby="places-title"><div className="split-between"><div><h2 className="panel-title" id="places-title">Consulta contextual no Google Maps</h2><p className="panel-subtitle">Informações em tempo real para conferência individual; não entram nos leads nem na exportação.</p></div><span className="badge">© Google Maps</span></div><div className="prospect-places-grid">{result.places.map(p=><div className="prospect-place" key={p.id}><strong>{p.name}</strong><p>{p.address||'Endereço não informado'}</p><div className="prospect-place-footer"><span><Phone size={14}/>{p.phone||'Telefone não informado'}</span><a href={p.mapsUrl||`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${p.name} no Google Maps`}>Abrir Maps <ExternalLink size={13}/></a></div></div>)}</div><p className="muted-small" style={{marginTop:12}}>O Google não disponibiliza CNPJ ou e-mail e pode não informar telefone. Exibir telefones requer a modalidade Enterprise da Places API.</p></section>}
   {result.sourceStatus.some(s=>s.service==='google'&&s.state==='skipped')&&<div className="prospect-subtle-note"><Info size={15}/> Para consultar o Google Maps, informe também o nome ou segmento da empresa.</div>}
  </section>}
 </>;
}
