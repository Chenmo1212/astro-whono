import { describe, expect, it } from 'vitest';
import {
  THEME_FONT_REGISTRY,
  THEME_TYPOGRAPHY_DEFAULT,
  getSelectedAstroApiFonts,
  getThemeFontPreviewStack,
  getThemeFontStack,
  getTypographyStyleOverride,
  resolveTypographyFromRawUiSettings
} from '../src/lib/fonts/registry';

describe('fonts/registry', () => {
  it('resolves raw ui settings with per-role validation and default fallback', () => {
    expect(resolveTypographyFromRawUiSettings(undefined)).toEqual(THEME_TYPOGRAPHY_DEFAULT);
    expect(
      resolveTypographyFromRawUiSettings({
        typography: { readable: 'bogus', copy: 'system-mono', mono: 'jetbrains-mono', brand: 'system-mono' }
      })
    ).toEqual({
      readable: 'noto-serif-sc',
      copy: 'lxgw-wenkai-lite',
      mono: 'jetbrains-mono',
      brand: 'serif-georgia'
    });
  });

  it('offers brand role only fonts flagged for it and falls back to Georgia default', () => {
    // 品牌角色最小可用集：系统衬线 Georgia（默认）+ 思源宋体 + 霞鹜文楷。
    expect(THEME_TYPOGRAPHY_DEFAULT.brand).toBe('serif-georgia');
    expect(getThemeFontStack('serif-georgia')).toBe('Georgia, serif');
    // 非 brand 角色字体（等宽）选进 brand 时按 per-role 校验回退默认。
    expect(
      resolveTypographyFromRawUiSettings({ typography: { brand: 'system-mono' } }).brand
    ).toBe('serif-georgia');
  });

  it('selects only chosen astro-fonts-api entries', () => {
    expect(getSelectedAstroApiFonts(THEME_TYPOGRAPHY_DEFAULT)).toEqual([]);
    const selected = getSelectedAstroApiFonts({ ...THEME_TYPOGRAPHY_DEFAULT, mono: 'jetbrains-mono' });
    expect(selected.map((entry) => entry.id)).toEqual(['jetbrains-mono']);
  });

  it('keeps CJK api entries downloadable with explicit chinese subsets', () => {
    const [cjk] = getSelectedAstroApiFonts({ ...THEME_TYPOGRAPHY_DEFAULT, copy: 'noto-sans-sc' });
    expect(cjk?.id).toBe('noto-sans-sc');
    // 缺少 chinese-simplified 会让构建只下载 latin，中文字形静默落到 fallback。
    expect(cjk?.provider === 'fontsource' ? cjk.subsets : undefined).toContain('chinese-simplified');
    expect(cjk?.weights).toEqual([400]);
  });

  it('accepts new catalog entries for their declared roles only', () => {
    expect(
      resolveTypographyFromRawUiSettings({
        typography: { readable: 'noto-sans-sc', copy: 'fira-code', mono: 'fira-code' }
      })
    ).toEqual({
      readable: 'noto-sans-sc',
      copy: 'lxgw-wenkai-lite',
      mono: 'fira-code',
      brand: 'serif-georgia'
    });
  });

  it('builds var() stacks for astro-fonts-api fonts and literal stacks otherwise', () => {
    expect(getThemeFontStack('system-kai')).toBe('"Kaiti SC", "STKaiti", serif');
    expect(getThemeFontStack('jetbrains-mono')).toMatch(/^var\(--font-jetbrains-mono\), "Sarasa Mono SC"/);
  });

  it('keeps admin card fields filled and preview stacks free of var()', () => {
    THEME_FONT_REGISTRY.forEach((entry) => {
      // 卡片短名与徽章是管理台 UI 契约：漏填会渲染出空卡片。
      expect(entry.cardLabel.length, entry.id).toBeGreaterThan(0);
      expect(entry.badge.length, entry.id).toBeGreaterThan(0);
      // 预览栈不得依赖 --font-* 变量：未选中的 astro-fonts-api 字体没有该变量，var() 未定义会丢掉整条 fallback。
      expect(getThemeFontPreviewStack(entry.id), entry.id).not.toContain('var(');
    });
    expect(getThemeFontPreviewStack('jetbrains-mono')).toMatch(/^"JetBrains Mono", "Sarasa Mono SC"/);
    expect(getThemeFontPreviewStack('system-kai')).toBe(getThemeFontStack('system-kai'));
  });

  it('emits overrides only for non-default roles', () => {
    expect(getTypographyStyleOverride(THEME_TYPOGRAPHY_DEFAULT)).toBeNull();
    expect(getTypographyStyleOverride({ ...THEME_TYPOGRAPHY_DEFAULT, mono: 'jetbrains-mono' })).toBe(
      `--font-mono: ${getThemeFontStack('jetbrains-mono')}`
    );
  });
});
