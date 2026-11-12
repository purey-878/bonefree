import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentManifest, llmsText, markdownFile, pageMarkdown, serverCard } from './documents';
import { registerAgentTools, type BrowserTool } from './register';
import { PUBLIC_PATHS } from '../seo/metadata';

afterEach(() => vi.unstubAllGlobals());
describe('public agent discovery and guides', () => {
  it('publishes every canonical public page with readable Markdown and real contact links', () => {
    expect(llmsText()).toMatch(/^# Bonefree\n\n> /);
    const manifest = agentManifest();
    for (const path of PUBLIC_PATHS) {
      expect(llmsText()).toContain(`https://bonefree.pt/${markdownFile(path)}`);
      expect(pageMarkdown(path)).toMatch(/^# .+\n\n> /);
      expect(pageMarkdown(path)).toContain('tel:+351968107702');
      expect(pageMarkdown(path)).toContain(`Canonical: https://bonefree.pt${path}`);
      expect(manifest.pages[path].file).toBe(markdownFile(path));
    }
    expect(Object.keys(manifest.pages)).not.toContain('/admin/dashboard');
    expect(Object.keys(manifest.pages)).not.toContain('/reservations/confirmation');
  });
  it('advertises exactly the implemented read-only tools without inventing live data', () => {
    const card = serverCard();
    expect(card.transport.endpoint).toBe('https://bonefree.pt/mcp');
    expect(card.capabilities).toEqual({ tools: { listChanged: false } });
    expect(card.tools.map(tool => tool.name)).toEqual(['get_restaurant_info', 'get_public_page']);
    expect(card.tools.every(tool => tool.annotations.readOnlyHint)).toBe(true);
    expect(pageMarkdown('/events')).not.toContain('openingHours');
  });
});
describe('browser WebMCP registration', () => {
  it('works without an experimental browser API', () => { expect(registerAgentTools()).toBeTypeOf('function'); });
  it('registers callable tools, validates inputs, reads Markdown and cleans up', async () => {
    const tools: BrowserTool[] = [];
    const unregisterTool = vi.fn();
    const cleanup = registerAgentTools({ registerTool: tool => tools.push(tool), unregisterTool });
    expect(tools).toHaveLength(2);
    const info = await tools[0].execute({});
    expect(JSON.parse(info.content[0].text).telephone).toBe('+351968107702');
    await expect(tools[0].execute({ token: 'private' })).rejects.toThrow();
    await expect(tools[1].execute({ page: '/admin/dashboard' })).rejects.toThrow();
    await expect(tools[1].execute({ page: '/menu', extra: true })).rejects.toThrow();
    const fetcher = vi.fn().mockResolvedValue(new Response('# Menu', { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }));
    vi.stubGlobal('fetch', fetcher);
    expect((await tools[1].execute({ page: '/menu' })).content[0].text).toBe('# Menu');
    expect(fetcher).toHaveBeenCalledWith('/menu.md', expect.objectContaining({ credentials: 'omit' }));
    cleanup();
    expect(unregisterTool.mock.calls.map(call => call[0])).toEqual(['get_restaurant_info', 'get_public_page']);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('keeps the current registration after StrictMode cleanup and remount', async () => {
    const active = new Map<string, BrowserTool>();
    const context = { registerTool: (tool: BrowserTool) => { active.set(tool.name, tool); }, unregisterTool: (name: string) => { active.delete(name); } };
    const first = registerAgentTools(context); first();
    const second = registerAgentTools(context);
    await Promise.resolve(); await Promise.resolve();
    expect(active.size).toBe(2);
    expect(JSON.parse((await active.get('get_restaurant_info')!.execute({})).content[0].text).name).toBe('Bonefree');
    second(); expect(active.size).toBe(0);
  });
  it('rejects HTML fallbacks and does not break pages when browser registration is denied', async () => {
    const tools: BrowserTool[] = [];
    registerAgentTools({ registerTool: tool => tools.push(tool) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>404</html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(tools[1].execute({ page: '/' })).rejects.toThrow('Markdown');
    expect(() => registerAgentTools({ registerTool: () => { throw new Error('Policy denied'); } })).not.toThrow();
    const cleanup = registerAgentTools({ registerTool: () => Promise.reject(new Error('Unsupported')) });
    await Promise.resolve(); cleanup();
  });
});
