import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRegistryCompanies} from '../src/lib/company-merge.ts';
const entry=(cnpj,phone,source='localiza')=>({cnpj,cnpjRoot:cnpj.slice(0,8),legalName:'EMPRESA EXEMPLO',tradeName:null,isHeadquarters:true,status:'Ativa',cnae:null,segment:null,city:'Fortaleza',state:'CE',district:null,address:null,postalCode:null,phone,email:null,source});
test('junta o mesmo CNPJ e conserva telefone cadastral disponível',()=>{
 const items=mergeRegistryCompanies([entry('11222333000181',null),entry('11222333000181','85 3212-3344','cnpjai')]);
 assert.equal(items.length,1);
 assert.equal(items[0].phone,'85 3212-3344');
 assert.equal(items[0].source,'cnpjai');
});
test('não confunde matriz e filial ao remover duplicatas',()=>{
 const items=mergeRegistryCompanies([entry('11222333000181',null),entry('11222333000262','85 3333-2222')]);
 assert.equal(items.length,2);
 assert.equal(items[0].cnpj,'11222333000262');
});
test('não gera telefone artificial para registros sem contato',()=>{
 const [item]=mergeRegistryCompanies([entry('11222333000181',null)]);
 assert.equal(item.phone,null);
});
