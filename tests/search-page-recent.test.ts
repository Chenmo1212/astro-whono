import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const searchPagePath = new URL('../src/components/SearchPageView.astro', import.meta.url);

describe('search page recent content', () => {
  it('does not discard collection entries before combining and sorting by date', async () => {
    const source = await readFile(searchPagePath, 'utf8');

    expect(source).toContain('const recentEssays = await getVisibleEssays();');
    expect(source).toContain("const recentBits = await getPublished('bits');");
    expect(source).toContain("const recentMemos = await getPublished('memo');");
    expect(source).toContain('].sort((a, b) => b.date.valueOf() - a.date.valueOf()).slice(0, 5);');
  });
});
