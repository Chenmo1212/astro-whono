import { describe, expect, it } from 'vitest';
import {
  applyBitsImageRowAsset,
  getEditableBitsImageRows,
  parseBitsImageRows,
  serializeBitsImageRows,
  updateBitsImageRowSource
} from '../src/components/admin/editor/bits/bits-image-rows';

describe('bits image row helpers', () => {
  it('parses editable rows from existing bits images JSON', () => {
    expect(parseBitsImageRows(JSON.stringify([
      {
        src: 'bits/demo.webp',
        width: 800,
        height: '600',
        alt: 'Demo'
      },
      'invalid'
    ]))).toEqual([
      {
        src: 'bits/demo.webp',
        width: '800',
        height: '600',
        alt: 'Demo'
      }
    ]);
  });

  it('keeps one empty editable row when the stored value has no images', () => {
    expect(getEditableBitsImageRows('')).toEqual([
      {
        src: '',
        width: '',
        height: '',
        alt: ''
      }
    ]);
    expect(getEditableBitsImageRows('{not json')).toHaveLength(1);
  });

  it('serializes only meaningful row fields back to imagesText', () => {
    expect(serializeBitsImageRows([
      {
        src: ' bits/demo.webp ',
        width: '800',
        height: '',
        alt: ' Demo '
      },
      {
        src: '',
        width: '',
        height: '',
        alt: ''
      }
    ])).toBe(JSON.stringify([
      {
        src: 'bits/demo.webp',
        width: '800',
        alt: 'Demo'
      }
    ], null, 2));
  });

  it('keeps authored alt text when changing the source manually', () => {
    expect(updateBitsImageRowSource({
      src: 'bits/old.webp',
      width: '800',
      height: '600',
      alt: 'Authored description'
    }, 'bits/new.webp')).toEqual({
      src: 'bits/new.webp',
      width: '',
      height: '',
      alt: 'Authored description'
    });
  });

  it('applies picked or uploaded asset metadata without dropping authored alt text', () => {
    expect(applyBitsImageRowAsset({
      src: 'bits/old.webp',
      width: '800',
      height: '600',
      alt: 'Authored description'
    }, {
      src: 'bits/new.webp',
      width: 1200,
      height: 900
    })).toEqual({
      src: 'bits/new.webp',
      width: '1200',
      height: '900',
      alt: 'Authored description'
    });
  });
});
