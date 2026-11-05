import { restaurantSchema, SITE_IMAGE, SITE_URL, type PageMetadata } from './metadata';

export function applyPageMetadata(meta: PageMetadata) {
  document.title = meta.title;
  let schema = document.head.querySelector<HTMLScriptElement>('#restaurant-schema');
  if (meta.noindex) schema?.remove();
  else if (!schema) {
    schema = document.createElement('script');
    schema.id = 'restaurant-schema';
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify(restaurantSchema);
    document.head.append(schema);
  }
  const set = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
    let element = document.head.querySelector<HTMLMetaElement>(selector);
    if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.append(element); }
    element.content = content;
  };
  set('meta[name="description"]', 'name', 'description', meta.description);
  set('meta[name="robots"]', 'name', 'robots', meta.noindex ? 'noindex, follow' : 'index, follow');
  for (const prefix of ['og', 'twitter']) {
    const attribute = prefix === 'og' ? 'property' : 'name';
    for (const [key, value] of Object.entries({ title: meta.title, description: meta.description, image: SITE_IMAGE })) {
      set(`meta[${attribute}="${prefix}:${key}"]`, attribute, `${prefix}:${key}`, value);
    }
  }
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (meta.path) {
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = `${SITE_URL}${meta.path}`;
    set('meta[property="og:url"]', 'property', 'og:url', canonical.href);
  } else {
    canonical?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
  }
}
