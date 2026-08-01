import { afterEach, beforeEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const createJsonRequest = (url: string, payload: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: {
      origin: new URL(url).origin,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

export const omitPublishedAt = (values: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...values };
  delete next.publishedAt;
  return next;
};

export const omitUpdatedAt = (values: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...values };
  delete next.updatedAt;
  return next;
};

export const setupAdminContentWriteFixture = (): (() => string) => {
  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'astro-whono-content-'));
    process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT = tempRoot;

    await mkdir(path.join(tempRoot, 'src', 'content', 'essay'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'bits'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'memo'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'about'), { recursive: true });
    await mkdir(path.join(tempRoot, 'public', 'author'), { recursive: true });

    await writeFile(path.join(tempRoot, 'public', 'author', 'alice.webp'), 'avatar');
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'demo.md'),
      ['---', 'title: Demo Essay', 'date: 2026-03-18', 'draft: false', '---', '', '# Essay', '', '正文保持不变。', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'admin-console-guide copy.md'),
      ['---', 'title: Space Name Essay', 'date: 2026-03-21', 'draft: false', '---', '', '# Space Name', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'essay', 'other.md'),
      ['---', 'title: Other Essay', 'date: 2026-03-20', 'slug: existing-essay', '---', '', '# Other', '', 'duplicate guard', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'bits', 'demo.md'),
      [
        '---',
        'date: 2025-02-03T01:01:45+08:00',
        'tags:',
        '  - Markdown',
        'images:',
        '  - src: bits/demo.webp',
        '    width: 800',
        '    height: 600',
        '---',
        '',
        'Bits body',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'memo', 'index.md'),
      [
        '---',
        'title: Memo',
        'subtitle: Memo subtitle',
        'date: 2026-01-10',
        'draft: true',
        'slug: memo-note',
        '---',
        '',
        'memo body',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'about', 'index.md'),
      ['---', '---', '', 'about body', ''].join('\n'),
      'utf8'
    );
  });

  afterEach(async () => {
    delete process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT;
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
  });

  return () => tempRoot;
};
