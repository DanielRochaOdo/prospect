import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExaPeopleQuery,isHrOrDpRole,needsDecisionMakerFallback} from '../src/lib/people-priority.ts';
import {mapExaPeople,mapApolloPeople,mergeDecisionMakers} from '../src/lib/people.ts';

const person=(name,role,partialName=false)=>({name,role,partialName});

test('busca primária Exa cobre RH, DP, benefícios e empregador atual',()=>{
 const query=buildExaPeopleQuery('Acme Serviços Ltda','Acme');
 for(const term of ['Acme Serviços Ltda','Acme','RH','departamento pessoal','benefícios'])
  assert.ok(query.toLowerCase().includes(term.toLowerCase()),term);
});
test('fallback só é dispensado com dois nomes completos distintos de RH/DP',()=>{
 assert.equal(needsDecisionMakerFallback([]),true);
 assert.equal(needsDecisionMakerFallback([person('Maria Souza','Gerente de RH')]),true);
 assert.equal(needsDecisionMakerFallback([person('Maria Souza','Gerente de RH'),person('Maria Souza','Analista de Departamento Pessoal')]),true);
 assert.equal(needsDecisionMakerFallback([person('Maria Souza','Gerente de RH'),person('Ana Lima','Analista de Departamento Pessoal')]),false);
 assert.equal(needsDecisionMakerFallback([person('Maria Souza','Gerente de RH'),person('Ana Li***a','Analista de DP',true)]),true);
 assert.equal(needsDecisionMakerFallback([person('Maria Souza','Diretora Administrativa'),person('Ana Lima','Sócia Administradora')]),true);
 assert.equal(isHrOrDpRole('Especialista em Benefícios'),true);
 assert.equal(isHrOrDpRole('Assistente de DP'),true);
 assert.equal(isHrOrDpRole('Diretor Financeiro'),false);
});
test('Exa exibe analistas de DP e responsáveis por benefícios com vínculo demonstrado',()=>{
 const data={results:[
  {title:'Ana Silva',text:'Analista de Departamento Pessoal na ACME Serviços Ltda. Atualmente trabalha na área.'},
  {title:'Bruna Lima',text:'Responsável por Benefícios na ACME Serviços Ltda.'},
  {title:'Carla Souza',text:'Analista de DP na Outra Empresa Ltda.'},
  {title:'Daniel Alves',text:'Former Coordenador de RH na ACME Serviços Ltda.'}
 ]};
 const found=mapExaPeople(data,'ACME Serviços Ltda');
 assert.deepEqual(found.map(x=>x.name),['Ana Silva','Bruna Lima']);
 assert.equal(found.every(x=>x.source==='exa'&&!x.partialName),true);
 assert.equal(found.every(x=>x.email===undefined),true);
});
test('Apollo fornece nome parcial, sem descartar cargo nem exigir e-mail',()=>{
 const response={people:[{first_name:'Ana',last_name_obfuscated:'Si***a',title:'Coordenadora de DP',organization:{name:'ACME Serviços'}}]};
 const found=mapApolloPeople(response,'ACME Serviços Ltda');
 assert.equal(found.length,1);
 assert.equal(found[0].partialName,true);
 assert.equal(found[0].role,'Coordenadora de DP');
});
test('Exa ganha empate de RH por fonte e gera lista única por nome',()=>{
 const input=[
  {name:'Ana Silva',role:'Analista de RH',organization:'ACME',source:'apollo',partialName:false},
  {name:'Ana Silva',role:'Analista de RH',organization:'ACME',source:'exa',partialName:false},
  {name:'Bruna Lima',role:'Gerente de RH',organization:'ACME',source:'hunter',partialName:false},
  {name:'Pedro Souza',role:'Sócio-Administrador',organization:'ACME',source:'opencnpj',partialName:false}
 ];
 const found=mergeDecisionMakers(input);
 assert.equal(found.length,3);
 assert.equal(found.find(p=>p.name==='Ana Silva').source,'exa');
 assert.equal(found[0].name,'Bruna Lima');
});
