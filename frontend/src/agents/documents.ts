/** Build-only concise guides. No guessed hours, events, prices or legal terms. */
import { BUSINESS } from '../seo/business';
import { pageMetadata, PUBLIC_PATHS, SITE_URL, type PublicPath } from '../seo/metadata';
import { AGENT_TOOLS } from './tools';

const bodies: Record<PublicPath, string> = {
  '/': `Bonefree is a vegan restaurant and bar in Costa da Caparica, Portugal. The restaurant serves plant-based food and cocktails.\n\nUse the menu for current dishes, ingredients and prices. Ask Paulo helps visitors choose starters, tacos or mains. Use the reservation page to check whether online reservations are enabled and to choose a date, time and party size. A link to the reservation form does not confirm a booking.`,
  '/menu': `Browse the public menu for current dishes, descriptions, available portions, ingredients and prices. Search, categories and dietary labels are available on the live menu.\n\nThis guide is not a frozen menu or price list. Product details are linked from the live menu. Complete product discovery is provided by the verified release sitemap when a current public catalog snapshot is supplied.`,
  '/about': `Bonefree is a vegan restaurant and bar in Costa da Caparica, Portugal. It serves plant-based dishes and cocktails. Read the restaurant's about page for its story and photographs.`,
  '/events': `The events page lists restaurant events when they are published. Check that page or contact the team for current dates, details and availability; this guide does not assert that any event is scheduled.`,
  '/contact': `Find the restaurant at ${BUSINESS.fullAddress}.\n\n- [Call ${BUSINESS.phoneDisplay}](tel:${BUSINESS.telephone})\n- [Email the team](mailto:${BUSINESS.email})\n\nContact the team for current opening hours, accessibility, allergies and other dietary needs.`,
  '/privacy': `The privacy page explains browser storage, administrator authentication, external services, map consent and reservation data. Public browsing does not require an account. Reservation passes are private; do not publish or index their tokens or confirmation URLs. Read the current privacy page for the full notice.`,
  '/reservations': `Use the reservation page to check available dates, times and party sizes when online reservations are enabled. The visitor must review and submit the actual form; this guide and the agent tools cannot make, cancel or confirm reservations.\n\nA private confirmation pass is not a public page. Keep its URL and token private. For unavailable dates or other requests, contact the restaurant directly.`,
  '/meal-finder': `Ask Paulo suggests available dishes from starters, tacos and mains using three fixed questions: course, style and preferred ingredients. Visitors can choose whether to filter to catalog-labelled gluten-free dishes. Catalog labels do not establish cross-contact safety; confirm allergies and dietary needs with staff.\n\nThe finder may be switched off by the restaurant. Results and current prices are supplied by the live catalog. Answer combinations are not separate public pages.`,
};
export const markdownFile = (path: string) => `${path === '/' ? 'index' : path.slice(1)}.md`;
export function pageMarkdown(path: PublicPath) {
  const meta = pageMetadata(path, 'en-GB');
  return `# ${meta.title}\n\n> ${meta.description}\n\n${bodies[path]}\n\n## Restaurant contact\n\n${BUSINESS.fullAddress}\n\n[Telephone](tel:${BUSINESS.telephone}) · [Email](mailto:${BUSINESS.email})\n\n## Official pages\n\n${PUBLIC_PATHS.map(p => `- [${pageMetadata(p, 'en-GB').title}](${SITE_URL}${p})`).join('\n')}\n\n[Facebook](${BUSINESS.sameAs[0]}) · [Instagram](${BUSINESS.sameAs[1]})\n\nCanonical: ${SITE_URL}${path}\n`;
}
export function agentManifest() {
  return {
    business: { name: BUSINESS.name, url: BUSINESS.url, description: BUSINESS.description, telephone: BUSINESS.telephone, email: BUSINESS.email, address: BUSINESS.fullAddress, same_as: BUSINESS.sameAs },
    pages: Object.fromEntries(PUBLIC_PATHS.map(path => [path, { file: markdownFile(path), title: pageMetadata(path, 'en-GB').title }])),
    protocol_version: '2025-11-25', server_info: { name: 'bonefree-public-guide', title: 'Bonefree public restaurant guide', version: '1.0.0' },
    tools: AGENT_TOOLS,
  };
}
export function serverCard() {
  const manifest = agentManifest();
  return { version: '1.0', protocolVersion: manifest.protocol_version, serverInfo: manifest.server_info, description: 'Read-only build-time restaurant identity and public page guides. No bookings, customer data, live prices or administrator operations.', documentationUrl: `${SITE_URL}/llms.txt`, transport: { type: 'streamable-http', endpoint: `${SITE_URL}/mcp` }, capabilities: { tools: { listChanged: false } }, authentication: { required: false, schemes: [] }, tools: AGENT_TOOLS };
}
export function llmsText() {
  return `# Bonefree\n\n> Vegan restaurant and bar in Costa da Caparica, Portugal. Official public information, menu links and restaurant contact details.\n\n${BUSINESS.description}\n\n## Pages\n\n${PUBLIC_PATHS.map(path => `- [${pageMetadata(path, 'en-GB').title}](${SITE_URL}/${markdownFile(path)}): ${pageMetadata(path, 'en-GB').description}`).join('\n')}\n\n## Discovery and tools\n\n- [Sitemap](${SITE_URL}/sitemap.xml): canonical public URLs; product coverage depends on the verified release snapshot.\n- [MCP server card](${SITE_URL}/.well-known/mcp/server-card.json): read-only guide tools over Streamable HTTP at /mcp.\n- [Public API documentation](https://api.bonefree.pt/docs): live catalog and supported public API operations.\n\n## Contact and profiles\n\n- [Telephone](tel:${BUSINESS.telephone})\n- [Email](mailto:${BUSINESS.email})\n- [Facebook](${BUSINESS.sameAs[0]})\n- [Instagram](${BUSINESS.sameAs[1]})\n\n## Freshness and privacy\n\nThese Markdown guides describe the public website at build time. Check the live menu, events and reservation pages for current information. Agent tools only read guides; they cannot create bookings. Do not index administrator pages, reservation passes, tokens, or quiz answers. Catalog gluten-free labels are not a cross-contact guarantee.\n`;
}
