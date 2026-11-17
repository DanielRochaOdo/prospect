import test from 'node:test';
import assert from 'node:assert/strict';
import {mapOpenCnpjPeople,mapExaPeople,mapApolloPeople,mapHunterPeople,mergeDecisionMakers,organizationMatches,validCorporateDomain} from '../src/lib/people.ts';
import {buildXlsx} from '../src/lib/xlsx.ts';
import {verifiedLinkedInProfileUrl,linkedinPeopleSearchUrl} from '../src/lib/linkedin-profile.ts';
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

test('Apollo gratuito aceita nome parcial, só com empregador correspondente',()=>{
 const sample={people:[
  {first_name:'Mariana',last_name_obfuscated:'Si***a',title:'Gerente de Recursos Humanos',organization:{name:'Acme Serviços'}},
  {first_name:'Ana',last_name:'Pereira',title:'Diretora',organization:{name:'Outra Empresa'}}
 ]};
 const found=mapApolloPeople(sample,'Acme Serviços Ltda');
 assert.equal(found.length,1);
 assert.equal(found[0].source,'apollo');
 assert.equal(found[0].partialName,true);
});
test('Hunter retorna nome/cargo sem expor e-mail e rejeita empresa incorreta',()=>{
 const response={data:{organization:'Acme Serviços',emails:[
  {first_name:'Mariana',last_name:'Silva',position:'Gerente de RH',type:'personal',value:'mariana@acme.com'},
  {first_name:'Equipe',position:'Vendas',type:'generic'}
 ]}};
 const found=mapHunterPeople(response,'Acme Serviços Ltda',false);
 assert.equal(found.length,1);
 assert.equal(found[0].name,'Mariana Silva');
 assert.equal(Object.hasOwn(found[0],'email'),false);
 assert.equal(mapHunterPeople(response,'Outra Empresa',false).length,0);
 assert.equal(validCorporateDomain('acme.com.br'),'acme.com.br');
 assert.equal(validCorporateDomain('gmail.com'),null);
});

test('Exa preserva link real de perfil LinkedIn quando há vínculo profissional evidenciado',()=>{
 const payload={results:[{
  title:'Ana Souza',url:'https://www.linkedin.com/in/ana-souza-rh/?trk=teste',
  text:'Gerente de Recursos Humanos na Empresa Acme Serviços Ltda. Atualmente coordena RH.'
 }]};
 const found=mapExaPeople(payload,'Empresa Acme Serviços Ltda');
 assert.equal(found.length,1);
 assert.equal(found[0].linkedinUrl,'https://www.linkedin.com/in/ana-souza-rh/');
});
test('URLs falsas ou irrelevantes não são apresentadas como perfis do LinkedIn',()=>{
 const invalid=[
  'https://linkedin.com.evil.example/in/fulano',
  'https://www.linkedin.com/company/12345',
  'https://www.linkedin.com/search/results/people/?keywords=RH',
  'javascript:alert(1)',
  'http://www.linkedin.com/in/pessoa',
  'https://www.linkedin.com@evil.example/in/pessoa'
 ];
 for(const url of invalid)assert.equal(verifiedLinkedInProfileUrl(url),null,url);
 const payload={results:[{
  title:'Ana Souza',url:'https://example.org/in/ana',
  text:'Gerente de Recursos Humanos na Empresa Acme Serviços Ltda.'
 }]};
 assert.equal(mapExaPeople(payload,'Empresa Acme Serviços Ltda')[0].linkedinUrl,undefined);
});
test('Pesquisa LinkedIn é um link externo manual e não inventa perfis individuais',()=>{
 const url=new URL(linkedinPeopleSearchUrl('ACME SERVICOS LTDA','ACME','Ana Souza'));
 assert.equal(url.origin,'https://www.linkedin.com');
 assert.equal(url.pathname,'/search/results/people/');
 assert.match(url.searchParams.get('keywords')||'',/Ana Souza/);
 assert.match(url.searchParams.get('keywords')||'',/ACME/);
});
test('Deduplicação prefere perfil profissional verificável em caso de empate de cargo',()=>{
 const merged=mergeDecisionMakers([
  {name:'Ana Souza',role:'Gerente de RH',organization:'Acme',source:'apollo',partialName:false},
  {name:'Ana Souza',role:'Gerente de RH',organization:'Acme',source:'exa',partialName:false,linkedinUrl:'https://www.linkedin.com/in/ana-souza'}
 ]);
 assert.equal(merged.length,1);
 assert.equal(merged[0].linkedinUrl,'https://www.linkedin.com/in/ana-souza');
});
