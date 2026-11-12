'use client';

import {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle, ArrowUpRight, Building2, Cloud, Gauge, Info,
  Network, Save, ShieldCheck, UsersRound, ContactRound
} from 'lucide-react';
import {apiRequest, patch, post} from '@/lib/client';

type Segment={id:string;name:string;search_term:string;cnae:string|null;active:boolean};
type Provider='cnpjai'|'localiza'|'google'|'exa'|'opencnpj'|'apollo'|'hunter';
type Limit={provider:Provider;operation:'basic'|'branches'|'search'|'text_pro'|'text_enterprise'|'people_search'|'qsa'|'domain_finder'|'domain_search';monthly_limit:number|null;minute_limit:number;enabled:boolean;used:number};

const providerInfo=[
  {id:'cnpjai' as const,name:'CNPJ.ai',subtitle:'Consulta de CNPJ, matrizes e filiais',summary:'Sem cota mensal publicada · 60 chamadas/min por conta, compartilhadas',url:'https://cnpj.ai/api/docs',icon:Network,tag:'Gratuito'},
  {id:'localiza' as const,name:'LocalizaCNPJ',subtitle:'Busca por segmento, CNAE e localização',summary:'Plano Free: 2.000 consultas/mês · 40 chamadas/min',url:'https://localizacnpj.com.br/portal-api',icon:Building2,tag:'Plano Free'},
  {id:'opencnpj' as const,name:'OpenCNPJ',subtitle:'Sócios e administradores identificados pelo CNPJ',summary:'API pública sem chave: até 300 req/min por IP. Teto interno configurado: 3.000/mês e 120/min.',url:'https://opencnpj.com/api',icon:ContactRound,tag:'Gratuito'},
  {id:'exa' as const,name:'Exa People Search',subtitle:'Gestores de RH, benefícios e direção por empresa',summary:'Créditos mensais por valor gasto. Teto interno de 400 consultas/mês e 5/min; configure orçamento também na Exa.',url:'https://exa.ai/pricing',icon:UsersRound,tag:'Créditos gratuitos'},
  {id:'apollo' as const,name:'Apollo',subtitle:'Busca de gestores por empresa e cargo',summary:'People API Search: 0 créditos (sujeito à permissão da chave e elegibilidade). Teto interno: 300/mês e 5/min.',url:'https://docs.apollo.io/reference/people-api-search',icon:UsersRound,tag:'Busca sem créditos'},
  {id:'hunter' as const,name:'Hunter',subtitle:'Localizar domínio e identificar gestores',summary:'Domain Finder é gratuito; Domain Search pode consumir créditos. Teto interno da busca: 40/mês.',url:'https://hunter.io/api-documentation/v2/',icon:ContactRound,tag:'Créditos limitados'},
  {id:'google' as const,name:'Google Places',subtitle:'Pesquisa contextual de estabelecimentos',summary:'Text Search Pro: 5.000/mês; com telefone (Enterprise): 1.000/mês. Os limites por minuto são controles internos.',url:'https://developers.google.com/maps/billing-and-pricing/pricing',icon:Cloud,tag:'Pro + Enterprise'},
];
const operationName:Record<Limit['operation'],string>={basic:'Consulta básica',branches:'Matrizes e filiais',search:'Pesquisa de empresas',text_pro:'Pesquisa por texto (sem telefone)',text_enterprise:'Pesquisa contextual com telefone',people_search:'Pesquisa de gestores',qsa:'Sócios e administradores (QSA)',domain_finder:'Descoberta de domínio',domain_search:'Busca de gestores por domínio'};
const formatNumber=(value:number)=>value.toLocaleString('pt-BR');
const keyOf=(l:Limit)=>`${l.provider}:${l.operation}`;
function equalLimit(a:Limit,b:Limit){return a.monthly_limit===b.monthly_limit && a.minute_limit===b.minute_limit && a.enabled===b.enabled;}

export default function Configuracoes(){
  const [segments,setSegments]=useState<Segment[]>([]);
  const [segName,setSegName]=useState('');
  const [segTerm,setSegTerm]=useState('');
  const [segCnae,setSegCnae]=useState('');
  const [rows,setRows]=useState<Limit[]>([]);
  const [saved,setSaved]=useState<Record<string,Limit>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState('');

  useEffect(()=>{
    apiRequest<{limits:Limit[]}>('/api/limits')
      .then(d=>{setRows(d.limits);setSaved(Object.fromEntries(d.limits.map(l=>[keyOf(l),l])));})
      .catch((e:Error)=>setError(e.message))
      .finally(()=>setLoading(false));
    refreshSegments();
  },[]);

  const groups=useMemo(()=>providerInfo.map(info=>({info,items:rows.map((row,index)=>({row,index})).filter(({row})=>row.provider===info.id)})),[rows]);
  const dirtyCount=rows.filter(l=>saved[keyOf(l)]&&!equalLimit(l,saved[keyOf(l)])).length;

  function refreshSegments(){apiRequest<{segments:Segment[]}>('/api/segments').then(d=>setSegments(d.segments)).catch((e:Error)=>setError(e.message));}
  async function createSegment(e:React.FormEvent){
    e.preventDefault();setError('');setMessage('');
    try{await post('/api/segments',{name:segName,searchTerm:segTerm,cnae:segCnae||null});setSegName('');setSegTerm('');setSegCnae('');setMessage('Segmento cadastrado.');refreshSegments();}
    catch(e){setError((e as Error).message);}
  }
  async function removeSegment(id:string){
    if(!window.confirm('Excluir este segmento da lista?'))return;
    setError('');setMessage('');
    try{await apiRequest('/api/segments?id='+encodeURIComponent(id),{method:'DELETE'});refreshSegments();}
    catch(e){setError((e as Error).message);}
  }
  async function toggleSegment(s:Segment){
    setError('');setMessage('');
    try{await patch('/api/segments',{id:s.id,active:!s.active});refreshSegments();}
    catch(e){setError((e as Error).message);}
  }
  function update(index:number,changes:Partial<Limit>){setRows(prev=>prev.map((l,i)=>i===index?{...l,...changes}:l));}
  async function save(l:Limit){
    const id=keyOf(l);
    setSaving(id);setError('');setMessage('');
    try{
      await patch('/api/limits',{provider:l.provider,operation:l.operation,monthlyLimit:l.monthly_limit,minuteLimit:l.minute_limit,enabled:l.enabled});
      setSaved(prev=>({...prev,[id]:{...l}}));
      setMessage(`Configuração de ${providerInfo.find(p=>p.id===l.provider)?.name} (${operationName[l.operation]}) salva.`);
    }catch(e){setError((e as Error).message);}
    finally{setSaving('');}
  }

  return <>
    <div className="page-head"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Configurações</h1><p>Gerencie os limites, integrações e categorias de pesquisa.</p></div></div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {message&&<div className="alert success" role="status">{message}</div>}

    <section className="quota-section" aria-labelledby="quota-heading">
      <div className="quota-section-title">
        <div className="quota-heading-icon"><Gauge size={20}/></div>
        <div><h2 id="quota-heading">Controle de cotas</h2><p>Limites internos de segurança. Cada alteração é aplicada somente ao clicar em Salvar.</p></div>
        <span className="quota-dirty" aria-live="polite">{dirtyCount ? `${dirtyCount} alteração(ões) pendente(s)` : 'Configurações sincronizadas'}</span>
      </div>
      <div className="quota-callout"><Info size={17}/><p><strong>Dados oficiais e limites internos são diferentes.</strong> Os valores abaixo foram definidos conforme os planos gratuitos publicados. A franquia do Google é um limite de gratuidade, não um bloqueio automático de cobrança. Confira as cotas e o faturamento no Google Cloud.</p></div>
      {loading&&<div className="panel" role="status">Carregando limites de consumo...</div>}
      {!loading&&groups.map(({info,items})=>{
        const Icon=info.icon;
        return <div className="quota-provider" key={info.id}>
          <div className="quota-provider-header">
            <span className={`quota-provider-icon quota-provider-icon-${info.id}`}><Icon size={21}/></span>
            <div className="quota-provider-heading"><div className="quota-provider-name"><h3>{info.name}</h3><span className="badge gray">{info.tag}</span></div><p>{info.subtitle}</p></div>
            <a className="quota-doc-link" href={info.url} target="_blank" rel="noopener noreferrer">Documentação <ArrowUpRight size={15}/></a>
          </div>
          <div className="quota-official"><ShieldCheck size={15}/><span><strong>Referência do fornecedor:</strong> {info.summary}</span></div>
          {items.map(({row:l,index})=>{
            const id=keyOf(l);
            const changed=!!saved[id]&&!equalLimit(l,saved[id]);
            const hasMonthly=l.monthly_limit!==null;
            const pct=hasMonthly&&l.monthly_limit!==null?(l.monthly_limit>0?Math.min(100,l.used/l.monthly_limit*100):100):0;
            const invalid=l.minute_limit<1||l.minute_limit>10000||(hasMonthly&&(l.monthly_limit===null||l.monthly_limit>1000000||l.monthly_limit<0));
            return <div key={id} className="quota-operation">
              <div className="quota-operation-info">
                <div className="quota-operation-name"><strong>{operationName[l.operation]}</strong>{changed&&<span className="quota-unsaved">Não salvo</span>}</div>
                <p>{formatNumber(l.used)} requisições neste mês · {l.enabled?'Ativada no sistema':'Desativada'}</p>
                {hasMonthly&&l.monthly_limit!==null?<div className="quota-progress" role="progressbar" aria-valuenow={l.used} aria-valuemin={0} aria-valuemax={Math.max(l.monthly_limit,l.used,1)} aria-label={`Consumo mensal de ${info.name} — ${operationName[l.operation]}`}><span style={{width:`${pct}%`}} className={pct>=80?'warning':''}/></div>:<p className="quota-no-cap">Sem teto mensal configurado</p>}
              </div>
              <div className="quota-controls">
                <div className="quota-month-control">
                  <label htmlFor={`${id}-month`}>Máximo/mês</label>
                  <input id={`${id}-month`} type="number" min={0} max={1000000} value={l.monthly_limit??''} placeholder="Sem limite" disabled={!hasMonthly} onChange={e=>update(index,{monthly_limit:e.target.value===''?0:Number(e.target.value)})}/>
                  {l.provider==='cnpjai'&&<label className="quota-no-limit"><input type="checkbox" checked={!hasMonthly} onChange={e=>update(index,{monthly_limit:e.target.checked?null:1000})}/> Sem teto mensal</label>}
                </div>
                <div className="quota-minute-control"><label htmlFor={`${id}-minute`}>Máximo/min</label><input id={`${id}-minute`} type="number" min={1} max={10000} value={l.minute_limit} onChange={e=>update(index,{minute_limit:e.target.value===''?0:Number(e.target.value)})}/></div>
                <div className="quota-enabled-control"><label htmlFor={`${id}-enabled`}>Habilitada</label><input id={`${id}-enabled`} type="checkbox" role="switch" className="switch" checked={l.enabled} onChange={e=>update(index,{enabled:e.target.checked})}/></div>
                <button className="btn primary quota-save" type="button" disabled={!changed||!!saving||invalid} onClick={()=>save(l)}><Save size={15}/>{saving===id?'Salvando...':'Salvar'}</button>
              </div>
            </div>;
          })}
        </div>;
      })}
    </section>

    <section className="panel section-space"><h2 className="panel-title">Segmentos disponíveis na pesquisa</h2><p className="panel-subtitle">Categorias de acesso rápido com termos e CNAEs.</p><form onSubmit={createSegment}><div className="fields-grid"><label>Categoria<input value={segName} onChange={e=>setSegName(e.target.value)} required placeholder="Educação"/></label><label>Termo de busca<input value={segTerm} onChange={e=>setSegTerm(e.target.value)} required placeholder="educação"/></label><label>CNAE (opcional)<input maxLength={7} value={segCnae} onChange={e=>setSegCnae(e.target.value.replace(/\D/g,''))} placeholder="4711302"/></label></div><div className="form-foot"><button type="submit" className="btn primary"><Save size={14}/>Adicionar segmento</button></div></form><div className="table-wrapper section-space"><table className="data-table"><thead><tr><th>Categoria</th><th>Termo</th><th>CNAE</th><th>Status</th><th>Ação</th></tr></thead><tbody>{segments.map(s=><tr key={s.id}><td>{s.name}</td><td>{s.search_term}</td><td>{s.cnae||'—'}</td><td>{s.active?'Ativo':'Inativo'}</td><td><div className="result-actions"><button className="btn small outline" onClick={()=>toggleSegment(s)}>{s.active?'Desativar':'Ativar'}</button><button className="btn small danger" onClick={()=>removeSegment(s.id)}>Excluir</button></div></td></tr>)}</tbody></table></div></section>
    <section className="panel section-space"><h2 className="panel-title">Configuração das credenciais</h2><p className="panel-subtitle">Por segurança, chaves de API não são exibidas nem alteradas pelo navegador.</p><div className="alert"><AlertTriangle size={15} style={{verticalAlign:'middle',marginRight:8}}/>Cadastre DATABASE_URL, CNPJ_AI_API_KEY, LOCALIZACNPJ_API_KEY, GOOGLE_PLACES_API_KEY EXA_API_KEY, APOLLO_API_KEY e HUNTER_API_KEY nas variáveis de ambiente. O OpenCNPJ não exige chave. Consulte o README para as etapas de deploy.</div></section>
  </>;
}
