import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetThemeSettingsCache } from '../src/lib/theme-settings';

describe('admin-console/checks', () => {
  const originalProjectRoot = process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT;
  const originalSettingsFlag = process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS;
  const originalSettingsDir = process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR;
  let tempRoot = '';

  beforeEach(async () => {
    resetThemeSettingsCache();
    tempRoot = await mkdtemp(path.join(tmpdir(), 'astro-whono-admin-checks-'));

    process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT = tempRoot;
    process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS = '1';
    process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR = path.join(tempRoot, 'settings');

    await cp(path.resolve('src/data/settings'), process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR, {
      recursive: true
    });

    await mkdir(path.join(tempRoot, 'src', 'content', 'essay'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'bits'), { recursive: true });
    await mkdir(path.join(tempRoot, 'public', 'author'), { recursive: true });
    await mkdir(path.join(tempRoot, 'public', 'bits'), { recursive: true });

    await writeFile(path.join(tempRoot, 'public', 'author', 'alice.webp'), 'avatar');
    await writeFile(path.join(tempRoot, 'public', 'bits', 'existing.webp'), 'image');

    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'duplicate-one.md'),
      [
        '---',
        'title: Duplicate One',
        'date: 2026-04-01',
        'slug: duplicate-slug',
        '---',
        '',
        'essay one',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'duplicate-two.md'),
      [
        '---',
        'title: Duplicate Two',
        'date: 2026-04-02',
        'slug: duplicate-slug',
        '---',
        '',
        'essay two',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'reserved.md'),
      [
        '---',
        'title: Reserved Slug',
        'date: 2026-04-03',
        'slug: tag',
        '---',
        '',
        'essay reserved',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'invalid.md'),
      [
        '---',
        'title: Invalid Slug',
        'date: 2026-04-04',
        'slug: bad_slug',
        '---',
        '',
        'essay invalid',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'taggy.md'),
      [
        '---',
        'title: Taggy Essay',
        'date: 2026-04-05',
        'tags:',
        '  - "???"',
        '  - Astro',
        '---',
        '',
        'essay taggy',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'bits', 'images.md'),
      [
        '---',
        'date: 2026-04-06T09:30:00+08:00',
        'tags:',
        '  - bits',
        'author:',
        '  name: Alice',
        '  avatar: author/missing.webp',
        'images:',
        '  - src: bits/missing.webp',
        '    width: 640',
        '    height: 480',
        '  - src: http://example.com/not-allowed.png',
        '    width: 1280',
        '    height: 720',
        '  - src: https://example.com/allowed.png',
        '    width: 1280',
        '    height: 720',
        '---',
        '',
        'bits images',
        ''
      ].join('\n'),
      'utf8'
    );

    const sitePath = path.join(process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR, 'site.json');
    await writeFile(
      sitePath,
      JSON.stringify(
        {
          title: 'Broken Settings',
          description: 'missing footer should trigger invalid-settings guard'
        },
        null,
        2
      ),
      'utf8'
    );
  });

  afterEach(async () => {
    resetThemeSettingsCache();

    if (originalProjectRoot === undefined) {
      delete process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT;
    } else {
      process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT = originalProjectRoot;
    }

    if (originalSettingsFlag === undefined) {
      delete process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS;
    } else {
      process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS = originalSettingsFlag;
    }

    if (originalSettingsDir === undefined) {
      delete process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR;
    } else {
      process.env.ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR = originalSettingsDir;
    }

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('aggregates structured checks from existing validation rules', async () => {
    const { getAdminChecksData } = await import('../src/lib/admin-console/checks');
    const result = await getAdminChecksData();
    const getCategory = (id: (typeof result.categories)[number]['id']) => {
      const category = result.categories.find((item) => item.id === id);
      expect(category).toBeDefined();
      return category!;
    };
    const settingsCategory = getCategory('settings');
    const essaySlugCategory = getCategory('essay-slug');
    const bitsImagesCategory = getCategory('bits-images');
    const tagCategory = getCategory('tag');
    const blockedCategories = result.categories.filter((category) => category.status === 'blocked');
    const allIssues = result.categories.flatMap((category) => category.issues);
    const affectedPaths = new Set(
      allIssues.map((issue) => issue.relativePath).filter((value): value is string => Boolean(value))
    );

    expect(result.totalIssueCount).toBe(allIssues.length);
    expect(result.blockedCategoryCount).toBe(blockedCategories.length);
    expect(result.affectedPathCount).toBe(affectedPaths.size);
    for (const category of [settingsCategory, essaySlugCategory, bitsImagesCategory, tagCategory]) {
      expect(category.status).toBe('blocked');
      expect(category.issueCount).toBe(category.issues.length);
      expect(category.issues.length).toBeGreaterThan(0);
    }

    expect(settingsCategory.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'src/data/settings/site.json',
          href: '/admin/theme/'
        })
      ])
    );
    expect(essaySlugCategory.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'src/content/essay/reserved.md',
          fieldPath: 'slug',
          href: '/admin/content/?collection=essay&entryId=reserved'
        }),
        expect.objectContaining({
          relativePath: 'src/content/essay/duplicate-one.md',
          message: expect.stringContaining('duplicate-slug')
        })
      ])
    );
    expect(
      allIssues.some((issue) => issue.href?.startsWith('/admin/content/essay/?') || issue.href?.startsWith('/admin/content/bits/?'))
    ).toBe(false);
    expect(bitsImagesCategory.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'src/content/bits/images.md',
          fieldPath: 'author.avatar',
          href: '/admin/content/?collection=bits&entryId=images'
        }),
        expect.objectContaining({
          relativePath: 'src/content/bits/images.md',
          fieldPath: 'images[1].src',
          message: expect.stringContaining('只允许 public/** 下的相对图片路径或 https:// 远程 URL')
        })
      ])
    );
    expect(tagCategory.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'src/content/essay/taggy.md',
          fieldPath: 'tags[0]'
        })
      ])
    );
  });
});
