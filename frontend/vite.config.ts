import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { ASSETS } from './src/constants/assets';
import { metadataHtml, pageMetadata, PUBLIC_PATHS, SITE_URL, staticContent, type PageMetadata } from './src/seo/metadata';

function restaurantPages(): Plugin {
  let apiOrigin = '';
  return {
    name: 'restaurant-pages',
    enforce: 'post',
    configResolved(config) {
      try { apiOrigin = new URL(config.env.VITE_API_BASE_URL).origin; } catch { /* Local API defaults need no preconnect. */ }
    },
    transformIndexHtml(html) {
      const meta = pageMetadata('/');
      const priorities = `<!--home-priority:start--><link rel="preload" as="image" href="${ASSETS.images.hero.heroBanner}" fetchpriority="high" /><!--home-priority:end-->`;
      const apiHint = apiOrigin ? `<link rel="preconnect" href="${apiOrigin}" crossorigin />` : '';
      return html.replace('<!--seo-head-->', `${metadataHtml(meta)}\n${apiHint}\n${priorities}`).replace('<!--seo-content-->', staticContent(meta));
    },
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('Missing production index.html');
      const shell = String(index.source);
      const emitPage = (fileName: string, meta: PageMetadata) => {
        const source = shell.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, metadataHtml(meta))
          .replace(/<!--home-priority:start-->[\s\S]*?<!--home-priority:end-->/, '')
          .replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${staticContent(meta)}</div>`);
        this.emitFile({ type: 'asset', fileName, source });
      };
      for (const path of PUBLIC_PATHS.filter(path => path !== '/')) emitPage(`${path.slice(1)}/index.html`, pageMetadata(path));
      emitPage('admin.html', { ...pageMetadata('/admin/login'), title: 'Admin | Bonefree' });
      const { title, description } = pageMetadata('/menu');
      emitPage('dish.html', { title, description });
      // These error documents stay static: they must not mount a successful SPA.
      for (const status of [404, 410]) this.emitFile({ type: 'asset', fileName: `${status}.html`, source: `<!doctype html><html lang="pt-PT"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>${status} | Bonefree</title></head><body><main><h1>${status === 410 ? 'Esta página já não está disponível.' : 'Página não encontrada.'}</h1><p><a href="/menu">Explorar o menu</a> · <a href="/">Bonefree</a></p></main></body></html>` });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PUBLIC_PATHS.map(path => `<url><loc>${SITE_URL}${path}</loc></url>`).join('')}</urlset>` });
    },
  };
}

export default defineConfig({ plugins: [react(), restaurantPages()] });
