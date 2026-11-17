import test from 'node:test';
import assert from 'node:assert/strict';
import {ficharioMode,shouldFallbackFichario,ficharioPairs,mapFichario,ficharioRows,ficharioHasMore} from '../src/lib/fichario.ts';

test('fallback é acionável com nome da empresa e UF mesmo sem CNAE',()=>{
 const query={name:'supermercado',state:['CE'],activeOnly:true};
 assert.equal(ficharioMode(query),'name');
 assert.equal(shouldFallbackFichario(query,0,true),true);
 assert.equal(shouldFallbackFichario(query,0,false),true);
 assert.equal(shouldFallbackFichario(query,5,false),false);
 assert.deepEqual(ficharioPairs(query,'name'),[{state:'CE',city:'',cnae:''}]);
});
test('não inventa busca setorial se faltarem CNAE e nome',()=>{
 assert.equal(ficharioMode({state:['CE'],sector:['indústria'],city:['Fortaleza']}),null);
 assert.equal(ficharioMode({state:['CE'],segment:['educação'],city:['Fortaleza']}),null);
 assert.equal(ficharioMode({state:['CE']}),null);
 assert.equal(ficharioMode({state:['CE'],city:['Fortaleza']}),'advanced');
 assert.equal(ficharioMode({state:['CE'],cnae:['4711302']}),'advanced');
});
test('CNPJ completo funciona mesmo sem UF, raiz não suporta busca direta',()=>{
 assert.equal(ficharioMode({cnpj:'07.396.951/0001-70'}),'exact');
 assert.equal(ficharioMode({cnpj:'07396951',state:['CE'],name:'Empresa'}),null);
});
test('parser mapeia registros resumidos de busca por nome',()=>{
 const rows=ficharioRows({resultados:[{cnpj:'11222333000181',razao_social:'SUPERMERCADO TESTE',nome_fantasia:'TESTE',municipio:'FORTALEZA',uf:'CE'}]});
 assert.equal(rows.length,1);
 const result=mapFichario(rows[0]);
 assert.equal(result?.cnpj,'11222333000181');
 assert.equal(result?.legalName,'SUPERMERCADO TESTE');
 assert.equal(result?.city,'FORTALEZA');
 assert.equal(result?.state,'CE');
 assert.equal(result?.phone,null);
 assert.equal(result?.source,'fichario');
});
test('parser mapeia telefone, CNAE e endereço da ficha detalhada do Fichário',()=>{
 const result=mapFichario({
  cnpj:'11222333000181',razao_social:'SUPERMERCADO TESTE',situacao:'ATIVA',
  atividade_principal:{codigo:'4711302',descricao:'Comércio varejista de mercadorias'},
  telefone:'85 32123456',
  endereco:{logradouro:'Av Exemplo',numero:'100',bairro:'CENTRO',municipio:'Fortaleza',uf:'CE',cep:'60000000'}
 });
 assert.equal(result?.cnae,'4711302');
 assert.equal(result?.segment,'Comércio varejista de mercadorias');
 assert.equal(result?.district,'CENTRO');
 assert.equal(result?.phone,'85 32123456');
 assert.equal(result?.city,'Fortaleza');
});
test('paginação por total ou tamanho da página é reconhecida',()=>{
 assert.equal(ficharioHasMore({total:33},Array.from({length:20}),1,20),true);
 assert.equal(ficharioHasMore({total:33},Array.from({length:13}),2,20),false);
 assert.equal(ficharioHasMore({},Array.from({length:20}),1,20),true);
 assert.equal(ficharioHasMore({},Array.from({length:5}),1,20),false);
});
