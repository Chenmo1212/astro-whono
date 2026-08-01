import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:content', () => ({
  getCollection: vi.fn()
}));

import { getCollection } from 'astro:content';
import { getBitsSearchIndex } from '../src/lib/bits';
import { buildPublishedBitsHrefMap, type BitPublicOrderItem } from '../src/lib/bits-public-routing';

const getCollectionMock = vi.mocked(getCollection);
const date = (value: string) => new Date(value);

const bit = (id: string, value: string) => ({
  id,
  collection: 'bits',
  body: `Body for ${id}`,
  data: {
    title: `Bit ${id}`,
    description: '',
    date: date(value),
    tags: [] as string[],
    draft: false
  }
});

const toRoutingItem = (entry: ReturnType<typeof bit>): BitPublicOrderItem => ({
  id: entry.id,
  date: entry.data.date,
  draft: entry.data.draft === true
});

describe('bits queries', () => {
  beforeEach(() => {
    getCollectionMock.mockReset();
  });

  it('keeps the public search index order and hrefs aligned with the routing helper', async () => {
    const entries = [
      bit('same-day-z', '2026-05-04T12:00:00.000Z'),
      bit('newer', '2026-05-05T12:00:00.000Z'),
      bit('same-day-a', '2026-05-04T12:00:00.000Z')
    ];
    getCollectionMock.mockResolvedValue(entries as never);

    const index = await getBitsSearchIndex(2);
    const hrefById = buildPublishedBitsHrefMap(entries.map(toRoutingItem), 2);

    expect(index.map((item) => item.key)).toEqual(['newer', 'same-day-a', 'same-day-z']);
    expect(index.map((item) => item.href)).toEqual(index.map((item) => hrefById.get(item.key)));
  });
});
