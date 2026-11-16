'use client';

import {useMemo, useState} from 'react';
import {Check, ChevronDown, X} from 'lucide-react';

export type SelectOption={value:string;label:string};
export function SearchableMultiSelect({label,options,value,onChange,placeholder='Pesquisar opções',disabled=false}: {
 label:string;options:SelectOption[];value:string[];onChange:(value:string[])=>void;placeholder?:string;disabled?:boolean;
}){
 const [term,setTerm]=useState('');
 const [open,setOpen]=useState(false);
 const filtered=useMemo(()=>options.filter(x=>x.label.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))).slice(0,100),[options,term]);
 const chosen=options.filter(x=>value.includes(x.value));
 function toggle(option:string){onChange(value.includes(option)?value.filter(x=>x!==option):[...value,option]);}
 return <div className="searchable-select">
  <span className="searchable-select-label">{label}</span>
  <button type="button" className="searchable-select-trigger" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(x=>!x)}>
   <span>{value.length?`${value.length} selecionado${value.length===1?'':'s'}`:'Selecionar opções'}</span><ChevronDown size={15}/>
  </button>
  {chosen.length>0&&<div className="searchable-select-chips">{chosen.map(x=><span key={x.value}>{x.label}<button type="button" aria-label={`Remover ${x.label}`} onClick={()=>toggle(x.value)}><X size={12}/></button></span>)}</div>}
  {open&&<div className="searchable-select-menu">
   <input aria-label={`Pesquisar ${label}`} value={term} onChange={e=>setTerm(e.target.value)} placeholder={placeholder} autoFocus/>
   <div className="searchable-select-options">{filtered.length?filtered.map(option=><button type="button" key={option.value} onClick={()=>toggle(option.value)} className={value.includes(option.value)?'selected':''}><span>{option.label}</span>{value.includes(option.value)&&<Check size={14}/>}</button>):<small>Nenhuma opção encontrada.</small>}</div>
   <button type="button" className="searchable-select-done" onClick={()=>setOpen(false)}>Concluir</button>
  </div>}
 </div>;
}
