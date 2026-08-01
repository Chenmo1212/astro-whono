import { describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createJsonRequest, setupAdminContentWriteFixture } from './admin-content-write-fixture';

describe('admin content fixed-page write contract', () => {
  const getTempRoot = setupAdminContentWriteFixture();

  it('supports body-only about payload and content entry writes for the active editor', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST, GET } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('about', 'index');
    expect(current.collection).toBe('about');
    if (current.collection !== 'about') throw new Error('Expected about payload');
    expect(current.values).toEqual({});
    expect(current.bodyText).toBe('\nabout body\n');

    const getUrl = new URL('http://127.0.0.1:4321/api/admin/content/entry?collection=about&entryId=index');
    const getResponse = await GET({ url: getUrl } as never);
    expect(getResponse.status).toBe(200);
    expect(JSON.parse(await getResponse.text()).payload.values).toEqual({});

    const nextBody = [
      '## 朋友们',
      '',
      ':::friend{name="Alice" url="https://alice.example"}',
      'Engineer',
      ':::',
      '',
      '## 常见问题',
      '',
      ':::faq{question="能编辑吗？"}',
      '可以。',
      ':::',
      ''
    ].join('\n');

    const dryRunResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'about',
        entryId: 'index',
        revision: current.revision,
        body: nextBody
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(dryRunResponse.status).toBe(200);
    const dryRunPayload = JSON.parse(await dryRunResponse.text());
    expect(dryRunPayload.ok).toBe(true);
    expect(dryRunPayload.result.changedFields).toEqual(['body']);

    const writeResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'about',
        entryId: 'index',
        revision: current.revision,
        body: nextBody
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(writeResponse.status).toBe(200);
    const writePayload = JSON.parse(await writeResponse.text());
    expect(writePayload.ok).toBe(true);
    expect(writePayload.payload.collection).toBe('about');
    expect(writePayload.payload.values).toEqual({});

    const after = await readFile(path.join(getTempRoot(), 'src', 'content', 'about', 'index.md'), 'utf8');
    expect(after).toContain(':::friend{name="Alice" url="https://alice.example"}');
    expect(after).toContain(':::faq{question="能编辑吗？"}');
    expect(after).toBe(['---', '---', nextBody].join('\n'));
    expect(after.endsWith(nextBody)).toBe(true);
  });

  it('saves memo body through the shared entry API without rewriting fixed-page frontmatter', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { splitMarkdownFrontmatter } = await import('../src/lib/admin-console/frontmatter');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('memo', 'index');
    if (current.collection !== 'memo') throw new Error('expected memo payload');
    const before = await readFile(path.join(getTempRoot(), 'src', 'content', 'memo', 'index.md'), 'utf8');
    const beforeSection = splitMarkdownFrontmatter(before);

    const nextBody = ['# Memo', '', '小记正文已写入。', ''].join('\n');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'memo',
        entryId: 'index',
        revision: current.revision,
        body: nextBody
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(['body']);
    expect(payload.payload.collection).toBe('memo');
    expect(payload.payload.bodyText).toBe(nextBody);

    const after = await readFile(path.join(getTempRoot(), 'src', 'content', 'memo', 'index.md'), 'utf8');
    const afterSection = splitMarkdownFrontmatter(after);
    expect(afterSection.frontmatterBlock).toBe(beforeSection.frontmatterBlock);
    expect(afterSection.bodyText).toBe(nextBody);
  });

  it('rejects memo body writes that reference missing local images', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('memo', 'index');
    if (current.collection !== 'memo') throw new Error('expected memo payload');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'memo',
        entryId: 'index',
        revision: current.revision,
        body: '![missing](./assets/missing.webp)\n'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'body',
          message: expect.stringContaining('src/content/memo/assets/missing.webp')
        })
      ])
    );
  });

  it('returns latest memo body when rejecting stale revisions', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('memo', 'index');
    if (current.collection !== 'memo') throw new Error('expected memo payload');

    await writeFile(
      path.join(getTempRoot(), 'src', 'content', 'memo', 'index.md'),
      [
        '---',
        'title: External Memo',
        'draft: false',
        '---',
        '',
        'external memo body',
        ''
      ].join('\n'),
      'utf8'
    );

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'memo',
        entryId: 'index',
        revision: current.revision,
        body: 'local memo body\n'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.payload.collection).toBe('memo');
    expect(payload.payload.values.title).toBe('External Memo');
    expect(payload.payload.bodyText).toBe('\nexternal memo body\n');
  });

  it('returns latest about body and empty values when rejecting stale revisions', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('about', 'index');
    if (current.collection !== 'about') throw new Error('expected about payload');

    await writeFile(
      path.join(getTempRoot(), 'src', 'content', 'about', 'index.md'),
      [
        '---',
        '---',
        '',
        'external about body',
        ''
      ].join('\n'),
      'utf8'
    );

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'about',
        entryId: 'index',
        revision: current.revision,
        body: 'local about body\n'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.payload.collection).toBe('about');
    expect(payload.payload.values).toEqual({});
    expect(payload.payload.bodyText).toBe('\nexternal about body\n');
  });

});
