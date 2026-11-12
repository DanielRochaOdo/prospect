import test from 'node:test';import assert from 'node:assert/strict';
import {organizationMatches,validDomain,mapApolloPeople,mapHunterPeople,mergeDecisionMakers} from '../src/lib/people.ts';
import {buildXlsx} from '../src/lib/xlsx.ts';
test('associação de organização evita correspondência ambígua',()=>{
 assert.equal(organizationMatches('Acme Serviços Ltda','Acme'),true);
 assert.equal(organizationMatches('Acme Serviços Ltda','Empresa Soluções'),false);
 assert.equal(organizationMatches('Transportes Alfa S/A','Alfa Transportes'),true);
 assert.equal(validDomain('https://www.acme.com.br/sobre'),'acme.com.br');
 assert.equal(validDomain('localhost'),null);
});
test('Apollo preserva sobrenome mascarado e apenas empresa correta',()=>{
 const data={people:[{first_name:'Maria',last_name_obfuscated:'Si***a',title:'Gerente de Recursos Humanos',organization:{name:'Acme'}},{first_name:'Joana',title:'Gerente',organization:{name:'Outra'}}]};
 assert.deepEqual(mapApolloPeople(data,'Acme Serviços Ltda').map(p=>[p.name,p.partialName]),[['Maria Si***a',true]]);
});
test('Hunter usa nome real e cargo sem vazar e-mail',()=>{
 const data={data:{organization:'Acme',emails:[{first_name:'Maria',last_name:'Silva',position:'Gerente de Recursos Humanos',type:'personal',value:'email@acme.com'},{type:'generic',value:'info@acme.com'}]}};
 const people=mapHunterPeople(data,'Acme Serviços',false);
 assert.equal(people[0].name,'Maria Silva'); assert.equal('email' in people[0],false);
 const merged=mergeDecisionMakers([...people,...mapApolloPeople({people:[{first_name:'Maria',last_name_obfuscated:'Si***a',title:'Gerente de Recursos Humanos',organization:{name:'Acme'}}]},'Acme Serviços')]);
 assert.equal(merged.length,1);assert.equal(merged[0].partialName,false);
});
test('XLSX real, CNPJ textual e sem fórmula',()=>{
 const file=buildXlsx([{name:'Empresas',headers:['CNPJ','Razão social'],rows:[['00000000000100','=123+1']]}]);
 assert.equal(file.subarray(0,2).toString(),'PK');assert.ok(file.length>1000);
});
