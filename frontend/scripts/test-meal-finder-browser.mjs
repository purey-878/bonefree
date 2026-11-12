/** Production frontend against the real API's disposable local catalog fixture.
 * Start backend/scripts/run_meal_finder_browser_api.py first. No production data.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bonefree-finder-'));
const api='http://127.0.0.1:19112';
const owner={Authorization:'Bearer admin-smoke-token','Content-Type':'application/json'};
async function configuration(){return (await fetch(api+'/admin/meal-finder/settings',{headers:owner})).json();}
async function save(config){const r=await fetch(api+'/admin/meal-finder/settings',{method:'PUT',headers:owner,body:JSON.stringify(config)});if(!r.ok)throw new Error(await r.text());return r.json();}
const initial=await configuration();
const server=http.createServer((req,res)=>{
 let file=path.join(root,new URL(req.url,'http://localhost').pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file))file=path.join(root,req.url.startsWith('/product/')?'dish.html':req.url.startsWith('/admin/')?'admin.html':'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.avif':'image/avif','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(19111,'127.0.0.1',resolve));
const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=19113',`--user-data-dir=${output}/profile`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const passes=[],errors=[],calls=[];let ws,failNext=false;
try{
 let tabs;for(let i=0;i<300;i++){try{tabs=await(await fetch('http://127.0.0.1:19113/json/list')).json();break;}catch{await sleep(100);}}
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 let id=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.addEventListener('message',async event=>{
  const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Fetch.requestPaused'){
   const req=m.params.request;const url=new URL(req.url);calls.push(url.pathname);
   let status=200,body='';
   try{
    if(req.method!=='OPTIONS'){
     if(failNext&&url.pathname==='/meal-finder/recommendations'){failNext=false;status=500;body=JSON.stringify({error:'test_failure',message:'Fixture failure'});}
     else{const response=await fetch(api+url.pathname+url.search,{method:req.method,headers:{'Content-Type':'application/json',...((req.headers.Authorization||req.headers.authorization)?{Authorization:req.headers.Authorization||req.headers.authorization}:{})},...(req.postData?{body:req.postData}:{})});status=response.status;body=await response.text();}
    }
   }catch(error){status=500;body=JSON.stringify({message:String(error)});}
   send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'*'}],body:Buffer.from(body).toString('base64')}).catch(()=>{});
  }
 });
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const capture=async name=>{const {cssContentSize:size}=await send('Page.getLayoutMetrics');const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:Math.min(size.height,8000),scale:1}});fs.writeFileSync(path.join(output,name),Buffer.from(shot.data,'base64'));};
 const wait=async(expression,label)=>{for(let i=0;i<180;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error(`Timeout ${label}: ${await evaluate('document.body.innerText.slice(-1500)')}`);};
 const assert=(value,label)=>{if(!value)throw new Error(label);passes.push(label);console.log('PASS',label);};
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const clickText=text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Missing button '+${JSON.stringify(text)});b.click()})()`);
 await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'https://api.bonefree.pt/*',requestStage:'Request'},{urlPattern:'http://127.0.0.1:8000/*',requestStage:'Request'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('bonefree_locale','en-GB');localStorage.setItem('admin_token','admin-smoke-token');localStorage.setItem('admin_role','owner')"});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:'http://127.0.0.1:19111/meal-finder'});
 await wait('!!document.querySelector(".mf-welcome button")','landing');
 assert(await evaluate('document.querySelectorAll("h1").length===1'),'Single H1 and live landing');
 assert(!calls.some(p=>/^\/products/.test(p)),'No browser catalog download');
 assert(await evaluate('document.querySelector(".mf-start-button").getBoundingClientRect().height>=70'),'Start quiz uses a prominent large primary button');
 for(const width of [320,390,768,1440]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`${width}px welcome has no horizontal overflow`);
  if(width===390 || width===1440)await capture(`welcome-${width}.png`);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert(await evaluate('document.querySelector(".mf-welcome button").getBoundingClientRect().bottom<=innerHeight'),'Mobile start button is visible without scrolling');
 await click('.mf-welcome button');await wait('document.activeElement.id==="mf-question"','course focus');
 assert(await evaluate('document.querySelectorAll(".mf-options button").length===3'),'Course choices are only starters, tacos and mains');
 await evaluate('document.querySelectorAll(".mf-options button")[1].focus()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await wait('document.querySelector("#mf-question")?.textContent.includes("style")','style');
 assert(await evaluate('document.activeElement.id==="mf-question"'),'Keyboard answer advances and focuses the next question');
 assert(await evaluate('getComputedStyle(document.querySelector(".mf-experience progress")).accentColor==="rgb(253, 205, 67)"'),'Quiz progress uses the website yellow');
 for(const width of [320,390,768,1440]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`${width}px quiz has no horizontal overflow`);
  if(width===390 || width===1440)await capture(`quiz-${width}.png`);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate('history.back()');await wait('document.querySelector("#mf-question")?.textContent.includes("eat")','course Back');
 assert(await evaluate('document.querySelectorAll(".mf-options button")[1].getAttribute("aria-pressed")==="true"'),'Browser Back preserves course selection');
 await click('.mf-options button:nth-child(3)');await wait('document.querySelector("#mf-question")?.textContent.includes("style")','style');
 await click('.mf-options button:nth-child(2)');await wait('document.querySelector("#mf-question")?.textContent.includes("ingredients")','ingredients');
 failNext=true;await click('.mf-options button:nth-child(2)');await wait('!!document.querySelector(".mf-experience [role=alert]")','retry alert');
 await clickText('Try again');await wait('!!document.querySelector(".mf-best article")','matches');
 assert(await evaluate('document.querySelector(".mf-best").textContent.includes("Chickpeas Tikka Masala")'),'Creamy main with legumes selects Tikka Masala rather than always cheeseburger');
 assert(await evaluate('document.querySelectorAll(".mf-grid article").length===2'),'At most two alternatives; no extras sections');
 assert(await evaluate('!location.search&&!location.hash'),'Answers stay outside URL');
 await evaluate('document.querySelector(".mf-best .product-card-media").focus()');
 await click('.mf-best .product-card-media');
 await wait('!!document.querySelector(".product-image-lightbox[open]")','card lightbox');
 assert(await evaluate('location.pathname==="/meal-finder" && document.body.style.overflow==="hidden"'),'Photo opens a modal without navigating and locks background scrolling');
 assert(await evaluate('document.activeElement?.classList.contains("product-image-lightbox-close")'),'Lightbox focuses its close button');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 assert(await evaluate('document.querySelector(".product-image-lightbox").contains(document.activeElement) || document.activeElement===document.body'),'Modal keeps keyboard focus away from background controls');
 await click('.product-image-lightbox img');
 assert(await evaluate('!!document.querySelector(".product-image-lightbox[open]")'),'Clicking the photo keeps it open');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await wait('!document.querySelector(".product-image-lightbox")','Escape closes lightbox');
 await wait('document.activeElement?.classList.contains("product-card-media") && document.body.style.overflow!=="hidden"','focus and scrolling restored');
 assert(await evaluate('document.activeElement?.classList.contains("product-card-media") && document.body.style.overflow!=="hidden"'),'Closing restores focus and scrolling');
 await click('.mf-best .product-card-media');await click('.product-image-lightbox-close');
 assert(await evaluate('!document.querySelector(".product-image-lightbox")'),'Close button dismisses the image');
 await click('.mf-best .product-card-media');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:2,y:2,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});
 await wait('!document.querySelector(".product-image-lightbox")','backdrop closes lightbox');
 assert(await evaluate('document.querySelector(".mf-conversion a").pathname==="/reservations"'),'Existing reservation route stays accessible');
 for(const width of [320,390,768,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await sleep(150);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`${width}px has no horizontal overflow`);
  await click('.mf-best .product-card-media');
  assert(await evaluate('(()=>{const b=document.querySelector(".product-image-lightbox").getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight})()'),`${width}px lightbox fits the screen`);
  await click('.product-image-lightbox-close');
  await capture(`results-${width}.png`);
 }
 await click('.language-switcher-trigger');await click('.language-switcher-menu button:last-child');
 await wait('document.querySelector("h1")?.textContent.includes("Finde dein") && !!document.querySelector(".mf-best article")','German results');
 assert(await evaluate('document.querySelector(".mf-best").textContent.includes("bevorzugten Stil")'),'Language switch translates structured explanations');
 await click('.language-switcher-trigger');await click('.language-switcher-menu button:nth-of-type(2)');
 await wait('document.querySelector("h1")?.textContent.includes("Find your") && !!document.querySelector(".mf-best article")','English results');
 await click('.mf-best .mf-match > a');await wait('location.pathname.startsWith("/product/")','product details');
 assert(true,'Actual product detail links open');
 await wait('!!document.querySelector(".pd-image-open")','product image');
 await click('.pd-image-open');await wait('!!document.querySelector(".product-image-lightbox[open]")','detail lightbox');
 assert(await evaluate('document.querySelector(".product-image-lightbox img").alt===document.querySelector("h1").textContent'),'Detail page opens the selected product image');
 await click('.product-image-lightbox-close');
 await evaluate('history.back()');await wait('!!document.querySelector(".mf-best article")','return');
 assert(await evaluate('document.querySelector(".mf-best").textContent.includes("Tikka")'),'Back from product retains fixed quiz answers');
 async function newQuiz(course,style,ingredient){
  await clickText('Start again');await wait('!!document.querySelector(".mf-welcome button")','restart');
  await click('.mf-welcome button');await wait('document.querySelector("#mf-question")?.textContent.includes("eat")','course');
  await click(`.mf-options button:nth-child(${course})`);await wait('document.querySelector("#mf-question")?.textContent.includes("style")','style');
  await click(`.mf-options button:nth-child(${style})`);await wait('document.querySelector("#mf-question")?.textContent.includes("ingredients")','ingredient');
  await click(`.mf-options button:nth-child(${ingredient})`);await wait('!!document.querySelector(".mf-best article")','new results');
 }
 await newQuiz(2,3,2);
 assert(await evaluate('document.querySelector(".mf-best").textContent.includes("Lentil Taco")'),'Smoky tacos with legumes select Lentil Taco');
 assert(await evaluate('document.querySelectorAll(".mf-match article").length>0 && [...document.querySelectorAll(".mf-match article")].every(e=>e.textContent.toLowerCase().includes("tacos"))'),'Taco results stay in the chosen course');
 await newQuiz(1,1,1);
 assert(await evaluate('document.querySelector(".mf-best").textContent.includes("Vegan Momos")'),'Crispy starter with plant protein selects Momos');
 await clickText('Start again');await wait('!!document.querySelector(".mf-welcome button")','dietary restart');
 assert(await evaluate('document.querySelector(".mf-dietary legend").textContent.includes("Do you need gluten-free") && !document.querySelector("details.mf-dietary")'),'Gluten-free Yes/No question is visible without expanding a disclosure');
 await click('.mf-dietary input[value=yes]');
 await click('.mf-welcome button');await wait('document.querySelector("#mf-question")?.textContent.includes("eat")','dietary course');
 assert(await evaluate('document.querySelector(".mf-dietary input[value=yes]").checked'),'Gluten-free selection persists when the quiz starts');
 await click('.mf-options button:nth-child(2)');await wait('document.querySelector("#mf-question")?.textContent.includes("style")','dietary style');
 await click('.mf-options button:nth-child(3)');await wait('document.querySelector("#mf-question")?.textContent.includes("ingredients")','dietary ingredients');
 await click('.mf-options button:nth-child(2)');await wait('document.querySelector(".mf-results .mf-state")?.textContent.includes("No suitable dishes")','strict dietary empty');
 assert(await evaluate('!document.querySelector(".mf-best article")'),'Gluten-free Yes excludes unlabelled tacos rather than relaxing the filter');
 await clickText('Back');await wait('!!document.querySelector(".mf-dietary input[value=yes]")','edit dietary');
 assert(await evaluate('document.querySelector(".mf-dietary input[value=yes]").checked'),'Back retains the gluten-free choice');
 await click('.mf-dietary input[value=no]');await click('.mf-options button:nth-child(2)');await wait('!!document.querySelector(".mf-best article")','unrestricted tacos');
 assert(await evaluate('document.querySelector(".mf-best").textContent.includes("Lentil Taco")'),'Choosing No removes the dietary restriction on the next recommendation');
 await send('Page.navigate',{url:'http://127.0.0.1:19111/admin/dashboard?tab=meal-finder'});
 await wait('!!document.querySelector(".mf-admin input[role=switch]")','admin switch');
 assert(await evaluate('document.querySelectorAll(".mf-admin input").length===1 && !document.querySelector(".mf-admin fieldset,.mf-admin select,.mf-admin textarea")'),'Admin contains only the feature switch, with no question/product/baseline editors');
 await click('.mf-admin input[role=switch]');await wait('document.querySelector(".mf-admin input[role=switch]").checked===false && !document.querySelector(".mf-admin input[role=switch]").disabled','disabled save');
 assert((await configuration()).enabled===false,'Admin switch persists OFF');
 await send('Page.navigate',{url:'http://127.0.0.1:19111/meal-finder'});await wait('document.querySelector(".meal-finder")?.textContent.includes("taking a break")','public disabled');
 assert(await evaluate('!document.querySelector(".mf-welcome")'),'Public finder respects the OFF switch');
 await send('Page.navigate',{url:'http://127.0.0.1:19111/admin/dashboard?tab=meal-finder'});await wait('!!document.querySelector(".mf-admin input[role=switch]")','admin return');
 await click('.mf-admin input[role=switch]');await wait('document.querySelector(".mf-admin input[role=switch]").checked===true && !document.querySelector(".mf-admin input[role=switch]").disabled','enabled save');
 assert((await configuration()).enabled===true,'Admin switch persists ON');
 assert(!calls.some(p=>/\/admin\/meal-finder\/(products|baseline|preview)/.test(p)),'No requests to retired editable finder endpoints');
 assert(errors.length===0,`No runtime exceptions: ${errors.join('; ')}`);
 console.log(JSON.stringify({checks:passes.length,passes,errors,screenshots:output},null,2));
}finally{
 try{const config=await configuration();config.enabled=initial.enabled;await save(config);}catch{}
 ws?.close();chrome.kill('SIGTERM');server.close();
}
