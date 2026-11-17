import test from 'node:test';
import assert from 'node:assert/strict';
import {readAccounts,readForms} from '../src/lib/linkedin-lead-parser.ts';

test('LinkedIn retorna só metadados das contas de anúncio',()=>{
 const result=readAccounts({elements:[{id:12345,name:'Odontoart',status:'ACTIVE',reference:'urn:li:organization:1',clientSecret:'nunca'}],metadata:{nextPageToken:'next'}});
 assert.deepEqual(result.accounts,[{id:'12345',name:'Odontoart',status:'ACTIVE',reference:'urn:li:organization:1',test:false}]);
 assert.equal(result.hasMore,true);
 assert.equal(JSON.stringify(result).includes('clientSecret'),false);
});
test('Leitura de formulários não retorna respostas nem dados pessoais',()=>{
 const result=readForms({elements:[{id:1234567890,name:'Teste Plano',state:'PUBLISHED',created:1700000000000,versionId:2,content:{questions:[{email:'sensitive'}]}}],paging:{count:50}});
 assert.deepEqual(result.forms,[{id:'1234567890',name:'Teste Plano',state:'PUBLISHED',created:1700000000000,version:2}]);
 assert.equal(JSON.stringify(result).includes('sensitive'),false);
 assert.equal(result.hasMore,false);
});
test('Registros sem identificador numérico não são apresentados',()=>{
 assert.equal(readAccounts({elements:[{id:'invalid'}]}).accounts.length,0);
 assert.equal(readForms({elements:[{id:'bad'}]}).forms.length,0);
});
