import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExport} from '../src/lib/export-data.ts';
import {mergeLoaded,pageSlice,canAdvance,RESULTS_PER_PAGE} from '../src/lib/pagination.ts';
import {buildXlsx} from '../src/lib/xlsx.ts';
test('XLSX aceita e-mails cadastrais inválidos e campos incompletos',()=>{
 const parsed=normalizeExport({companies:[{cnpj:'00.000.000/0001-00',legalName:'Empresa Teste',source:'localiza',email:'sem-email-valido',phone:null}],people:[]});
 assert.equal(parsed.companies.length,1);assert.equal(parsed.companies[0].email,'sem-email-valido');
 const file=buildXlsx([{name:'Empresas',headers:['CNPJ','E-mail'],rows:[[parsed.companies[0].cnpj,parsed.companies[0].email]]}]);
 assert.equal(file.subarray(0,2).toString(),'PK');
});
test('Exportação ignora registro inválido sem perder os válidos',()=>{
 const parsed=normalizeExport({companies:[{cnpj:'00000000000100',legalName:'A',source:'cnpjai'},{cnpj:'invalido',source:'google'},{cnpj:'00000000000100',legalName:'duplicado',source:'localiza'},{cnpj:'00000000000200',legalName:'B',source:'localiza'}],people:[{cnpj:'00000000000100',name:'Maria Silva',role:'RH',source:'hunter',partialName:false}]});
 assert.equal(parsed.companies.length,2);assert.equal(parsed.people.length,1);
});
test('Paginação mostra 10 por vez e consolida CNPJs sem duplicidade',()=>{
 const a=Array.from({length:10},(_,i)=>({cnpj:String(i).padStart(14,'0'),phone:null}));
 const b=[{cnpj:a[2].cnpj,phone:'8599999999'},...Array.from({length:10},(_,i)=>({cnpj:String(i+10).padStart(14,'0'),phone:null}))];
 const merged=mergeLoaded(a,b);
 assert.equal(RESULTS_PER_PAGE,10);assert.equal(merged.length,20);assert.equal(merged[2].phone,'8599999999');
 assert.equal(pageSlice(merged,1).length,10);assert.equal(pageSlice(merged,2).length,10);
 assert.equal(canAdvance(merged.length,1,false),true);assert.equal(canAdvance(merged.length,2,false),false);
});
