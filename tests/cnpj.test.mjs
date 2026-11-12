import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCnpj,validCnpj,cnpjKind} from '../src/lib/cnpj.ts';
test('remove mascara e conserva zeros à esquerda',()=>{
 assert.equal(normalizeCnpj('03.187.913/***-**'),'03187913');
 assert.equal(normalizeCnpj('00.000.000/0001-91'),'00000000000191');
});
test('raiz e prefixo podem ser pesquisados',()=>{
 assert.equal(cnpjKind('03.187.913'),'root');
 assert.equal(cnpjKind('03.187.913/0002'),'prefix');
 assert.equal(cnpjKind('03.187.9'),'invalid');
});
test('valida CNPJ numérico e alfanumérico',()=>{
 assert.ok(validCnpj('11222333000181'));
 assert.ok(validCnpj('12ABC34501DE35'));
 assert.ok(!validCnpj('11222333000182'));
 assert.equal(cnpjKind('11.222.333/0001-81'),'exact');
});
