import { describe, expect, it } from 'vitest';
import {
  isBitsImageSource,
  normalizeBitsImageSource,
  normalizeBitsLocalImageSource
} from '../src/lib/bits-image-source';

describe('bits image source contract', () => {
  it('normalizes local bits image sources and https URLs', () => {
    expect(normalizeBitsLocalImageSource(' ./bits/demo.webp ')).toBe('bits/demo.webp');
    expect(normalizeBitsImageSource('https://example.com/demo.webp')).toBe('https://example.com/demo.webp');
    expect(isBitsImageSource('bits/demo.svg')).toBe(true);
  });

  it('rejects sources outside the public-relative bits image protocol', () => {
    expect(normalizeBitsImageSource('/bits/demo.webp')).toBeNull();
    expect(normalizeBitsImageSource('public/bits/demo.webp')).toBeNull();
    expect(normalizeBitsImageSource('http://example.com/demo.webp')).toBeNull();
    expect(normalizeBitsImageSource('data:image/png;base64,demo')).toBeNull();
    expect(normalizeBitsImageSource('C:\\bits\\demo.webp')).toBeNull();
    expect(normalizeBitsImageSource('C:/bits/demo.webp')).toBeNull();
    expect(normalizeBitsImageSource('../demo.webp')).toBeNull();
    expect(normalizeBitsImageSource('bits/demo.webp?v=1')).toBeNull();
    expect(normalizeBitsImageSource('bits/demo.txt')).toBeNull();
  });
});
