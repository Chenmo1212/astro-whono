import { describe, expect, it } from 'vitest';
import {
  LEGACY_MEMO_INTRO_LINES,
  buildMemoTocGroups,
  findFirstMemoContentHeadingOffset,
  resolveMemoRenderedSections,
  splitMemoMarkdownBody,
  splitMemoRenderedHtml
} from '../src/lib/memo-page';

describe('memo page content split', () => {
  it('treats markdown before the first H2 as editable memo intro', () => {
    const source = [
      '时间流经我们。  ',
      '也许，为瞬间留下一份文字备份。',
      '',
      '## 2025年记',
      '',
      '### 新屋',
      '',
      '搬家当晚把小灯放在地上。'
    ].join('\n');

    expect(splitMemoMarkdownBody(source)).toEqual({
      introMarkdown: [
        '时间流经我们。  ',
        '也许，为瞬间留下一份文字备份。',
        '',
        ''
      ].join('\n'),
      contentMarkdown: [
        '## 2025年记',
        '',
        '### 新屋',
        '',
        '搬家当晚把小灯放在地上。'
      ].join('\n'),
      hasBodyIntro: true
    });
  });

  it('keeps legacy intro available when the memo body starts with a content H2', () => {
    const source = ['## 2025年记', '', '### 新屋', '', '正文'].join('\n');

    expect(splitMemoMarkdownBody(source)).toEqual({
      introMarkdown: '',
      contentMarkdown: source,
      hasBodyIntro: false
    });
    expect(LEGACY_MEMO_INTRO_LINES).toContain('时间流经我们，如同风穿过回廊。');
  });

  it('ignores H2 markers inside fenced code when locating the content body', () => {
    const source = [
      '开头说明。',
      '',
      '```markdown',
      '## 不是正文标题',
      '```',
      '',
      '## 2025年记'
    ].join('\n');

    expect(findFirstMemoContentHeadingOffset(source)).toBe(source.lastIndexOf('## 2025年记'));
    expect(splitMemoMarkdownBody(source).introMarkdown).toContain('## 不是正文标题');
  });

  it('splits rendered html using the first rendered H2 boundary', () => {
    const rendered = [
      '<p>时间流经我们。<br>',
      '也许，为瞬间留下一份文字备份。</p>',
      '<h2 id="2025年记">2025年记</h2>',
      '<p>正文</p>'
    ].join('\n');

    expect(splitMemoRenderedHtml(rendered, true, [{ depth: 2, slug: '2025年记' }])).toEqual({
      introHtml: [
        '<p>时间流经我们。<br>',
        '也许，为瞬间留下一份文字备份。</p>'
      ].join('\n'),
      contentHtml: ['<h2 id="2025年记">2025年记</h2>', '<p>正文</p>'].join('\n')
    });
  });

  it('uses rendered heading metadata instead of raw h2 tags in the intro', () => {
    const rendered = [
      '<p><h2>只是原始 HTML 示例</h2></p>',
      '<h2 id="2025年记">2025年记</h2>',
      '<p>正文</p>'
    ].join('\n');

    expect(splitMemoRenderedHtml(rendered, true, [{ depth: 2, slug: '2025年记' }])).toEqual({
      introHtml: '<p><h2>只是原始 HTML 示例</h2></p>',
      contentHtml: ['<h2 id="2025年记">2025年记</h2>', '<p>正文</p>'].join('\n')
    });
  });

  it('keeps all rendered html in content when there is no body intro', () => {
    const rendered = '<h2 id="2025年记">2025年记</h2>\n<p>正文</p>';

    expect(splitMemoRenderedHtml(rendered, false)).toEqual({
      introHtml: '',
      contentHtml: rendered
    });
  });

  it('resolves rendered sections from markdown body and rendered headings', () => {
    expect(resolveMemoRenderedSections({
      markdownBody: ['引言', '', '## 2025年记', '', '正文'].join('\n'),
      renderedHtml: ['<p>引言</p>', '<h2 id="2025年记">2025年记</h2>', '<p>正文</p>'].join('\n'),
      headings: [{ depth: 2, text: '2025年记', slug: '2025年记' }]
    })).toEqual({
      introHtml: '<p>引言</p>',
      contentHtml: ['<h2 id="2025年记">2025年记</h2>', '<p>正文</p>'].join('\n')
    });
  });

  it('builds memo toc groups from H2 and nested H3 headings', () => {
    expect(buildMemoTocGroups([
      { depth: 3, text: '孤立 H3', slug: 'orphan' },
      { depth: 2, text: '2025年记', slug: '2025' },
      { depth: 3, text: '新屋', slug: 'new-home' },
      { depth: 3, text: '雨夜', slug: 'rain' },
      { depth: 2, text: '2026年记', slug: '2026' }
    ])).toEqual([
      {
        title: '2025年记',
        items: [
          { text: '新屋', slug: 'new-home' },
          { text: '雨夜', slug: 'rain' }
        ]
      },
      {
        title: '2026年记',
        items: []
      }
    ]);
  });
});
