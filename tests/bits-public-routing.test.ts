import { describe, expect, it } from 'vitest';
import {
  buildPublishedBitsHrefMap,
  getBitAnchorId,
  getBitsPagePath,
  orderPublishedBitsForRouting,
  type BitPublicOrderItem
} from '../src/lib/bits-public-routing';

const item = (
  id: string,
  date: string,
  draft = false
): BitPublicOrderItem => ({
  id,
  date: new Date(date),
  draft
});

describe('bits public routing', () => {
  it('builds stable in-site page paths and anchors', () => {
    expect(getBitAnchorId('bits-2026-05-05-1200')).toBe('bit-bits-2026-05-05-1200');
    expect(getBitsPagePath(1)).toBe('/bits/');
    expect(getBitsPagePath(0)).toBe('/bits/');
    expect(getBitsPagePath(2)).toBe('/bits/page/2/');
  });

  it('orders published bits by date desc and id asc', () => {
    const ordered = orderPublishedBitsForRouting([
      item('draft-latest', '2026-05-05T12:00:00.000Z', true),
      item('same-day-z', '2026-05-04T12:00:00.000Z'),
      item('same-day-a', '2026-05-04T12:00:00.000Z'),
      item('older', '2026-05-03T12:00:00.000Z')
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual([
      'same-day-a',
      'same-day-z',
      'older'
    ]);
  });

  it('builds published href maps with page boundaries and without deployment base', () => {
    const hrefById = buildPublishedBitsHrefMap([
      item('draft-latest', '2026-05-05T12:00:00.000Z', true),
      item('published-c', '2026-05-04T12:00:00.000Z'),
      item('published-a', '2026-05-04T12:00:00.000Z'),
      item('published-b', '2026-05-03T12:00:00.000Z')
    ], 2);

    expect(hrefById.get('draft-latest')).toBeUndefined();
    expect(hrefById.get('published-a')).toBe('/bits/#bit-published-a');
    expect(hrefById.get('published-c')).toBe('/bits/#bit-published-c');
    expect(hrefById.get('published-b')).toBe('/bits/page/2/#bit-published-b');
  });
});
