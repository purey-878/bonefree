export const SITE_URL = 'https://bonefree.pt';
export const SITE_IMAGE = `${SITE_URL}/assets/images/bonefree-logo.png`;
export const PUBLIC_PATHS = ['/', '/menu', '/about', '/events', '/contact', '/privacy'] as const;
export type PublicPath = typeof PUBLIC_PATHS[number];
type Locale = 'pt-PT' | 'en-GB' | 'de-DE';
export type PageMetadata = { title: string; description: string; path?: string; noindex?: boolean };

const copy: Record<Locale, Record<PublicPath, [string, string]>> = {
  'pt-PT': {
    '/': ['Bonefree | Restaurante Vegan na Costa da Caparica', 'Descobre o Bonefree, restaurante vegan na Costa da Caparica. Pratos 100% vegetais, cocktails e um ambiente descontraído. Explora o nosso menu.'],
    '/menu': ['Menu vegan | Bonefree', 'Explora os pratos e bebidas do Bonefree: ingredientes, informação nutricional e opções vegan na Costa da Caparica.'],
    '/about': ['Sobre o restaurante | Bonefree', 'Conhece o Bonefree, restaurante e bar vegan na Costa da Caparica.'],
    '/events': ['Eventos | Bonefree', 'Descobre os eventos e as novidades do restaurante e bar Bonefree na Costa da Caparica.'],
    '/contact': ['Contactos e localização | Bonefree', 'Encontra o Bonefree na Costa da Caparica e fala com a nossa equipa.'],
    '/privacy': ['Privacidade e armazenamento | Bonefree', 'Saiba como este website utiliza o armazenamento do navegador e os serviços externos.'],
  },
  'en-GB': {
    '/': ['Bonefree | Vegan Restaurant in Costa da Caparica', 'Discover Bonefree, a vegan restaurant in Costa da Caparica. Vegan dishes, cocktails and a relaxed atmosphere. Explore our menu.'],
    '/menu': ['Vegan menu | Bonefree', 'Explore Bonefree dishes and drinks, ingredients, nutritional information and vegan options in Costa da Caparica.'],
    '/about': ['About the restaurant | Bonefree', 'Meet Bonefree, a vegan restaurant and bar in Costa da Caparica.'],
    '/events': ['Events | Bonefree', 'Discover events and news from Bonefree restaurant and bar in Costa da Caparica.'],
    '/contact': ['Contact and location | Bonefree', 'Find Bonefree in Costa da Caparica and speak with our team.'],
    '/privacy': ['Privacy and storage | Bonefree', 'How this website uses browser storage and external services.'],
  },
  'de-DE': {
    '/': ['Bonefree | Veganes Restaurant in Costa da Caparica', 'Entdecken Sie Bonefree, ein veganes Restaurant in Costa da Caparica. Vegane Gerichte, Cocktails und eine entspannte Atmosphäre.'],
    '/menu': ['Vegane Speisekarte | Bonefree', 'Entdecken Sie Gerichte, Getränke, Zutaten und Nährwertinformationen bei Bonefree in Costa da Caparica.'],
    '/about': ['Über das Restaurant | Bonefree', 'Lernen Sie Bonefree kennen, ein veganes Restaurant mit Bar in Costa da Caparica.'],
    '/events': ['Veranstaltungen | Bonefree', 'Veranstaltungen und Neuigkeiten aus dem Restaurant und der Bar Bonefree in Costa da Caparica.'],
    '/contact': ['Kontakt und Standort | Bonefree', 'Finden Sie Bonefree in Costa da Caparica und sprechen Sie mit unserem Team.'],
    '/privacy': ['Datenschutz und Speicherung | Bonefree', 'Informationen zur Browserspeicherung und zu externen Diensten dieser Website.'],
  },
};

export function pageMetadata(pathname: string, locale: string = 'pt-PT'): PageMetadata {
  const language = Object.hasOwn(copy, locale) ? locale as Locale : 'pt-PT';
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_PATHS.includes(path as PublicPath)) {
    const [title, description] = copy[language][path as PublicPath];
    return { title, description, path };
  }
  if (/^\/product\/[1-9]\d*$/.test(path)) {
    return { title: copy[language]['/menu'][0], description: copy[language]['/menu'][1], path };
  }
  return { title: 'Bonefree', description: copy[language]['/'][1], noindex: true };
}

// Only business identity supplied by the project; no unverified hours, ratings,
// reservation actions, address or price claims.
export const restaurantSchema = {
  '@context': 'https://schema.org', '@type': 'Restaurant',
  '@id': `${SITE_URL}/#restaurant`, name: 'Bonefree', url: `${SITE_URL}/`,
  image: SITE_IMAGE, servesCuisine: 'Vegan', hasMenu: `${SITE_URL}/menu`,
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function metadataHtml(meta: PageMetadata) {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = meta.path ? `${SITE_URL}${meta.path}` : undefined;
  return `<!--seo:start-->
<title>${title}</title>
<meta name="description" content="${description}" />
<meta name="robots" content="${meta.noindex ? 'noindex, follow' : 'index, follow'}" />
${url ? `<link rel="canonical" href="${escapeHtml(url)}" />` : ''}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Bonefree" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
${url ? `<meta property="og:url" content="${escapeHtml(url)}" />` : ''}
<meta property="og:image" content="${SITE_IMAGE}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${SITE_IMAGE}" />
${meta.noindex ? '' : `<script id="restaurant-schema" type="application/ld+json">${JSON.stringify(restaurantSchema)}</script>`}
<!--seo:end-->`;
}

export function staticContent(meta: PageMetadata) {
  return `<main><h1>${escapeHtml(meta.title)}</h1><p>${escapeHtml(meta.description)}</p><nav aria-label="Bonefree"><a href="/">Bonefree</a> · <a href="/menu">Menu</a> · <a href="/about">Sobre</a> · <a href="/events">Eventos</a> · <a href="/contact">Contactos</a> · <a href="/privacy">Privacidade</a></nav></main>`;
}
