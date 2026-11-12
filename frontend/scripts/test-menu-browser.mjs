/** Local production-build QA with an isolated 70-dish API fixture; no production writes. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bonefree-menu-'));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(root, url.pathname.startsWith('/product/') ? 'dish.html' : url.pathname.startsWith('/admin/') ? 'admin.html' : 'index.html');
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/markdown', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.avif': 'image/avif', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(19011, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=19013', `--user-data-dir=${output}/profile`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const passes = [], errors = [], calls = [];
let failPage = 0;
try {
  let tabs;
  for (let i = 0; i < 100; i++) { try { tabs = await (await fetch('http://127.0.0.1:19013/json/list')).json(); break; } catch { await sleep(100); } }
  if (!tabs) throw new Error('Chrome CDP unavailable');
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const catalog = Array.from({ length: 70 }, (_, i) => {
    const id = i + 1;
    return { id, id_display: `PRD-${id}`, name: `Dish ${String(id).padStart(2, '0')}`, description: 'A vegan dish.', category_id: id % 2 + 1, category: id % 2 ? 'Tacos' : 'Burgers', price: id === 1 ? 10 : id, effective_starting_price: id === 1 ? 10 : id, available: id !== 70, highlighted: false, media: [], ingredients: [], portions: id === 1 ? [{ id: 1, label: '3', price: 10, is_available: true }, { id: 2, label: '6', price: 16, is_available: true }] : [], extras: [], gluten_free: id % 3 === 0, contains_alcohol: false };
  });
  function fixture(url) {
    const u = new URL(url), p = u.searchParams;
    if (/\/products\/\d+$/.test(u.pathname)) return catalog.find(item => item.id === Number(u.pathname.split('/').pop()));
    if (/\/products\/?$/.test(u.pathname)) {
      const n = Number(p.get('page') || 1), size = Number(p.get('per_page') || 20);
      calls.push({ page: n, size, query: u.search });
      if (failPage === n) { failPage = 0; return null; }
      let items = catalog.filter(item => (!p.get('search') || item.name.toLowerCase().includes(p.get('search').toLowerCase())) && (!p.get('category_id') || item.category_id === Number(p.get('category_id'))) && (!p.get('max_price') || item.price <= Number(p.get('max_price'))) && (!p.get('min_price') || item.price >= Number(p.get('min_price'))) && (p.get('special') !== 'gluten_free' || item.gluten_free));
      if (p.get('sort') === 'price_desc') items.sort((a, b) => b.price - a.price);
      if (p.get('sort') === 'price_asc') items.sort((a, b) => a.price - b.price);
      return { items: items.slice((n - 1) * size, n * size), page: n, per_page: size, total: items.length, total_pages: Math.ceil(items.length / size), facets: { total_products: 70, max_price: 70, categories: [{ category_id: 1, category_display_id: 'CAT-1', name: 'Burgers', count: 35 }, { category_id: 2, category_display_id: 'CAT-2', name: 'Tacos', count: 35 }] } };
    }
    if (u.pathname.endsWith('/theme')) return { theme_id: 'normal', colors: {}, decoration_enabled: true, decoration_intensity: 2, custom_decorations: [], config: { id: 'normal', name: 'Bonefree', colors: { primary: '#7BAF4B', accent: '#FDCD43', secondary: '#076050', background: '#f8faf6', surface: '#ffffff', text: '#17211d', text_muted: '#65746c', border: '#dfe8dc', price_highlight: '#b42318' }, background: { type: 'solid', value: '#f8faf6' }, decorations: [], ui: { border_radius: '8px', button_style: 'rounded', card_shadow: '0 18px 48px rgba(23,33,29,.1)' } } };
    if (u.pathname.endsWith('/company-details')) return { brand_name: 'Bonefree', description: 'Vegan restaurant', address: 'Caparica', phone: '', email: '' };
    if (u.pathname.endsWith('/social-media')) return { links: [] };
    if (u.pathname.endsWith('/events')) return { events: [] };
    if (u.pathname.endsWith('/chef-special')) return { product_id: null };
    return {};
  }
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Fetch.requestPaused') {
      const data = fixture(m.params.request.url);
      const delay = new URL(m.params.request.url).searchParams.get('search') === 'Dish 0' ? 700 : 30;
      setTimeout(() => { send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: data === null ? 500 : 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(data ?? { detail: 'Test failure' })).toString('base64') }).catch(() => {}); }, delay);
    }
  });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = async (expression, label) => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(100); } throw new Error(`Timeout: ${label}; ${await evaluate('document.body.innerText.slice(-800)')}`); };
  const assert = (value, label) => { if (!value) throw new Error(label); passes.push(label); };
  const count = () => evaluate('document.querySelectorAll(".menu-product-card").length');
  const bottom = () => evaluate('window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})');
  const input = value => evaluate(`(()=>{const e=document.getElementById('menu-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await send('Page.enable'); await send('Runtime.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.bonefree.pt/*', requestStage: 'Request' }] });
  // Supported-API test double only: production never installs a WebMCP polyfill.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__agentTools=new Map();Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool(tool,options){window.__agentTools.set(tool.name,tool);options?.signal.addEventListener('abort',()=>window.__agentTools.delete(tool.name),{once:true});},unregisterTool(name){window.__agentTools.delete(name);}}});` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('bonefree_locale','en-GB');sessionStorage.clear();history.scrollRestoration='manual';window.__menuObservers=new Set();const NativeObserver=IntersectionObserver;window.IntersectionObserver=class extends NativeObserver{observe(e){if(e.classList.contains('menu-feed-status'))window.__menuObservers.add(this);super.observe(e)}disconnect(){window.__menuObservers.delete(this);super.disconnect()}};" });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:19011/menu' });
  await wait('document.querySelectorAll(".menu-product-card").length===16', 'initial batch');
  await sleep(600);
  assert(calls.length === 1 && calls[0].size === 16, 'Initial rendering requests exactly one 16-product page');
  await wait('window.__agentTools.size===2', 'public browser tools');
  assert(await evaluate('!document.querySelector("[data-initial-styles]")'), 'External initial styles are removed after the client page commits');
  assert(await evaluate('window.__agentTools.size===2'), 'WebMCP registers two read-only tools on the public route');
  assert(await evaluate('(async()=>JSON.parse((await window.__agentTools.get("get_restaurant_info").execute({})).content[0].text).telephone==="+351968107702")()'), 'Browser restaurant tool returns verified contact details');
  assert(await evaluate('(async()=>(await window.__agentTools.get("get_public_page").execute({page:"/menu"})).content[0].text.startsWith("# "))()'), 'Browser page tool reads the actual Markdown file');
  assert(await evaluate('(async()=>{try{await window.__agentTools.get("get_public_page").execute({page:"/admin/dashboard"});return false}catch{return true}})()'), 'Browser tools reject private pages');

  assert(await evaluate('getComputedStyle(document.querySelector(".menu-category-list")).backgroundColor === "rgba(0, 0, 0, 0)" && getComputedStyle(document.querySelector(".menu-category-list")).backdropFilter === "none"'), 'Category row is transparent before scrolling');
  assert(await evaluate('document.querySelector(".menu-product-card").innerText.includes("€16.00")'), 'Explicit size prices preserved');
  failPage = 2; await bottom(); await wait('!!document.querySelector(".menu-feed-status [role=alert]")', 'page error');
  assert(await count() === 16, 'Failed append preserves existing cards');
  await click('.menu-feed-status button'); await wait('document.querySelectorAll(".menu-product-card").length===32', 'retry');
  assert(calls.filter(call => call.page === 2).length === 2, 'Retry requests the failed page once again');
  await bottom(); await wait('document.querySelectorAll(".menu-product-card").length===48', 'third batch');
  await bottom(); await sleep(700);
  assert(await count() === 48, 'Automatic loading pauses after three batches');
  await evaluate('window.scrollTo({top:2400,behavior:"instant"})'); await sleep(200);
  assert(await evaluate('Math.abs(document.querySelector(".menu-category-list").getBoundingClientRect().top)<2'), 'Mobile categories remain sticky flush to the viewport top');
  await wait('document.querySelector(".menu-category-list").classList.contains("is-pinned")', 'category observer after scrolling');
  assert(await evaluate('(()=>{const row=document.querySelector(".menu-category-list");const r=row.getBoundingClientRect();return row.classList.contains("is-pinned") && Math.abs(r.left)<1 && Math.abs(r.right-innerWidth)<1 && getComputedStyle(row).backdropFilter.includes("blur")})()'), 'Pinned category glass background spans the full viewport');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), '390px menu has no horizontal overflow');
  await send('Page.captureScreenshot', { format: 'png' }).then(result => fs.writeFileSync(path.join(output, 'mobile-sticky.png'), Buffer.from(result.data, 'base64')));
  await bottom(); await sleep(200);
  assert(await evaluate('document.querySelector("footer").getBoundingClientRect().top<innerHeight'), 'Footer remains reachable after automatic batches');
  await click('.menu-feed-status button'); await wait('document.querySelectorAll(".menu-product-card").length===64', 'manual fourth batch');
  await click('.menu-feed-status button'); await wait('document.querySelectorAll(".menu-product-card").length===70', 'final batch');
  assert(await evaluate('!document.querySelector(".menu-feed-status button")'), 'Final page removes load control');
  assert(await evaluate('new Set([...document.querySelectorAll(".menu-product-card h3")].map(e=>e.textContent)).size===70'), 'All 70 products appear exactly once');
  await evaluate('window.scrollTo({top:2400,behavior:"instant"})'); await sleep(200);
  await wait('Math.abs(scrollY - 2400) < 10', 'menu scroll before detail');
  const before = calls.filter(call => call.size === 16).length;
  await click('.menu-product-card a[href="/product/1"]'); await wait('!!document.querySelector(".pd-page")', 'product detail');
  assert(await evaluate('window.__menuObservers.size===0'), 'Menu observers are disconnected after leaving the route');
  await wait(`!document.querySelector('link[rel="alternate"][type="text/markdown"]')`, 'product alternate removed');
  assert(await evaluate('JSON.parse(document.getElementById("restaurant-schema").textContent)["@graph"][2].url==="https://bonefree.pt"+location.pathname'), 'Client navigation updates WebPage schema without advertising missing product Markdown');

  await evaluate('history.back()'); await wait('document.querySelectorAll(".menu-product-card").length===70', 'restored menu'); await sleep(300);
  await wait('Math.abs(scrollY - 2400) < 10', 'restored scroll position');
  assert(Math.abs(await evaluate('scrollY') - 2400) < 10, 'Back from dish restores loaded products and exact scroll position');
  assert(calls.filter(call => call.size === 16).length === before, 'Restoring menu does not refetch loaded pages');
  await input('Dish 0'); await sleep(400); await input('Dish 6');
  await wait('document.querySelectorAll(".menu-product-card").length===10 && document.querySelector(".menu-product-card h3").textContent.includes("60")', 'latest search');
  await sleep(800);
  assert(await evaluate('[...document.querySelectorAll(".menu-product-card h3")].every(e=>e.textContent.includes("6"))'), 'Late search response cannot overwrite current search');
  assert(await evaluate('location.search.includes("q=Dish+6")'), 'Search remains URL synchronized');
  await input('no-match'); await wait('!!document.querySelector(".menu-empty-state")', 'empty result');
  assert(await count() === 0, 'Empty results clear old cards');
  await input(''); await wait('document.querySelectorAll(".menu-product-card").length===16', 'clear search');
  await click('.menu-category-list button:nth-child(2)'); await wait('document.querySelectorAll(".menu-product-card").length===16 && location.search.includes("category=1")', 'category');
  assert(await evaluate('[...document.querySelectorAll(".menu-product-card h3")].every(e=>Number(e.textContent.match(/[0-9]+/)[0])%2===0)'), 'Category change resets to matching first page');
  await evaluate("history.pushState({},'', '/menu?category=1&min_price=10&max_price=25&special=gluten_free&sort=price_desc');dispatchEvent(new PopStateEvent('popstate'))");
  await wait('document.querySelectorAll(".menu-product-card").length===3', 'combined URL filters');
  assert(await evaluate('[...document.querySelectorAll(".menu-product-card h3")].map(e=>e.textContent.match(/[0-9]+/)[0]).join() === "24,18,12"'), 'URL price, dietary filter and server sorting combine correctly');
  await evaluate('history.back()'); await wait('document.querySelectorAll(".menu-product-card").length===16 && !location.search.includes("sort=")', 'filter Back');
  await evaluate('history.forward()'); await wait('document.querySelectorAll(".menu-product-card").length===3 && location.search.includes("sort=price_desc")', 'filter Forward');
  assert(true, 'Browser Back/Forward restores URL filter state');
  await click('.language-switcher-trigger');
  await evaluate('document.querySelectorAll(".language-switcher-menu [role=menuitemradio]")[2].click()');
  await wait('document.documentElement.lang==="de-DE" && document.querySelectorAll(".menu-product-card").length===3', 'German locale');
  assert(calls.some(call=>call.query.includes('locale=de-DE') && call.page===1), 'Language switch reloads the matching first page in its own locale');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), '320px menu has no horizontal overflow');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate('window.scrollTo({top:0,behavior:"instant"})'); await sleep(200);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Desktop menu has no horizontal overflow');
  assert(await evaluate('getComputedStyle(document.querySelector(".menu-sidebar")).position==="sticky"'), 'Desktop filter sidebar remains sticky');
  await send('Page.captureScreenshot', { format: 'png' }).then(result => fs.writeFileSync(path.join(output, 'desktop.png'), Buffer.from(result.data, 'base64')));
  await evaluate("history.pushState({},'', '/admin/login');dispatchEvent(new PopStateEvent('popstate'))");
  await wait(`document.querySelector('meta[name="robots"]')?.content.includes("noindex") && window.__agentTools?.size===0`, 'private route cleanup');
  assert(await evaluate('window.__agentTools.size===0 && !document.getElementById("restaurant-schema")'), 'Private routes remove public browser tools and structured data');
  assert(errors.length === 0, 'No browser runtime exceptions');
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passes, calls, errors }, null, 2));
  console.log(JSON.stringify({ passes, calls, output }, null, 2));
} catch (error) { console.error(JSON.stringify({ errors, calls, output }, null, 2)); throw error; } finally { ws?.close(); chrome.kill(); server.close(); }
