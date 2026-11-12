import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { registerAgentTools, type ModelContext } from '../agents/register';
import { PUBLIC_PATHS } from '../seo/metadata';

export default function AgentTools() {
  const { pathname } = useLocation();
  const publicPage = PUBLIC_PATHS.some(path => path === pathname) || /^\/product\/[1-9]\d*$/.test(pathname);
  useEffect(() => {
    if (!publicPage) return;
    // Current draft uses document.modelContext; older browser trials used navigator.
    const context = (document as Document & { modelContext?: ModelContext }).modelContext
      ?? (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    return registerAgentTools(context);
  }, [publicPage]);
  return null;
}
