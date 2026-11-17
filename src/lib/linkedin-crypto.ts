import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
export function encryptLinkedInToken(token:string,keyHex:string):string{
 if(!/^[0-9a-f]{64}$/i.test(keyHex))throw new Error('LINKEDIN_TOKEN_ENCRYPTION_KEY inválida.');
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),iv);
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}
export function decryptLinkedInToken(encoded:string,keyHex:string):string{
 if(!/^[0-9a-f]{64}$/i.test(keyHex))throw new Error('LINKEDIN_TOKEN_ENCRYPTION_KEY inválida.');
 const parts=encoded.split('.');
 if(parts.length!==3)throw new Error('Token criptografado inválido.');
 const [iv,tag,text]=parts.map(value=>Buffer.from(value,'base64url'));
 if(iv.length!==12||tag.length!==16||!text.length)throw new Error('Token criptografado inválido.');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(text),decipher.final()]).toString('utf8');
}
