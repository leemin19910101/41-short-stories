const SESSION_TTL=4*60*60*1000, COOKIE='KRA_ADMIN', failures=new Map();
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=s=>Uint8Array.from(s.match(/.{2}/g)||[],h=>parseInt(h,16));
const b64url=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const safeEqual=(a,b)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0};
const securityHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-store'};
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{...securityHeaders,'Content-Type':'application/json; charset=utf-8',...extra}})}
function configured(env){return typeof env.ADMIN_USERNAME==='string'&&!!env.ADMIN_USERNAME&&/^[a-f0-9]{32,64}$/.test(env.ADMIN_SALT||'')&&/^[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH||'')&&(env.ADMIN_SESSION_SECRET||'').length>=40}
async function sessionKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromHex(salt),iterations:100000},key,256))}
async function readSession(request,env){if(!configured(env))return null;try{const cookie=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));if(!cookie)return null;const parts=cookie.slice(COOKIE.length+1).split('.');if(parts.length!==2||parts[0].length>1024||parts[1].length>100)return null;const valid=await crypto.subtle.verify('HMAC',await sessionKey(env),unb64(parts[1]),encoder.encode(parts[0]));if(!valid)return null;const value=JSON.parse(new TextDecoder().decode(unb64(parts[0])));if(value.username!==env.ADMIN_USERNAME||value.version!==env.ADMIN_PASSWORD_HASH.slice(0,16)||typeof value.expiresAt!=='number'||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+SESSION_TTL+60000)return null;return value}catch{return null}}
async function createSession(env){const session={username:env.ADMIN_USERNAME,expiresAt:Date.now()+SESSION_TTL,version:env.ADMIN_PASSWORD_HASH.slice(0,16),nonce:hex(crypto.getRandomValues(new Uint8Array(16)))};const payload=b64url(encoder.encode(JSON.stringify(session))),signature=b64url(await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(payload)));return {session,token:payload+'.'+signature}}
function validOrigin(request,env){const origin=request.headers.get('Origin');return origin===new URL(request.url).origin||origin===env.ADMIN_ORIGIN}
async function readBody(request){if(Number(request.headers.get('Content-Length')||0)>4096)throw Error('large');const reader=request.body?.getReader();if(!reader)throw Error('empty');let bytes=0,chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();throw Error('large')}chunks.push(value)}}finally{reader.releaseLock()}const data=new Uint8Array(bytes);let offset=0;for(const part of chunks){data.set(part,offset);offset+=part.length}return JSON.parse(new TextDecoder().decode(data))}
function cookie(value,maxAge){return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`}
function failedLogin(key){const now=Date.now(),old=failures.get(key);const next=old&&old.until>now?{count:old.count+1,until:old.until}:{count:1,until:now+10*60*1000};failures.set(key,next);if(failures.size>1000)for(const [k,v] of failures)if(v.until<now)failures.delete(k)}
export default {async fetch(request,env){try{const path=new URL(request.url).pathname;
 if(path.startsWith('/auth/')||path==='/editor.js'){
  if(!configured(env))return json({error:'作者登入暫時無法使用，請稍後再試。'},503);
  if(path==='/auth/session'&&request.method==='GET'){const session=await readSession(request,env);return session?json({authenticated:true,expiresAt:session.expiresAt}):json({authenticated:false},401)}
  if(path==='/editor.js'&&(request.method==='GET'||request.method==='HEAD')){if(!await readSession(request,env))return json({error:'請先登入作者帳號。'},401);return new Response(request.method==='HEAD'?null:EDITOR_SOURCE,{headers:{...securityHeaders,'Content-Type':'text/javascript; charset=utf-8'}})}
  if(['/auth/login','/auth/logout'].includes(path)){
   if(request.method!=='POST')return json({error:'不支援此操作。'},405,{'Allow':'POST'});
   if(!validOrigin(request,env))return json({error:'請從本站登入。'},403);
   if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'請使用登入表單。'},415);
   if(path==='/auth/logout')return json({ok:true},200,{'Set-Cookie':cookie('',0)});
   const key=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'unknown',limit=failures.get(key);
   if(limit&&limit.until>Date.now()&&limit.count>=5)return json({error:'登入嘗試過多，請十分鐘後再試。'},429,{'Retry-After':String(Math.ceil((limit.until-Date.now())/1000))});
   let body;try{body=await readBody(request)}catch{return json({error:'登入資料格式錯誤。'},400)}
   if(typeof body?.username!=='string'||typeof body?.password!=='string'||body.username.length>80||body.password.length>160)return json({error:'登入資料格式錯誤。'},400);
   const hash=await passwordHash(body.password,env.ADMIN_SALT);
   if(!safeEqual(body.username,env.ADMIN_USERNAME)||!safeEqual(hash,env.ADMIN_PASSWORD_HASH)){failedLogin(key);return json({error:'帳號或密碼不正確。'},401)}
   failures.delete(key);const {session,token}=await createSession(env);return json({ok:true,expiresAt:session.expiresAt},200,{'Set-Cookie':cookie(token,SESSION_TTL/1000)});
  }
  return json({error:'找不到此頁面。'},404);
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...securityHeaders,'Allow':'GET, HEAD'}});
 const resource=PUBLIC_ASSETS[path==='/'?'/index.html':path];if(!resource)return new Response('Not found',{status:404,headers:securityHeaders});
 const bytes=Uint8Array.from(atob(resource.data),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{...securityHeaders,'Content-Type':resource.type}});
 }catch{return json({error:'網站暫時無法處理此操作，請稍後再試。'},503)}}};
