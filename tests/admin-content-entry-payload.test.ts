import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createJsonRequest, setupAdminContentWriteFixture } from './admin-content-write-fixture';

describe('admin content entry payload contract', () => {
  const getTempRoot = setupAdminContentWriteFixture();

  it('loads editable payload for essay entries', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const payload = await readAdminContentEntryEditorPayload('essay', 'demo');

    expect(payload.collection).toBe('essay');
    if (payload.collection !== 'essay') throw new Error('Expected essay payload');
    expect(payload.writable).toBe(true);
    expect(payload.values.title).toBe('Demo Essay');
    expect(payload.values.date).toBe('2026-03-18');
    expect(payload.defaultPublicSlug).toBe('demo');
    if (payload.collection === 'essay') {
      expect(payload.values.publishedAt).toBe('');
      expect(payload.values.updatedAt).toBe('');
    }
  });

  it('loads editable payload for bits entries with body text', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const payload = await readAdminContentEntryEditorPayload('bits', 'demo');

    expect(payload.writable).toBe(true);
    expect(payload.collection).toBe('bits');
    if (payload.collection === 'bits') {
      expect(payload.bodyText).toBe('\nBits body\n');
      expect(payload.values.imagesText).toContain('bits/demo.webp');
    }
  });

  it('loads and validates source files whose names differ from Astro public ids', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('essay', 'admin-console-guide copy');

    expect(current.entryId).toBe('admin-console-guide copy');
    expect(current.defaultPublicSlug).toBe('admin-console-guide-copy');
    expect(current.relativePath).toBe('src/content/essay/admin-console-guide copy.md');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'essay',
        entryId: 'admin-console-guide copy',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          title: 'Space Name Essay Updated'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(['title']);
  });

  it('loads legacy essay datetime dates for compatibility', async () => {
    await writeFile(
      path.join(getTempRoot(), 'src', 'content', 'essay', 'legacy-datetime.md'),
      [
        '---',
        'title: Legacy Datetime',
        'date: 2024-11-23T18:00:00+08:00',
        'draft: false',
        '---',
        '',
        'legacy body',
        ''
      ].join('\n'),
      'utf8'
    );

    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const payload = await readAdminContentEntryEditorPayload('essay', 'legacy-datetime');

    if (payload.collection === 'essay') {
      expect(payload.values.date).toBe('2024-11-23');
      expect(payload.values.publishedAt).toBe('2024-11-23T18:00:00+08:00');
    }
  });

  it('loads optional essay updatedAt as editable date text', async () => {
    await writeFile(
      path.join(getTempRoot(), 'src', 'content', 'essay', 'updated-date.md'),
      [
        '---',
        'title: Updated Date',
        'date: 2026-03-18',
        'updatedAt: 2026-03-20T22:30:00+08:00',
        'draft: false',
        '---',
        '',
        'updated body',
        ''
      ].join('\n'),
      'utf8'
    );

    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const payload = await readAdminContentEntryEditorPayload('essay', 'updated-date');

    if (payload.collection === 'essay') {
      expect(payload.values.updatedAt).toBe('2026-03-20');
    }
  });

  it('loads editable payload for memo entries with body text', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const payload = await readAdminContentEntryEditorPayload('memo', 'index');

    expect(payload.writable).toBe(true);
    expect(payload.readonlyReason).toBeNull();
    expect(payload.collection).toBe('memo');
    if (payload.collection === 'memo') {
      expect(payload.bodyText).toBe('\nmemo body\n');
      expect(payload.values.title).toBe('Memo');
      expect(payload.values.subtitle).toBe('Memo subtitle');
      expect(payload.values.date).toBe('2026-01-10');
      expect(payload.values.draft).toBe(true);
      expect(payload.values.slug).toBe('memo-note');
    }
  });

  it('rejects non-index memo entry writes even if an extra source file exists', async () => {
    await writeFile(
      path.join(getTempRoot(), 'src', 'content', 'memo', 'extra.md'),
      ['---', 'title: Extra Memo', '---', '', 'extra memo body', ''].join('\n'),
      'utf8'
    );

    const { POST } = await import('../src/pages/api/admin/content/entry');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'memo',
        entryId: 'extra',
        revision: 'stale',
        body: 'updated extra memo body'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'entryId',
          message: expect.stringContaining('memo 仅支持固定源文件')
        })
      ])
    );
  });

  it('does not resolve memo index.mdx as the fixed page source', async () => {
    await writeFile(
      path.join(getTempRoot(), 'src', 'content', 'memo', 'index.mdx'),
      ['---', 'title: MDX Memo', '---', '', 'mdx memo body', ''].join('\n'),
      'utf8'
    );

    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const current = await readAdminContentEntryEditorPayload('memo', 'index');
    expect(current.relativePath).toBe('src/content/memo/index.md');
    if (current.collection === 'memo') {
      expect(current.bodyText).toBe('\nmemo body\n');
    }

    const { POST } = await import('../src/pages/api/admin/content/entry');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'memo',
        entryId: 'index.mdx',
        revision: 'stale',
        body: 'updated mdx memo body'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'entryId',
          message: expect.stringContaining('memo 仅支持固定源文件')
        })
      ])
    );
  });

  it('does not load non-memo .mdx entries into the writable editor path', async () => {
    await writeFile(
      path.join(getTempRoot(), 'src', 'content', 'bits', 'legacy-mdx.mdx'),
      ['---', 'date: 2025-02-03T22:30:00+08:00', '---', '', '<Aside />', ''].join('\n'),
      'utf8'
    );

    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');

    await expect(readAdminContentEntryEditorPayload('bits', 'legacy-mdx')).rejects.toMatchObject({
      code: 'source-not-found'
    });
  });

  it('returns structured json errors for invalid write inputs', async () => {
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const cases = [
      {
        body: { collection: 'page', entryId: 'demo', revision: 'stale', frontmatter: {} },
        status: 400,
        issuePath: 'collection',
        message: '不支持的 content collection'
      },
      {
        body: { collection: 'memo', entryId: 'index', revision: null, body: 'memo body' },
        status: 400,
        issuePath: 'revision',
        message: '请求体缺少 revision'
      },
      {
        body: { collection: 'essay', entryId: '../secret', revision: 'stale', frontmatter: {} },
        status: 400,
        issuePath: 'entryId',
        message: 'entryId'
      },
      {
        body: { collection: 'essay', entryId: 'missing', revision: 'stale', frontmatter: {} },
        status: 404,
        issuePath: 'entryId',
        message: '未找到 content 源文件'
      },
      {
        body: { collection: 'essay', entryId: 'demo', revision: 'stale', frontmatter: [] },
        status: 400,
        issuePath: 'frontmatter',
        message: 'frontmatter 必须是对象'
      },
      {
        body: { collection: 'about', entryId: 'index', revision: 'stale' },
        status: 400,
        issuePath: 'body',
        message: 'about 保存请求缺少 body 字段'
      },
      {
        body: { collection: 'memo', entryId: 'index', revision: 'stale' },
        status: 400,
        issuePath: 'body',
        message: 'memo 保存请求缺少 body 字段'
      },
      {
        body: { collection: 'essay', entryId: 'demo', revision: 'stale', frontmatter: {}, body: 42 },
        status: 400,
        issuePath: 'body',
        message: 'body 必须是 Markdown 字符串'
      }
    ];

    for (const testCase of cases) {
      const response = await POST({
        request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', testCase.body),
        url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
      } as never);

      expect(response.status).toBe(testCase.status);
      const payload = JSON.parse(await response.text());
      expect(payload.ok).toBe(false);
      expect(payload.errors[0]).toContain(testCase.message);
      expect(payload.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: testCase.issuePath
          })
        ])
      );
    }
  });

});
