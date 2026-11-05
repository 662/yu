// Test-only OIDC issuer. Never run this fixture on a public network.
import {createServer} from 'node:http';
import {generateKeyPairSync, randomUUID, createHash, sign} from 'node:crypto';
if (process.env.MOCK_OIDC_ENABLED !== 'true' || process.env.KEYCLOAK_ISSUER !== 'http://mock-oidc:3102') throw new Error('Test fixture requires isolated OIDC settings');
const issuer=process.env.KEYCLOAK_ISSUER;
const clientId=process.env.KEYCLOAK_CLIENT_ID;
const secret=process.env.KEYCLOAK_CLIENT_SECRET;
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const codes=new Map();
function jwt(payload,invalid=false) {
 const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const signature=sign('RSA-SHA256',Buffer.from(head+'.'+body),privateKey).toString('base64url');
 return head+'.'+body+'.'+(invalid?Buffer.alloc(256).toString('base64url'):signature);
}
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const escape=(s)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,issuer);
  if(url.pathname==='/.well-known/openid-configuration') return json(res,200,{issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',end_session_endpoint:issuer+'/logout',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_basic'],code_challenge_methods_supported:['S256']});
  if(url.pathname==='/jwks') return json(res,200,{keys:[jwk]});
  if(url.pathname==='/logout') {res.writeHead(302,{Location:url.searchParams.get('post_logout_redirect_uri')||'http://localhost:3101/login'});return res.end();}
  if(url.pathname==='/authorize') {
   if(url.searchParams.get('client_id')!==clientId || url.searchParams.get('redirect_uri')!==process.env.APP_ORIGIN+'/api/auth/callback/keycloak') return json(res,400,{error:'invalid_request'});
   if(url.searchParams.get('code_challenge_method')!=='S256'||!url.searchParams.get('code_challenge'))return json(res,400,{error:'pkce_required'});
   const subject=url.searchParams.get('test_subject');
   if(!subject) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><html><body><h1>测试账号中心</h1><form method="get" action="/authorize">'+[...url.searchParams].map(([k,v])=>`<input type="hidden" name="${escape(k)}" value="${escape(v)}">`).join('')+'<button name="test_subject" value="alice">Alice</button><button name="test_subject" value="bob">Bob</button><button name="test_subject" value="same-email">相同邮箱的另一用户</button></form></body></html>');}
   const callback=new URL(url.searchParams.get('redirect_uri'));
   callback.searchParams.set('state',url.searchParams.get('state'));
   if(subject==='cancel')callback.searchParams.set('error','access_denied');
   else {const code=randomUUID();codes.set(code,{subject,nonce:url.searchParams.get('nonce'),challenge:url.searchParams.get('code_challenge'),redirectUri:url.searchParams.get('redirect_uri')});callback.searchParams.set('code',code);callback.searchParams.set('iss',issuer);}
   res.writeHead(302,{Location:callback.href});return res.end();
  }
  if(url.pathname==='/token'&&req.method==='POST') {
   let body='';for await(const chunk of req)body+=chunk;
   const params=new URLSearchParams(body);
   const encoded=(req.headers.authorization||'').split(' ')[1]||'';
   const credentials=Buffer.from(encoded,'base64').toString().split(':').map(v=>decodeURIComponent(v.replaceAll('+',' ')));
   if(!req.headers.authorization?.startsWith('Basic ')||credentials[0]!==clientId||credentials[1]!==secret)return json(res,401,{error:'invalid_client'});
   const grant=codes.get(params.get('code'));codes.delete(params.get('code'));
   if(!grant||grant.redirectUri!==params.get('redirect_uri')||createHash('sha256').update(params.get('code_verifier')||'').digest('base64url')!==grant.challenge)return json(res,400,{error:'invalid_grant'});
   const now=Math.floor(Date.now()/1000);
   const payload={iss:grant.subject==='wrong-issuer'?'https://untrusted.invalid':issuer,sub:grant.subject,aud:grant.subject==='wrong-audience'?'other-client':clientId,iat:now,exp:grant.subject==='expired'?now-600:now+300,nonce:grant.subject==='wrong-nonce'?'wrong':grant.nonce,name:grant.subject==='alice'?'Alice':grant.subject==='bob'?'Bob':'另一用户',email:grant.subject==='bob'?'bob@example.test':'shared@example.test'};
   return json(res,200,{access_token:'test-only-token',token_type:'Bearer',expires_in:300,id_token:jwt(payload,grant.subject==='bad-signature')});
  }
  return json(res,404,{error:'not_found'});
 }catch{json(res,500,{error:'test_fixture_failed'});}
}).listen(3102,'0.0.0.0');
