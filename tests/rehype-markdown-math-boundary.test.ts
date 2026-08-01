import { describe, expect, it } from 'vitest';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import {
  markdownMathRawOptions,
  rehypeProtectMarkdownMath,
  rehypeRestoreMarkdownMathBoundary
} from '../src/plugins/rehype-markdown-math-boundary.mjs';
import { sanitizeSchema } from '../src/plugins/sanitize-schema.mjs';

const renderMarkdown = async (source: string): Promise<string> =>
  String(
    await unified()
      .use(remarkParse)
      .use(remarkMath, { singleDollarTextMath: false })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeProtectMarkdownMath)
      .use(rehypeRaw, markdownMathRawOptions)
      .use(rehypeRestoreMarkdownMathBoundary)
      .use(rehypeSanitize, sanitizeSchema as unknown as RehypeSanitizeOptions)
      .use(rehypeKatex)
      .use(rehypeStringify)
      .process(source)
  );

describe('rehype markdown math boundary', () => {
  it('renders double-dollar math through KaTeX', async () => {
    const html = await renderMarkdown(['Inline $$x + y$$.', '', '$$', 'z', '$$'].join('\n'));

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain('math-inline');
    expect(html).not.toContain('math-display');
  });

  it('does not let raw HTML math classes trigger KaTeX', async () => {
    const html = await renderMarkdown(
      [
        '<span class="math-inline">x + y</span>',
        '<code class="language-math math-inline">a + b</code>',
        '<pre><code class="language-math">c + d</code></pre>'
      ].join('\n')
    );

    expect(html).not.toContain('class="katex"');
    expect(html).toContain('x + y');
    expect(html).toContain('a + b');
    expect(html).toContain('c + d');
    expect(html).not.toContain('math-inline');
    expect(html).not.toContain('language-math');
  });

  it('keeps math fenced code as ordinary code', async () => {
    const html = await renderMarkdown(['```math', 'x + y', '```'].join('\n'));

    expect(html).toContain('x + y');
    expect(html).not.toContain('class="katex"');
    expect(html).not.toContain('language-math');
  });
});
