import { BUSINESS } from '../seo/business';
import { PUBLIC_PATHS } from '../seo/metadata';
import { AGENT_TOOLS } from './tools';

type ToolResult = { content: { type: 'text'; text: string }[] };
export type BrowserTool = { name: string; description: string; inputSchema: unknown; annotations: unknown; execute: (input: unknown) => Promise<ToolResult> };
export type ModelContext = { registerTool: (tool: BrowserTool, options?: { signal: AbortSignal }) => unknown; unregisterTool?: (name: string) => void };

export function registerAgentTools(context?: ModelContext) {
  if (!context || typeof context.registerTool !== 'function') return () => {};
  const controller = new AbortController();
  const registered: string[] = [];
  const result = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
  const object = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Arguments must be an object.');
    return input as Record<string, unknown>;
  };
  for (const definition of AGENT_TOOLS) {
    const tool: BrowserTool = { ...definition, execute: async input => {
      const args = object(input);
      if (definition.name === 'get_restaurant_info') {
        if (Object.keys(args).length) throw new Error('This tool takes no arguments.');
        return result(JSON.stringify({ name: BUSINESS.name, url: BUSINESS.url, description: BUSINESS.description, telephone: BUSINESS.telephone, email: BUSINESS.email, address: BUSINESS.fullAddress, same_as: BUSINESS.sameAs }));
      }
      if (Object.keys(args).length !== 1 || typeof args.page !== 'string' || !PUBLIC_PATHS.some(path => path === args.page)) throw new Error('Choose a supported public page.');
      const path = args.page === '/' ? '/index.md' : `${args.page}.md`;
      const response = await fetch(path, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'text/markdown' } });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/markdown')) throw new Error('Public Markdown is unavailable.');
      return result(await response.text());
    } };
    try {
      registered.push(tool.name);
      void Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(() => { /* Experimental API may be disabled by browser policy. */ });
    } catch { /* Unsupported implementations must not interrupt the restaurant UI. */ }
  }
  return () => {
    controller.abort();
    for (const name of registered) { try { context.unregisterTool?.(name); } catch { /* Already removed by the signal. */ } }
  };
}
