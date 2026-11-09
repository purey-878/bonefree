/** Production build + isolated PostgreSQL API. Never point this at production. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bonefree-reservations-browser-'));
const apiOrigin = process.env.RESERVATION_TEST_API || 'http://127.0.0.1:19102';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(apiOrigin)) throw new Error('Browser QA requires an isolated loopback test API');
const calls = [], passes = [], errors = [];
let failCreateOnce = false;
const server = http.createServer((req,res) => {
 const u = new URL(req.url,'http://127.0.0.1:19101');
 if (u.pathname.startsWith('/api/')) {
  calls.push({ method:req.method, path:u.pathname+u.search });
  const proxy=http.request(new URL(u.pathname.slice(4)+u.search,apiOrigin),{method:req.method,headers:{...req.headers,host:new URL(apiOrigin).host}},upstream=>{if(failCreateOnce&&req.method==='POST'&&u.pathname==='/api/reservations'){failCreateOnce=false;upstream.resume();upstream.on('end',()=>{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'upstream_failure',message:'Simulated lost response after commit'}))});return}res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res)});
  proxy.on('error',()=>{res.writeHead(502);res.end()});req.pipe(proxy);return;
 }
 let file=path.join(root,decodeURIComponent(u.pathname));
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file))file=path.join(root,u.pathname.startsWith('/reservations/confirmation')?'reservation-confirmation.html':u.pathname.startsWith('/admin/')?'admin.html':u.pathname.startsWith('/product/')?'dish.html':'index.html');
 const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'})[ext]||'application/octet-stream');
 let data=fs.readFileSync(file);if(ext==='.js')data=Buffer.from(data.toString().replaceAll('https://api.bonefree.pt','http://127.0.0.1:19101/api').replaceAll('http://127.0.0.1:8000','http://127.0.0.1:19101/api'));res.end(data);
});
await new Promise(resolve=>server.listen(19101,'127.0.0.1',resolve));
const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=19103',`--user-data-dir=${output}/profile`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,send,evaluate;
const api=async(route,{method='GET',body,admin=false}={})=>{const response=await fetch(apiOrigin+route,{method,headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer reservation-test-owner'}:{})},body:body?JSON.stringify(body):undefined});if(!response.ok)throw Error(`Test API ${route}: ${response.status} ${await response.text()}`);return response.json()};
try {
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(apiOrigin+'/health')).ok){ready=true;break}}catch{}await sleep(100)}if(!ready)throw Error('Isolated test API unavailable');
 let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch('http://127.0.0.1:19103/json/list')).json();break}catch{await sleep(100)}}
 if(!tabs)throw Error('Chrome debugging unavailable');
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)});
 evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const wait=async(expression,label)=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(100)}throw Error('Timeout '+label+' '+await evaluate('document.body.innerText.slice(-1300)'))};
 const assert=(value,label)=>{if(!value)throw Error(label);passes.push(label)};
 const input=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Input missing: '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const button=(selector,text)=>evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Button missing');b.click()})()`);
 const navigate=async route=>{await send('Page.navigate',{url:'http://127.0.0.1:19101'+route});};
 const viewport=(width,height=900)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
 await send('Page.enable');await send('Runtime.enable');await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('bonefree_locale','en-GB');localStorage.setItem('admin_token','reservation-test-owner');localStorage.setItem('admin_role','owner');"});
 // The fixture starts disabled. Configure through the real administrator UI.
 const publicSettings=await api('/reservations/settings');
 await viewport(390,844);await navigate('/reservations');await wait('document.querySelector(".reservation-card")?.textContent.includes("paused")','disabled public page');assert(!await evaluate('!!document.querySelector("#reservation-booking-form")'),'Unconfigured availability starts disabled');
 const day=new Date(publicSettings.today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+3);const chosenDay=day.toISOString().slice(0,10);const weekday=(day.getUTCDay()+6)%7;
 await viewport(1440);await navigate('/admin/dashboard?tab=reservations');await wait('!!document.querySelector(".reservation-admin")','admin reservations');
 await button('.ra-tabs button','Settings');await wait('!!document.querySelector("#reservation-availability-form")','settings');
 if(!await evaluate('document.querySelector("#reservation-availability-form input[name=enabled]").checked'))await click('#reservation-availability-form input[name=enabled]');
 // Find the weekday by its array index, independent of other form children.
 await evaluate(`(()=>{const day=document.querySelectorAll('.ra-weekday')[${weekday}];if(!day.querySelector('input[type=checkbox]').checked)day.querySelector('input[type=checkbox]').click()})()`);
 await input(`.ra-weekday:nth-of-type(${weekday+2}) input[type=time]`,'18:00').catch(async()=>{await evaluate(`document.querySelectorAll('.ra-weekday')[${weekday}].setAttribute('data-qa-day','true')`);await input('[data-qa-day] input[type=time]','18:00')});
 await evaluate(`document.querySelectorAll('.ra-weekday')[${weekday}].setAttribute('data-qa-day','true')`);
 await input('[data-qa-day] input[type=time]:nth-of-type(1)','18:00');
 await input('[data-qa-day] label:nth-child(2) input[type=time]','20:00');
 await input('#reservation-availability-form input[name=minimum_notice_minutes]',0);await input('#reservation-availability-form input[name=max_reservations_per_slot]',1);
 await click('#reservation-availability-form button[type=submit]');await wait('document.querySelector(".reservation-admin [role=status]").textContent.includes("Saved")','availability saved');
 assert((await api('/reservations/settings')).enabled,'Administrator enables real persisted availability');
 await input('#reservation-promotion-form input[name=percentage]',30);await input('#reservation-promotion-form input[name=start_date]',chosenDay);await input('#reservation-promotion-form input[name=end_date]',chosenDay);
 await input('#reservation-promotion-form input[name=title]','Reserva online');await input('#reservation-promotion-form input[name=scope]','Menu à la carte');await input('#reservation-promotion-form textarea[name=conditions]','Apenas na data da reserva');
 if(!await evaluate('document.querySelector("#reservation-promotion-form input[name=enabled]").checked'))await click('#reservation-promotion-form input[name=enabled]');
 await input('#reservation-promotion-form select[name=promotion_locale]','en-GB');await input('#reservation-promotion-form input[name=title]','Online reservation');await input('#reservation-promotion-form input[name=scope]','À la carte menu');await input('#reservation-promotion-form textarea[name=conditions]','Reservation date only');
 await click('#reservation-promotion-form button[type=submit]');await wait('document.querySelector(".reservation-admin [role=status]").textContent.includes("Saved")','promotion saved');
 assert((await api('/admin/reservations/promotions',{admin:true})).some(p=>Number(p.percentage)===30&&p.enabled),'Administrator creates a real enabled 30% promotion');
 // Saving the server-returned promotion again must not send its response-only id.
 await click('#reservation-promotion-form button[type=submit]');await wait('document.querySelector(".reservation-admin [role=status]").textContent.includes("Saved")','repeat promotion save');
 assert(!await evaluate('!!document.querySelector(".reservation-admin [role=alert]")'),'Repeated promotion save succeeds without a validation error');
 await viewport(390,844);await navigate('/reservations');await wait('!!document.querySelector("#reservation-booking-form")','public form');
 await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(output,'booking-mobile.png'),Buffer.from(r.data,'base64')));
 assert(await evaluate('!document.querySelector("input[name=email]").required&&!document.querySelector("input[name=phone]").required'),'Email and phone are genuinely optional');
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'390px form has no horizontal overflow');
 await viewport(320,740);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'320px form has no horizontal overflow');
 assert(await evaluate('parseFloat(getComputedStyle(document.querySelector("input[name=name]")).fontSize)>=16'),'Phone form inputs avoid focus zoom with 16px text');
 await viewport(820);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Tablet form remains within viewport');await viewport(390,844);
 await input('input[name=day]',chosenDay);await wait('document.querySelectorAll("input[name=time]").length>0','available times');await click('input[name=time][value="18:00"]');await wait('!!document.querySelector(".reservation-offer")','eligible offer');
 assert(await evaluate('document.querySelector(".reservation-offer").textContent.includes("30%")'),'Eligible promotion is visible before submission');
 await input('input[name=name]','João Müller QA');await click('#reservation-booking-form button[type=submit]');await wait('!!document.querySelector(".reservation-pass")','confirmed pass');
 assert(await evaluate('document.querySelector(".reservation-pass").textContent.includes("João Müller QA")&&document.querySelector(".reservation-pass").textContent.includes("30%")'),'Saved pass shows customer, reservation and awarded promotion');
 assert(await evaluate('document.querySelector("meta[name=robots]").content.includes("noindex")&&document.querySelector("meta[name=referrer]").content==="no-referrer"'),'Private confirmation has noindex and no-referrer metadata');
 assert(await evaluate('document.querySelectorAll("h1").length===1'),'Pass has one logical H1');
 assert(await evaluate('document.querySelector(".reservation-confirmation-heading").getBoundingClientRect().bottom<=document.querySelector(".reservation-pass").getBoundingClientRect().top'),'Save instructions appear above the pass');
 assert(await evaluate('!!document.querySelector(".reservation-pass .reservation-reference")'),'Reference is captured with the booking details');
 const privatePath=await evaluate('location.pathname+location.hash');const token=await evaluate('new URLSearchParams(location.hash.slice(1)).get("token")');const reference=await evaluate('document.querySelector(".reservation-reference strong").textContent');
 assert(/^\/reservations\/confirmation#token=[a-f0-9]{64}$/.test(privatePath),'Private link uses a fragment secret, separate from display reference');
 const stored=await api('/admin/reservations?search='+encodeURIComponent(reference),{admin:true});assert(stored.items.length===1&&stored.items[0].email===null&&stored.items[0].phone===null,'Booking is committed in PostgreSQL without contact fields');
 const booking=stored.items[0];assert(stored.items[0].promotion.percentage==='30.00','Administrator sees the awarded promotion');
 await button('.reservation-pass-actions button','Download PDF');
 const filename=path.join(output,`bonefree-${reference}.pdf`);for(let i=0;i<100&&!fs.existsSync(filename);i++)await sleep(100);
 assert(fs.existsSync(filename)&&fs.readFileSync(filename).subarray(0,4).toString()==='%PDF','PDF action downloads an actual saved-booking PDF');
 await evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.__copiedReservation=value}}})');await button('.reservation-pass-actions button','Copy private link');
 assert(await evaluate('window.__copiedReservation===location.origin+location.pathname+location.hash'),'Copy action preserves the complete private confirmation link');
 await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(output,'pass-mobile.png'),Buffer.from(r.data,'base64')));
 await navigate(privatePath);await wait('!!document.querySelector(".reservation-pass")','reloaded private pass');assert(await evaluate('document.querySelector(".reservation-reference").textContent.includes('+JSON.stringify(reference)+')'),'Private confirmation reload recovers the same booking');
 const pdfResponse=await fetch(apiOrigin+'/reservations/confirmation/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,locale:'de-DE'})});
 assert(pdfResponse.headers.get('cache-control').includes('no-store')&&pdfResponse.headers.get('referrer-policy')==='no-referrer','Private PDF responses prohibit caching and referrer leakage');
 const full=await api(`/reservations/availability?day=${chosenDay}&guests=2`);assert(!full.slots.find(s=>s.time==='18:00').available,'The booked final slot is unavailable');
 // Customers cancel through their saved link; merely opening the prompt is read-only.
 await click('.reservation-cancel-open');await wait('!!document.querySelector("#reservation-cancel-title")','cancellation prompt');
 assert((await api('/reservations/confirmation',{method:'POST',body:{token,locale:'en-GB'}})).status==='confirmed','Opening cancellation does not change the booking');
 await button('.reservation-pass-cancellation button','Keep reservation');
 assert((await api('/reservations/confirmation',{method:'POST',body:{token,locale:'en-GB'}})).status==='confirmed','Keep reservation preserves the booking');
 await click('.reservation-cancel-open');await click('.reservation-cancel-confirm');await wait('document.querySelector(".reservation-confirmation-heading h1")?.textContent.includes("cancelled")','customer cancellation');
 const repeated=await api('/reservations/confirmation/cancel',{method:'POST',body:{token,locale:'en-GB'}});
 assert(repeated.status==='cancelled'&&!repeated.can_cancel,'Repeated cancellation returns the same cancelled state');
 await navigate('/admin/dashboard?tab=reservations');await wait('!!document.querySelector(".reservation-admin")','admin list');await button('.ra-actions button','Upcoming');await input('.ra-filters input[type=search]',reference);await wait('document.querySelector(".ra-booking")?.textContent.includes('+JSON.stringify(reference)+')','cancelled booking in admin');
 assert(await evaluate('document.querySelector(".ra-booking select").value==="cancelled"'),'Administrator sees the customer cancellation');
 assert((await api(`/reservations/availability?day=${chosenDay}&guests=2`)).slots.find(s=>s.time==='18:00').available,'Cancellation releases capacity');
 // Changes from another customer session must appear while this admin page stays open.
 await input('.ra-filters input[type=search]','');await input('.ra-filters select','confirmed');
 await wait('document.querySelectorAll(".ra-booking").length===0','confirmed list after cancellation');
 const incoming=await api('/reservations?locale=en-GB',{method:'POST',body:{name:'Live update fixture',day:chosenDay,time:'18:00',guests:2,idempotency_key:'d'.repeat(64)}});
 await wait('document.querySelector(".ra-bookings")?.textContent.includes('+JSON.stringify(incoming.reference)+')','automatic incoming reservation');
 assert(await evaluate('document.querySelector(".ra-filters select").value==="confirmed"'),'New bookings appear automatically while preserving filters');
 await api('/reservations/confirmation/cancel',{method:'POST',body:{token:incoming.confirmation_token,locale:'en-GB'}});
 await wait('!document.querySelector(".ra-bookings")?.textContent.includes('+JSON.stringify(incoming.reference)+')','automatic customer cancellation');
 assert(true,'Customer cancellations update the open admin list without manual refresh');

 await navigate(privatePath);await wait('document.querySelector(".reservation-confirmation-heading h1")?.textContent.includes("cancelled")','cancelled pass');
 assert(await evaluate('!document.querySelector(".reservation-pass .reservation-offer")'),'Cancelled pass cannot look like an active promotional offer');
 // Disable promotion, then a new booking must have no promotion section.
 const promotions=await api('/admin/reservations/promotions',{admin:true});const promotion=promotions.find(p=>p.id===booking.promotion.id);const {id:promotionId,...body}=promotion;
 await api('/admin/reservations/promotions/'+promotionId,{method:'PUT',admin:true,body:{...body,enabled:false,title:'Edited later'}});
 const saved=await api('/reservations/confirmation',{method:'POST',body:{token,locale:'en-GB'}});assert(saved.promotion.percentage==='30.00'&&saved.promotion.title==='Online reservation','Awarded promotion snapshot survives later edits and disabling');
 await navigate('/reservations');await wait('!!document.querySelector("#reservation-booking-form")','second booking');await input('input[name=day]',chosenDay);await wait('document.querySelectorAll("input[name=time]").length>0','new availability');await click('input[name=time][value="18:00"]');await input('input[name=name]','No offer fixture');await click('#reservation-booking-form button[type=submit]');await wait('!!document.querySelector(".reservation-pass")','no promotion pass');assert(await evaluate('!document.querySelector(".reservation-pass .reservation-offer")'),'Booking without an active offer has no empty or fake promotion');
 await button('.language-switcher-menu button','Deutsch').catch(async()=>{await click('.language-switcher-trigger');await evaluate('document.querySelectorAll(".language-switcher-menu [role=menuitemradio]")[2].click()')});
 await wait('document.querySelector(".reservation-confirmation-heading h1")?.textContent.includes("bestätigt")','German pass');assert(true,'Private pass supports language switching');
 await viewport(1440);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Desktop pass remains within viewport');
 // Simulate a response lost after PostgreSQL commits: retry must recover one booking.
 await navigate('/reservations');await wait('!!document.querySelector("#reservation-booking-form")','retry form');await input('input[name=day]',chosenDay);await wait('document.querySelectorAll("input[name=time]").length>0','retry availability');await click('input[name=time][value="18:30"]');await input('input[name=name]','Lost response QA');
 failCreateOnce=true;await click('#reservation-booking-form button[type=submit]');await wait('!!document.querySelector("#reservation-booking-form fieldset:disabled")&&!document.querySelector("#reservation-booking-form button[type=submit]").disabled','safe retry');
 assert((await api('/admin/reservations?search=Lost%20response%20QA',{admin:true})).total===1,'A lost response still leaves one durable booking');
 await click('#reservation-booking-form button[type=submit]');await wait('!!document.querySelector(".reservation-pass")','retried pass');
 assert((await api('/admin/reservations?search=Lost%20response%20QA',{admin:true})).total===1,'Network retry recovers the same booking without duplication');
 await viewport(320,740);await navigate('/admin/dashboard?tab=reservations');await wait('!!document.querySelector(".reservation-admin")','mobile admin');
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'320px administrator reservation list has no horizontal overflow');
 await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(output,'admin-mobile.png'),Buffer.from(r.data,'base64')));
 await click('.ra-tabs button:nth-child(2)');await wait('!!document.querySelector("#reservation-availability-form")','mobile settings');
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'320px administrator settings remain within viewport');
 assert(await evaluate('[...document.querySelectorAll(".reservation-admin input:not([type=checkbox])")].every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)'),'Administrator fields retain mobile-safe text sizing');
 await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(output,'settings-mobile.png'),Buffer.from(r.data,'base64')));
 await click('.ad-theme-switch');assert(await evaluate('!!document.querySelector(".ad-theme-dark")'),'Reservation settings support the existing dark theme');
 assert(await evaluate('getComputedStyle(document.querySelector("#reservation-availability-form select")).backgroundColor===getComputedStyle(document.querySelector("#reservation-availability-form input[type=number]")).backgroundColor'),'Dark admin selects use the same readable surface as other inputs');
 await viewport(1440);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Desktop administrator settings remain within viewport');
 await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(output,'settings-desktop-dark.png'),Buffer.from(r.data,'base64')));
 assert(!calls.some(call=>/token=|Jo%C3%A3o|M%C3%BCller/.test(call.path)),'HTTP request URLs never contain private token or customer name');
 assert(!calls.some(call=>/\/products/.test(call.path)),'Reservation workflow does not depend on product requests');
 assert(errors.length===0,'No browser runtime exceptions');
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passes,calls,errors},null,2));console.log(JSON.stringify({passes,output},null,2));
}catch(error){console.error(JSON.stringify({passes,errors,calls,output},null,2));if(send){try{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'failure.png'),Buffer.from(r.data,'base64'));if(evaluate)fs.writeFileSync(path.join(output,'failure.txt'),await evaluate('document.body.innerText'))}catch{}}throw error}
finally{ws?.close();chrome.kill();server.close()}
