import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createServer, type ViteDevServer} from 'vite';

describe('Meal Finder landing and questionnaire rendering', () => {
 let server:ViteDevServer;
 let render:(locale:string, step:number)=>Promise<string>;
 beforeAll(async () => {
  server=await createServer({configFile:false,ssr:{noExternal:['styled-components']},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false,watch:null}});
  const module=await server.ssrLoadModule('/src/pages/mealFinderTestRender.tsx');
  render=module.render;
 },30000);
 afterAll(async()=>{await server?.close();});
 it('provides localized headings and direct booking and menu links before API loads',async()=>{
  for(const [locale,title] of [['pt-PT','Descobre o teu prato ideal'],['en-GB','Find your perfect vegan meal'],['de-DE','Finde dein perfektes veganes Gericht']]){
   const html=await render(locale,-2);
   expect(html).toContain(title);
   expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
   expect(html).toContain('href="/reservations"');
   expect(html).toContain('href="/menu"');
  }
 });
 it('renders answer buttons, progress, saved selections and dietary guidance',async()=>{
  const html=await render('en-GB',0);
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('<progress');
  expect(html).toContain('Question 1 of 3');
  expect(html).toContain('cross-contact');
  expect(html.match(/type="radio"/g)).toHaveLength(2);
  expect(html).toContain('Do you need gluten-free dishes?');
  expect(html).toContain('Yes, gluten-free');
  expect(html).not.toContain('Optional dietary preference');
  expect(html).not.toContain('<details');
 });
 it('uses fixed style questions without group or extras controls',async()=>{
  const html=await render('en-GB',1);
  expect(html).toContain('What style sounds good?');
  expect(html).not.toContain('?answers');
 });
 it('discards historical configurable quiz state',async()=>{
  const html=await render('en-GB',-3);
  expect(html).toContain('Find my meal');
  expect(html).not.toContain('<progress');
 });
 it('renders no admin question, product, baseline or preview editors',async()=>{
  const html=await render('en-GB',-4);
  expect(html).toContain('The three questions and matching rules are fixed');
  expect(html).not.toContain('<fieldset');
  expect(html).not.toContain('Preview saved');
 });

});
