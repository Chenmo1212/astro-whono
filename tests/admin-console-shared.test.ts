import { describe, expect, it } from 'vitest';
import {
  canonicalizeAdminThemeSettings,
  createAdminThemeSettingsCanonicalMismatchIssues,
  fillAdminThemeSettingsCompatibilityDefaults,
  getAdminNavOrderIssues,
  getAdminSocialOrderIssues,
  validateAdminThemeSettings
} from '../src/lib/admin-console/shared';
import {
  getAdminImageFieldPreviewSrc,
  getAdminRenderedImagePreviewSrc
} from '../src/lib/admin-console/image-params';
import { getEditableThemeSettingsPayload } from '../src/lib/theme-settings';
import {
  buildSearchHaystack,
  getBitsAvatarLocalFilePath,
  getHeroImageLocalFilePath,
  normalizeBitsAvatarPath,
  normalizeHeroImageSrc,
  tokenizeSearchQuery
} from '../src/utils/format';

describe('admin-console/shared', () => {
  it('reports duplicate and range issues for social orders', () => {
    expect(
      getAdminSocialOrderIssues(
        { github: 1, x: 1, email: 99 },
        [{ key: 'custom-1', order: 2 }, { key: 'custom-2', order: 2 }]
      )
    ).toEqual([
      { type: 'duplicate', scope: 'preset', key: 'github', order: 1 },
      { type: 'duplicate', scope: 'preset', key: 'x', order: 1 },
      { type: 'range', scope: 'preset', key: 'email', order: 99 },
      { type: 'duplicate', scope: 'custom', key: 'custom-1', order: 2 },
      { type: 'duplicate', scope: 'custom', key: 'custom-2', order: 2 }
    ]);
  });

  it('reports duplicate and range issues for nav orders', () => {
    expect(
      getAdminNavOrderIssues([
        { key: 'essay', order: 1 },
        { key: 'bits', order: 1 },
        { key: 'memo', order: 0 }
      ])
    ).toEqual([
      { type: 'duplicate', key: 'essay', order: 1 },
      { type: 'duplicate', key: 'bits', order: 1 },
      { type: 'range', key: 'memo', order: 0 }
    ]);
  });

  it('normalizes valid hero image sources and rejects invalid local paths', () => {
    expect(normalizeHeroImageSrc('@/assets/hero/cover.webp')).toBe('src/assets/hero/cover.webp');
    expect(normalizeHeroImageSrc('public/images/hero.png')).toBe('/images/hero.png');
    expect(normalizeHeroImageSrc('https://example.com/hero.avif')).toBe('https://example.com/hero.avif');
    expect(normalizeHeroImageSrc('/images/hero.png?size=2')).toBeUndefined();
    expect(normalizeHeroImageSrc('../hero.png')).toBeUndefined();
    expect(getHeroImageLocalFilePath('src/assets/hero/cover.webp')).toBe('src/assets/hero/cover.webp');
    expect(getHeroImageLocalFilePath('/images/hero.png')).toBe('public/images/hero.png');
  });

  it('normalizes bits avatar paths and rejects invalid values', () => {
    expect(normalizeBitsAvatarPath(' author/avatar.webp ')).toBe('author/avatar.webp');
    expect(normalizeBitsAvatarPath('')).toBe('');
    expect(normalizeBitsAvatarPath('/author/avatar.webp')).toBeUndefined();
    expect(normalizeBitsAvatarPath('public/author/avatar.webp')).toBeUndefined();
    expect(normalizeBitsAvatarPath('https://example.com/avatar.webp')).toBeUndefined();
    expect(normalizeBitsAvatarPath('author/avatar.webp?v=2')).toBeUndefined();
    expect(getBitsAvatarLocalFilePath('author/avatar.webp')).toBe('public/author/avatar.webp');
  });

  it('normalizes admin image field preview sources through field contracts', () => {
    expect(getAdminImageFieldPreviewSrc('bits.images', 'bits/demo.webp', '/blog/')).toBe('/blog/bits/demo.webp');
    expect(getAdminImageFieldPreviewSrc('bits.images', 'https://example.com/demo.webp')).toBe(
      'https://example.com/demo.webp'
    );
    expect(getAdminImageFieldPreviewSrc('bits.images', 'http://example.com/demo.webp')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('bits.images', 'data:image/png;base64,demo.png')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('bits.images', '//example.com/demo.webp')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('bits.images', '../demo.webp')).toBeNull();

    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', '/images/hero.png', '/blog/')).toBe('/blog/images/hero.png');
    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', 'src/assets/hero.png')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', 'https://example.com/hero.webp')).toBe(
      'https://example.com/hero.webp'
    );
    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', 'http://example.com/hero.webp')).toBeNull();

    expect(getAdminImageFieldPreviewSrc('page.bits.defaultAuthor.avatar', 'author/avatar.svg', '/blog/')).toBe(
      '/blog/author/avatar.svg'
    );
  });

  it('normalizes rendered admin image preview sources before assigning img src', () => {
    expect(getAdminRenderedImagePreviewSrc('/_astro/hero.hash.png', '/blog/')).toBe('/blog/_astro/hero.hash.png');
    expect(getAdminRenderedImagePreviewSrc('/_astro/hero.hash.png?origWidth=1200&origHeight=800', '/blog/')).toBe(
      '/blog/_astro/hero.hash.png?origWidth=1200&origHeight=800'
    );
    expect(getAdminRenderedImagePreviewSrc('/blog/_astro/hero.hash.png', '/blog/')).toBe('/blog/_astro/hero.hash.png');
    expect(getAdminRenderedImagePreviewSrc('/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png')).toBe(
      '/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png'
    );
    expect(getAdminRenderedImagePreviewSrc('/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png?origWidth=1200')).toBe(
      '/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png?origWidth=1200'
    );
    expect(getAdminRenderedImagePreviewSrc('https://example.com/hero.webp')).toBe('https://example.com/hero.webp');
    expect(getAdminRenderedImagePreviewSrc('http://example.com/hero.webp')).toBeNull();
    expect(getAdminRenderedImagePreviewSrc('data:image/png;base64,hero.png')).toBeNull();
    expect(getAdminRenderedImagePreviewSrc('//example.com/hero.webp')).toBeNull();
    expect(getAdminRenderedImagePreviewSrc('/_astro/hero.hash.png#preview')).toBeNull();
  });

  it('tokenizes search query and builds normalized haystack text', () => {
    expect(tokenizeSearchQuery(' Astro   主题  astro ')).toEqual(['astro', '主题']);
    expect(
      buildSearchHaystack([' Title ', ' Description ', ['TagA', ' TagB '], '', null, 'Body'])
    ).toBe('title description taga tagb body');
  });

  it('canonicalizes admin settings snapshots and reports contract mismatches', () => {
    const raw = structuredClone(getEditableThemeSettingsPayload().settings) as Record<string, any>;
    raw.site.title = `  ${raw.site.title}  `;
    raw.site.footer.startYear = String(raw.site.footer.startYear);
    raw.site.socialLinks.email = `mailto:${raw.site.socialLinks.email}`;
    raw.site.socialLinks.custom = [
      {
        id: 'custom-home',
        label: '',
        href: 'https://example.com',
        iconKey: 'globe',
        visible: 1,
        order: '5'
      }
    ];
    delete raw.page.about.subtitle;

    const canonical = canonicalizeAdminThemeSettings(raw, {
      footerStartYearMax: 2030,
      normalizeCustomSocialLabel: (value, iconKey) => String(value ?? '').trim() || iconKey
    });

    expect(canonical.site.title).toBe(getEditableThemeSettingsPayload().settings.site.title);
    expect(canonical.site.footer.startYear).toBe(getEditableThemeSettingsPayload().settings.site.footer.startYear);
    expect(canonical.site.socialLinks.email).toBe(getEditableThemeSettingsPayload().settings.site.socialLinks.email);
    expect(canonical.site.socialLinks.custom[0]).toMatchObject({
      iconKey: 'website',
      label: 'website',
      visible: true,
      order: 5
    });
    expect(validateAdminThemeSettings(canonical, { footerStartYearMax: 2030 })).toEqual([]);
    expect(
      createAdminThemeSettingsCanonicalMismatchIssues(raw, canonical).map((issue) => issue.path)
    ).toEqual(
      expect.arrayContaining([
        'site.title',
        'site.footer.startYear',
        'site.socialLinks.email',
        'site.socialLinks.custom[0].iconKey',
        'site.socialLinks.custom[0].label',
        'site.socialLinks.custom[0].visible',
        'site.socialLinks.custom[0].order',
        'page.about.subtitle'
      ])
    );
  });

  it('fills compatibility defaults for legacy admin overview and sidebar action snapshots', () => {
    const canonical = getEditableThemeSettingsPayload().settings;
    const legacySnapshot = structuredClone(canonical) as Record<string, any>;
    delete legacySnapshot.site.adminOverview;
    legacySnapshot.ui.sidebarActions = {
      showThemeToggle: canonical.ui.sidebarActions.showThemeToggle
    };

    const compatible = fillAdminThemeSettingsCompatibilityDefaults(
      legacySnapshot,
      canonical
    ) as Record<string, any>;

    const mismatchPaths = createAdminThemeSettingsCanonicalMismatchIssues(compatible, canonical).map((issue) => issue.path);
    expect(mismatchPaths).not.toContain('site.adminOverview');
    expect(mismatchPaths).not.toContain('ui.sidebarActions');
    expect(mismatchPaths).not.toContain('ui.sidebarActions.showRssLink');
    expect(mismatchPaths).not.toContain('ui.sidebarActions.showAdminEntry');
  });

  it('validates admin overview public display settings', () => {
    const settings = structuredClone(getEditableThemeSettingsPayload().settings);
    settings.site.adminOverview.publicVisible = false;
    settings.site.adminOverview.hiddenMessage = '暂未公开';
    settings.ui.sidebarActions.showAdminEntry = true;

    expect(validateAdminThemeSettings(settings)).toEqual([]);

    settings.site.adminOverview.hiddenMessage = '';
    expect(validateAdminThemeSettings(settings).map((issue) => issue.path)).toContain(
      'site.adminOverview.hiddenMessage'
    );
  });
});
