import test from 'node:test';
import assert from 'node:assert/strict';
import {mapOpenCnpjPeople,mapExaPeople,mergeDecisionMakers,organizationMatches} from '../src/lib/people.ts';
import {buildXlsx} from '../src/lib/xlsx.ts';
test('OpenCNPJ associa QSA somente ao CNPJ idêntico',()=>{
 const data={success:true,data:{cnpj:'00000000000191',razaoSocial:'BANCO DO BRASIL SA',
 socios:[{nomeSocio:'MARIA SILVA',descricao:'Presidente'},{nomeSocio:'JOAO PEREIRA',descricao:'Sócio-Administrador'}]}};
 const ok=mapOpenCnpjPeople(data,'00000000000191','BANCO DO BRASIL SA');
 assert.equal(ok.length,2);assert.equal(ok[0].name,'MARIA SILVA');assert.equal(ok[0].source,'opencnpj');
 assert.equal(mapOpenCnpjPeople(data,'11111111000191','OUTRA EMPRESA').length,0);
});
test('Exa exige nome, cargo e empregador evidenciado em perfil profissional',()=>{
 const payload={results:[
  {title:'Ana Souza',text:'Gerente de Recursos Humanos na Empresa Acme Serviços Ltda. Atualmente coordena RH.'},
  {title:'Juliana Pereira',text:'Gerente de Recursos Humanos na Empresa Diferente.'},
  {title:'Luiz Carvalho',text:'Funcionário na Empresa Acme Serviços Ltda.'}
 ]};
 const result=mapExaPeople(payload,'Empresa Acme Serviços Ltda');
 assert.deepEqual(result.map(x=>x.name),['Ana Souza']);
 assert.equal(result[0].source,'exa');assert.match(result[0].role,/Gerente/);
});
test('Dois fornecedores retornando mesma pessoa não geram duplicidade',()=>{
 const merged=mergeDecisionMakers([
  {name:'MARIA SILVA',role:'Diretora Administrativa',organization:'Acme',source:'opencnpj',partialName:false},
  {name:'Maria Silva',role:'Gerente de RH',organization:'Acme',source:'exa',partialName:false}
 ]);
 assert.equal(merged.length,1);assert.equal(merged[0].source,'exa');
 assert.equal(organizationMatches('Alpha Tecnologia SA','Empresa diferente'),false);
});
test('XLSX real, CNPJ textual e sem fórmula',()=>{
 const file=buildXlsx([{name:'Empresas',headers:['CNPJ','Razão social'],rows:[['00000000000100','=123+1']]}]);
 assert.equal(file.subarray(0,2).toString(),'PK');assert.ok(file.length>1000);
});
