import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { agentManifest, llmsText, markdownFile, pageMarkdown, serverCard } from './src/agents/documents';
import { catalogSnapshotPaths } from './src/seo/catalogSnapshot';
import { createServer, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { ASSETS } from './src/constants/assets';
import { metadataHtml, pageMetadata, PUBLIC_PATHS, SITE_URL, staticContent, type PageMetadata } from './src/seo/metadata';

function restaurantPages(): Plugin {
  let apiOrigin = '';
  let rendererCacheDir = '';
  return {
    name: 'restaurant-pages',
    enforce: 'post',
    configResolved(config) {
      rendererCacheDir = `${config.cacheDir}/prerender`;
      try { apiOrigin = new URL(config.env.VITE_API_BASE_URL).origin; } catch { /* Local API defaults need no preconnect. */ }
    },
    transformIndexHtml(html) {
      const meta = pageMetadata('/');
      const priorities = `<!--home-priority:start--><link rel="preload" as="image" href="${ASSETS.images.hero.heroBanner}" fetchpriority="high" /><!--home-priority:end-->`;
      const apiHint = apiOrigin ? `<link rel="preconnect" href="${apiOrigin}" crossorigin />` : '';
      return html.replace('<!--seo-head-->', `${metadataHtml(meta)}\n${apiHint}\n${priorities}`).replace('<!--seo-content-->', `<!--initial-html:start-->${staticContent(meta)}<!--initial-html:end-->`);
    },
    async generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('Missing production index.html');
      const shell = String(index.source);
      // A build-only Vite loader handles TSX/CSS without shipping a server or
      // adding the prerender entry to the browser's module graph.
      const renderer = await createServer({
        configFile: false,
        // The build-only server must never overwrite a running dev server's
        // optimized dependency metadata (which causes Outdated Optimize Dep 504s).
        cacheDir: rendererCacheDir,
        plugins: [react()],
        ssr: { noExternal: ['styled-components'] },
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      });
      try {
        const { renderInitialPage } = await renderer.ssrLoadModule('/src/prerender.tsx');
        const emitPage = async (fileName: string, meta: PageMetadata, route: string) => {
          const rendered = await renderInitialPage(route) as { html: string; styles: string };
          // Lazy routes keep their CSS out of the home request. Their own initial
          // HTML must nevertheless load that CSS before it can be painted.
          const css = new Set<string>();
          const seen = new Set<string>();
          const collectCss = (file: string) => {
            if (seen.has(file)) return;
            seen.add(file);
            const chunk = bundle[file];
            if (!chunk || chunk.type !== 'chunk') return;
            const metadata = (chunk as typeof chunk & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata;
            metadata?.importedCss.forEach(file => css.add(file));
            chunk.imports.forEach(collectCss);
          };
          const pageName = route === '/' ? 'Home'
            : route === '/meal-finder' ? 'MealFinder'
            : route.startsWith('/reservations') ? 'Reservations'
            : route.startsWith('/product/') ? 'ProductDetail'
            : route.startsWith('/admin/') ? 'AdminLogin'
            : route.slice(1, 2).toUpperCase() + route.slice(2);
          for (const chunk of Object.values(bundle)) {
            if (chunk.type === 'chunk' && chunk.facadeModuleId?.endsWith(`/pages/${pageName}.tsx`)) collectCss(chunk.fileName);
          }
          const links = [...css].filter(file => !shell.includes(`href="/${file}"`)).map(file => `<link rel="stylesheet" href="/${file}">`).join('');
          const pageShell = route === '/' ? shell : shell.replace(/<!--home-priority:start-->[\s\S]*?<!--home-priority:end-->/, '');
          const cssSource = [...rendered.styles.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
          if (!cssSource) throw new Error(`Missing initial stylesheet for ${route}`);
          const initialCss = `initial-pages/${fileName.replace(/\.html$/, '').replaceAll('/', '-')}.${createHash('sha256').update(cssSource).digest('hex').slice(0, 12)}.css`;
          this.emitFile({ type: 'asset', fileName: initialCss, source: cssSource });
          const initialStyleLink = `<link rel="stylesheet" data-initial-styles href="/${initialCss}">`;
          const source = pageShell.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, metadataHtml(meta))
            .replace('</head>', `${links}${initialStyleLink}</head>`)
            .replace('<div id="root">', '<div id="root" data-initial-render>')
            .replace(/<!--initial-html:start-->[\s\S]*?<!--initial-html:end-->/, () => `<!--initial-html:start-->${rendered.html}<!--initial-html:end-->`);
          if (fileName === 'index.html') index.source = source;
          else this.emitFile({ type: 'asset', fileName, source });
        };
        for (const path of PUBLIC_PATHS) await emitPage(path === '/' ? 'index.html' : `${path.slice(1)}/index.html`, pageMetadata(path), path);
        await emitPage('reservation-confirmation.html', pageMetadata('/reservations/confirmation'), '/reservations/confirmation');
        await emitPage('admin.html', { ...pageMetadata('/admin/login'), title: 'Admin | Bonefree' }, '/admin/login');
        const { title, description } = pageMetadata('/menu');
        await emitPage('dish.html', { title, description }, '/product/0');
      } finally { await renderer.close(); }
      // These error documents stay static: they must not mount a successful SPA.
      for (const status of [404, 410]) this.emitFile({ type: 'asset', fileName: `${status}.html`, source: `<!doctype html><html lang="pt-PT"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>${status} | Bonefree</title></head><body><main><h1>${status === 410 ? 'Esta página já não está disponível.' : 'Página não encontrada.'}</h1><p><a href="/menu">Explorar o menu</a> · <a href="/">Bonefree</a></p></main></body></html>` });
      for (const path of PUBLIC_PATHS) this.emitFile({ type: 'asset', fileName: markdownFile(path), source: pageMarkdown(path) });
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsText() });
      this.emitFile({ type: 'asset', fileName: 'agent-manifest.json', source: JSON.stringify(agentManifest()) });
      for (const fileName of ['.well-known/mcp/server-card.json', '.well-known/mcp.json']) this.emitFile({ type: 'asset', fileName, source: JSON.stringify(serverCard()) });
      const snapshotFile = process.env.BONEFREE_CATALOG_SNAPSHOT;
      const productPaths = snapshotFile ? catalogSnapshotPaths(JSON.parse(await readFile(snapshotFile, 'utf8'))) : [];
      if (!snapshotFile) this.warn('Product discovery: sitemap includes static pages only. Set BONEFREE_CATALOG_SNAPSHOT to a verified public catalog snapshot for all product URLs.');
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...PUBLIC_PATHS, ...productPaths].map(path => `<url><loc>${SITE_URL}${path}</loc></url>`).join('')}</urlset>` });
    },
  };
}

// Preserve both backdrop-filter spellings during CSS minification. Without
// explicit CSS targets Lightning CSS can retain only the prefixed declaration.
export default defineConfig({ plugins: [react(), restaurantPages()], build: { cssTarget: ['chrome100', 'firefox100', 'safari15'] } });
