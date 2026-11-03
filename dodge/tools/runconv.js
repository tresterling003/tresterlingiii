const { chromium } = require('playwright');const path=require('path'),fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
p.on('console',m=>{const t=m.text();if(!/TGA|placeholder/.test(t))console.log('[c]',t.slice(0,300))});p.on('pageerror',e=>console.log('[err]',e.message));
await p.route('**/*',async r=>{const u=new URL(r.request().url());if(u.protocol==='file:')return r.continue();
 const f=u.hostname==='cdn.jsdelivr.net'?path.join(__dirname,'cdn',decodeURIComponent(u.pathname)):u.hostname==='assets.local'?path.join(__dirname,'rb',decodeURIComponent(u.pathname)):null;
 if(f&&fs.existsSync(f))return r.fulfill({status:200,body:fs.readFileSync(f),headers:{'content-type':f.endsWith('.js')?'application/javascript':'application/octet-stream','access-control-allow-origin':'*'}});return r.abort();});
await p.goto('file://'+path.resolve('convert.html'));await p.waitForFunction('window.READY',null,{timeout:60000});
const res=await p.evaluate(()=>window.convert());
for(const [k,v] of Object.entries(res)){fs.writeFileSync('rb/out/'+k+'.bin',Buffer.from(v.b64,'base64'));delete v.b64;console.log(k,JSON.stringify(v))}
await b.close()})();
