import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptLinkedInToken,decryptLinkedInToken} from '../src/lib/linkedin-crypto.ts';
test('Tokens LinkedIn são guardados criptografados e recuperados sem perdas',()=>{
 const key=randomBytes(32).toString('hex');
 const original='AQXV_token_de_teste';
 const encrypted=encryptLinkedInToken(original,key);
 assert.equal(encrypted.includes(original),false);
 assert.equal(decryptLinkedInToken(encrypted,key),original);
});
test('Alteração no token ou chave errada causa rejeição',()=>{
 const key=randomBytes(32).toString('hex'),encrypted=encryptLinkedInToken('teste',key);
 assert.throws(()=>decryptLinkedInToken(encrypted,randomBytes(32).toString('hex')));
 const parts=encrypted.split('.');
 const altered=[parts[0],parts[1],Buffer.from('alterado').toString('base64url')].join('.');
 assert.throws(()=>decryptLinkedInToken(altered,key));
});
test('Exige chave AES-256 de 32 bytes',()=>{
 assert.throws(()=>encryptLinkedInToken('teste','senha-fraca'));
});
