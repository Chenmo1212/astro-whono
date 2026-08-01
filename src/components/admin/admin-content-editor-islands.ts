import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import type { AdminContentEditorIslandKey } from './admin-content-editor-registry';

export type AdminContentEditorIslandComponent = AstroComponentFactory;

export const ADMIN_CONTENT_EDITOR_ISLAND_KEYS = ['essay', 'bits', 'memo', 'about'] as const satisfies readonly AdminContentEditorIslandKey[];

export const loadAdminContentEditorIsland = async (
  island: AdminContentEditorIslandKey
): Promise<AdminContentEditorIslandComponent> => {
  switch (island) {
    case 'essay':
      return (await import('./editor/essay/EssayEditorIsland.astro')).default;
    case 'bits':
      return (await import('./editor/bits/BitsEditorIsland.astro')).default;
    case 'memo':
      return (await import('./editor/fixed-page/MemoEditorIsland.astro')).default;
    case 'about':
      return (await import('./editor/fixed-page/AboutEditorIsland.astro')).default;
    default: {
      const exhaustive: never = island;
      throw new Error(`Unsupported admin content editor island: ${exhaustive}`);
    }
  }
};
