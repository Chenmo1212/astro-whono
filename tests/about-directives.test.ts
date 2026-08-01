import { describe, expect, it } from 'vitest';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { rehypeAboutDirectives, remarkAboutDirectives } from '../src/plugins/about-directives.mjs';

const renderAboutMarkdown = async (
  source: string,
  {
    base = '/',
    path = new URL('../src/content/about/index.md', import.meta.url),
    enabled
  }: { base?: string; path?: URL | string; enabled?: boolean } = {}
): Promise<string> => {
  const options = enabled === undefined ? undefined : { enabled };
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkAboutDirectives, options)
    .use(remarkRehype)
    .use(rehypeAboutDirectives, { base, ...(options ?? {}) })
    .use(rehypeStringify);

  const file = new VFile({ value: source, path });
  const result = await processor.process(file);
  return String(result);
};

describe('about directives markdown transform', () => {
  it('prefixes local friend avatar paths with deployment base', async () => {
    const html = await renderAboutMarkdown(
      [
        ':::friend{name="Alice" url="https://alice.example" avatar="author/avatar.webp"}',
        'Engineer',
        ':::'
      ].join('\n'),
      { base: '/blog/' }
    );

    expect(html).toContain('src="/blog/author/avatar.webp"');
    expect(html).toContain('href="https://alice.example/"');
  });

  it('groups whitespace-separated friend and FAQ directive runs', async () => {
    const html = await renderAboutMarkdown(
      [
        ':::friend{name="Alice" url="https://alice.example"}',
        'Engineer',
        ':::',
        '',
        ':::friend{name="Bob" url="https://bob.example"}',
        'Designer',
        ':::',
        '',
        ':::faq{question="Q1"}',
        'A1',
        ':::',
        '',
        ':::faq{question="Q2"}',
        'A2',
        ':::'
      ].join('\n')
    );

    expect(html.match(/<ul class="friend-list">/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html.match(/<div class="qa-list" aria-label="常见问题">/g)).toHaveLength(1);
    expect(html.match(/<details class="qa-item">/g)).toHaveLength(2);
  });

  it('keeps contact-links as a runtime placeholder in about markdown', async () => {
    const html = await renderAboutMarkdown('::contact-links');

    expect(html).toBe('<div data-about-contact-links=""></div>');
  });

  it('renders site-info as a semantic card with generated copy text', async () => {
    const html = await renderAboutMarkdown(
      [
        '::site-info{name="Whono" url="https://astro.whono.me/" description="一个极简的双栏 Astro 主题" avatar="author/avatar.webp"}'
      ].join('\n'),
      { base: '/blog/' }
    );

    expect(html).toContain('<div class="about-site-info">');
    expect(html).not.toContain('aria-label="本站友链信息"');
    expect(html).not.toContain('about-site-info__avatar');
    expect(html).not.toContain('about-site-info__eyebrow');
    expect(html).not.toContain('src="/blog/author/avatar.webp"');
    expect(html).toContain('<dt class="about-site-info__field-label">名称</dt>');
    expect(html).toContain('<dd class="about-site-info__field-value">Whono</dd>');
    expect(html).toContain('href="https://astro.whono.me/"');
    expect(html).toContain('data-about-site-info-copy');
    expect(html).toContain('name: Whono');
    expect(html).toContain('description: 一个极简的双栏 Astro 主题');
    expect(html).toContain('avatar: author/avatar.webp');
  });

  it('supports site-info leaf directive inside FAQ', async () => {
    const html = await renderAboutMarkdown(
      [
        ':::faq{question="如何交换友链？"}',
        '请附上站点名称、链接、简介和头像。',
        '',
        '::site-info{name="Whono" url="https://astro.whono.me/" description="一个极简的双栏 Astro 主题" avatar="https://astro.whono.me/author/avatar.webp"}',
        ':::'
      ].join('\n')
    );

    expect(html).toContain('<div class="qa-list" aria-label="常见问题">');
    expect(html).toContain('class="about-site-info"');
    expect(html).not.toContain('<p>:::</p>');
  });

  it('does not transform directives outside the about source file', async () => {
    const html = await renderAboutMarkdown(
      [
        ':::faq{question="Q1"}',
        'A1',
        ':::',
        '',
        '::contact-links'
      ].join('\n'),
      { path: new URL('../src/content/essay/demo.md', import.meta.url) }
    );

    expect(html).not.toContain('qa-list');
    expect(html).not.toContain('qa-item');
    expect(html).not.toContain('data-about-contact-links');
    expect(html).toContain('A1');
  });

  it('honors explicit disabled options even for the about source file', async () => {
    const html = await renderAboutMarkdown(
      [
        ':::faq{question="Q1"}',
        'A1',
        ':::',
        '',
        '::contact-links'
      ].join('\n'),
      { enabled: false }
    );

    expect(html).not.toContain('qa-list');
    expect(html).not.toContain('qa-item');
    expect(html).not.toContain('data-about-contact-links');
    expect(html).toContain('A1');
  });
});
