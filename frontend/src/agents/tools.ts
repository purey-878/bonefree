import { PUBLIC_PATHS } from '../seo/metadata';

export const AGENT_TOOLS = [
  { name: 'get_restaurant_info', description: 'Read public Bonefree restaurant identity, contact details and verified profile links. Does not provide current opening hours or make bookings.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_public_page', description: 'Read a concise public page guide as Markdown. Menu prices, events and reservation availability must be checked on their live pages. Does not submit forms or create reservations.', inputSchema: { type: 'object', properties: { page: { type: 'string', enum: [...PUBLIC_PATHS] } }, required: ['page'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
] as const;
