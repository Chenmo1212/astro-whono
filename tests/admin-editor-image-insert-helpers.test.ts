import { describe, expect, it } from 'vitest';
import {
  createImageInsertText,
  createMarkdownImage,
  normalizeRemoteMarkdownImageUrl
} from '../src/components/admin/editor/media-insert/image-insert-helpers';
import {
  createGalleryInsertText,
  normalizeGalleryImageSource
} from '../src/components/admin/editor/media-insert/gallery-insert-helpers';
import {
  findEditableImageBlockAtSelection
} from '../src/components/admin/editor/media-insert/editor-image-blocks';
import {
  findEditableGalleryBlockAroundSelection,
  findEditableGalleryBlockAtSelection
} from '../src/components/admin/editor/media-insert/editor-gallery-blocks';
import {
  replaceMarkdownText
} from '../src/components/admin/editor/markdown/editor-markdown-transforms';
import { decodeHtmlText } from '../src/lib/admin-console/essay-image-blocks';
import { collectMarkdownBodyLocalImageReferences } from '../src/lib/admin-console/essay-image-references';

describe('admin editor image insert helpers', () => {
  it('keeps the default image output as Markdown', () => {
    expect(createMarkdownImage('A \\ bracket ]', './image.webp')).toBe(
      '![A \\\\ bracket \\]](./image.webp)'
    );
    expect(
      createImageInsertText({
        src: './image.webp',
        alt: 'Alt',
        presentation: 'plain',
        caption: '',
        size: 'default',
        alignment: 'center'
      })
    ).toEqual({ text: '![Alt](./image.webp)' });
  });

  it('normalizes only https remote URLs for Markdown insertion', () => {
    expect(normalizeRemoteMarkdownImageUrl('https://example.com/image(1).webp')).toBe(
      'https://example.com/image%281%29.webp'
    );
    expect(normalizeRemoteMarkdownImageUrl('http://example.com/image.webp')).toBeNull();
  });

  it('creates escaped block figure HTML without inline styles', () => {
    const insert = createImageInsertText({
      src: 'https://example.com/image.webp?x=1&y=2',
      alt: 'A "quoted" <alt>',
      presentation: 'figure',
      caption: 'Caption & <text>',
      size: 'md',
      alignment: 'left'
    });

    expect(insert.placement).toBe('block');
    expect(insert.text).toContain('<figure class="figure figure--md figure--left">');
    expect(insert.text).toContain('src="https://example.com/image.webp?x=1&amp;y=2"');
    expect(insert.text).toContain('alt="A &quot;quoted&quot; &lt;alt&gt;"');
    expect(insert.text).toContain('<figcaption class="figure-caption">Caption &amp; &lt;text&gt;</figcaption>');
    expect(insert.text).not.toContain('style=');
  });

  it('creates escaped gallery HTML without standalone figure classes', () => {
    expect(normalizeGalleryImageSource('https://example.com/a.webp?x=1&y=2')).toBe(
      'https://example.com/a.webp?x=1&y=2'
    );
    expect(normalizeGalleryImageSource('.\\demo-assets\\a.webp?v=1#caption')).toBe(
      './demo-assets/a.webp?v=1#caption'
    );
    expect(normalizeGalleryImageSource('http://example.com/a.webp')).toBeNull();
    expect(normalizeGalleryImageSource('../secret.webp')).toBeNull();
    expect(normalizeGalleryImageSource('/images/a.webp')).toBeNull();
    expect(normalizeGalleryImageSource('./demo-assets/readme.txt')).toBeNull();
    expect(normalizeGalleryImageSource('?v=1')).toBeNull();

    const insert = createGalleryInsertText({
      columns: 'cols-3',
      items: [
        {
          src: './demo-assets/a.webp',
          alt: 'A "quoted" <alt>',
          caption: 'Caption & <text>'
        },
        {
          src: 'https://example.com/b.webp?x=1&y=2',
          alt: '',
          caption: ''
        }
      ]
    });

    expect(insert.placement).toBe('block');
    expect(insert.text).toContain('<ul class="gallery cols-3">');
    expect(insert.text).toContain('<figure>');
    expect(insert.text).not.toContain('class="figure"');
    expect(insert.text).toContain('alt="A &quot;quoted&quot; &lt;alt&gt;"');
    expect(insert.text).toContain('loading="lazy" decoding="async"');
    expect(insert.text).toContain('<figcaption>Caption &amp; &lt;text&gt;</figcaption>');
    expect(insert.text).toContain('src="https://example.com/b.webp?x=1&amp;y=2"');
    expect(insert.text).not.toContain('style=');
  });

  it('finds controlled gallery blocks and replaces the whole block range', () => {
    const gallery = createGalleryInsertText({
      columns: 'cols-3',
      items: [
        { src: './demo-assets/a.webp', alt: 'A & alt', caption: 'Caption & <text>' },
        { src: 'https://example.com/b.webp?x=1&y=2', alt: '', caption: '' }
      ]
    }).text;
    const source = ['Intro', '', gallery, '', 'Outro'].join('\n');
    const block = findEditableGalleryBlockAtSelection(source, {
      from: source.indexOf('Caption'),
      to: source.indexOf('Caption')
    });

    expect(block).toMatchObject({
      kind: 'gallery',
      range: {
        from: source.indexOf('<ul'),
        to: source.indexOf('</ul>') + '</ul>'.length
      },
      draft: {
        columns: 'cols-3',
        items: [
          { src: './demo-assets/a.webp', alt: 'A & alt', caption: 'Caption & <text>' },
          { src: 'https://example.com/b.webp?x=1&y=2', alt: '', caption: '' }
        ]
      }
    });

    const replacement = createGalleryInsertText({
      columns: 'cols-2',
      items: [{ src: './demo-assets/new.webp', alt: 'New', caption: '' }]
    });
    const edit = replaceMarkdownText(source, block?.range ?? { from: 0, to: 0 }, replacement.text, replacement.placement);
    const nextValue = `${source.slice(0, edit.from)}${edit.insert}${source.slice(edit.to)}`;

    expect(nextValue).toContain('<ul class="gallery cols-2">');
    expect(nextValue).toContain('./demo-assets/new.webp');
    expect(nextValue).not.toContain('./demo-assets/a.webp');
    expect(nextValue.match(/<ul class="gallery/g)).toHaveLength(1);
  });

  it('finds long controlled gallery blocks around the current selection without a full scan', () => {
    const items = Array.from({ length: 72 }, (_, index) => ({
      src: `./demo-assets/long-${index}.webp`,
      alt: `Long ${index}`,
      caption: `Caption ${index}`
    }));
    const gallery = createGalleryInsertText({ columns: 'cols-2', items }).text;
    const source = ['Intro', '', gallery, '', 'Outro'].join('\n');
    const targetSrc = './demo-assets/long-36.webp';
    const targetIndex = source.indexOf(targetSrc);

    expect(gallery.length).toBeGreaterThan(8192);
    expect(gallery.length).toBeLessThan(16384);

    expect(findEditableGalleryBlockAroundSelection(source, {
      from: targetIndex,
      to: targetIndex
    }, { maxChars: 8192 })).toMatchObject({
      range: {
        from: source.indexOf('<ul'),
        to: source.indexOf('</ul>') + '</ul>'.length
      },
      draft: {
        columns: 'cols-2',
        items: expect.arrayContaining([
          { src: targetSrc, alt: 'Long 36', caption: 'Caption 36' }
        ])
      }
    });

    expect(findEditableGalleryBlockAroundSelection(source, {
      from: targetIndex,
      to: targetIndex
    }, { maxChars: 1024 })).toBeNull();
  });

  it('skips non-controlled galleries and galleries inside code or comments', () => {
    const controlledGallery = createGalleryInsertText({
      columns: 'default',
      items: [{ src: './demo-assets/real.webp', alt: 'Real', caption: '' }]
    }).text;
    const inlineGallery = '<ul class="gallery"><li><figure><img src="./demo-assets/inline.webp" alt="Inline" loading="lazy" decoding="async" /></figure></li></ul>';
    const customClassGallery = '<ul class="gallery custom"><li><figure><img src="./custom.webp" alt="Custom" /></figure></li></ul>';
    const customFigureGallery = '<ul class="gallery"><li><figure class="figure"><img src="./figure.webp" alt="Figure" /></figure></li></ul>';
    const source = [
      customClassGallery,
      customFigureGallery,
      `\`${inlineGallery}\``,
      `<!-- ${controlledGallery} -->`,
      '```html',
      controlledGallery,
      '```',
      controlledGallery
    ].join('\n');

    expect(findEditableGalleryBlockAtSelection(source, {
      from: source.indexOf('custom.webp'),
      to: source.indexOf('custom.webp')
    })).toBeNull();
    expect(findEditableGalleryBlockAtSelection(source, {
      from: source.indexOf('figure.webp'),
      to: source.indexOf('figure.webp')
    })).toBeNull();
    expect(findEditableGalleryBlockAtSelection(source, {
      from: source.indexOf('inline.webp'),
      to: source.indexOf('inline.webp')
    })).toBeNull();
    const ignoredRealIndexes = [
      source.indexOf('real.webp', source.indexOf('<!--')),
      source.indexOf('real.webp', source.indexOf('```html'))
    ];
    for (const ignoredIndex of ignoredRealIndexes) {
      expect(findEditableGalleryBlockAtSelection(source, {
        from: ignoredIndex,
        to: ignoredIndex
      })).toBeNull();
    }

    const realIndex = source.lastIndexOf('real.webp');
    expect(findEditableGalleryBlockAtSelection(source, {
      from: realIndex,
      to: realIndex
    })).toMatchObject({
      draft: {
        columns: 'default',
        items: [{ src: './demo-assets/real.webp', alt: 'Real', caption: '' }]
      }
    });
  });

  it('finds editable Markdown and controlled figure blocks at the current selection', () => {
    expect(decodeHtmlText('&lt;caption&gt; &amp;lt;script&amp;gt;')).toBe('<caption> &lt;script&gt;');

    const markdownSource = 'Intro ![A \\\\ bracket \\]](./image.webp) outro';
    const markdownBlock = findEditableImageBlockAtSelection(markdownSource, { from: 12, to: 12 });

    expect(markdownBlock).toMatchObject({
      kind: 'markdown',
      range: { from: 6, to: 38 },
      draft: {
        src: './image.webp',
        alt: 'A \\ bracket ]',
        presentation: 'plain',
        caption: '',
        size: 'default',
        alignment: 'center'
      }
    });

    const figureSource = [
      'Intro',
      '',
      '<figure data-extra="x" class="figure--right figure figure--lg">',
      '  <img alt="A &quot;quoted&quot; alt" loading="lazy" src="https://example.com/a.webp?x=1&amp;y=2" />',
      '  <figcaption class="figure-caption">Caption &amp; text</figcaption>',
      '</figure>',
      '',
      'Outro'
    ].join('\n');
    const figureBlock = findEditableImageBlockAtSelection(figureSource, {
      from: figureSource.indexOf('Caption'),
      to: figureSource.indexOf('Caption')
    });

    expect(figureBlock).toMatchObject({
      kind: 'figure',
      draft: {
        src: 'https://example.com/a.webp?x=1&y=2',
        alt: 'A "quoted" alt',
        presentation: 'figure',
        caption: 'Caption & text',
        size: 'lg',
        alignment: 'right'
      }
    });

    const encodedFigureSource = [
      '<figure class="figure">',
      '  <img src="./encoded.webp?x=1&amp;y=2" alt="Encoded" />',
      '  <figcaption>Caption &amp; &amp;lt;script&amp;gt;</figcaption>',
      '</figure>'
    ].join('\n');
    expect(findEditableImageBlockAtSelection(encodedFigureSource, {
      from: encodedFigureSource.indexOf('Caption'),
      to: encodedFigureSource.indexOf('Caption')
    })).toMatchObject({
      draft: {
        src: './encoded.webp?x=1&y=2',
        caption: 'Caption & &lt;script&gt;'
      }
    });

    const richCaptionSource = [
      '<figure class="figure">',
      '  <img src="./rich.webp" alt="Rich" />',
      '  <figcaption><strong>Rich caption</strong></figcaption>',
      '</figure>'
    ].join('\n');
    expect(findEditableImageBlockAtSelection(richCaptionSource, {
      from: richCaptionSource.indexOf('rich.webp'),
      to: richCaptionSource.indexOf('rich.webp')
    })).toBeNull();

    expect(collectMarkdownBodyLocalImageReferences({
      bodyText: '<figure class="figure"><img src="./encoded&amp;lt;name.webp" alt="Encoded" /></figure>',
      sourcePath: '/project/src/content/essay/demo.md',
      projectRoot: '/project'
    })).toEqual([
      expect.objectContaining({
        src: './encoded&lt;name.webp',
        relativePath: 'src/content/essay/encoded&lt;name.webp'
      })
    ]);
  });

  it('skips non-controlled figures and images inside code or comments', () => {
    const customFigure = '<figure class="hero-figure"><img src="./custom.webp" alt="Custom" /></figure>';
    const source = [
      customFigure,
      '`![Inline](./inline.webp)`',
      '<!-- ![Comment](./comment.webp) -->',
      '```md',
      '![Fenced](./fenced.webp)',
      '```',
      '![Real](./real.webp)'
    ].join('\n');

    expect(findEditableImageBlockAtSelection(source, {
      from: source.indexOf('custom.webp'),
      to: source.indexOf('custom.webp')
    })).toBeNull();
    expect(findEditableImageBlockAtSelection(source, {
      from: source.indexOf('Inline'),
      to: source.indexOf('Inline')
    })).toBeNull();
    expect(findEditableImageBlockAtSelection(source, {
      from: source.indexOf('Comment'),
      to: source.indexOf('Comment')
    })).toBeNull();
    expect(findEditableImageBlockAtSelection(source, {
      from: source.indexOf('Fenced'),
      to: source.indexOf('Fenced')
    })).toBeNull();
    expect(findEditableImageBlockAtSelection(source, {
      from: source.indexOf('Real'),
      to: source.indexOf('Real')
    })).toMatchObject({
      draft: { src: './real.webp' }
    });
  });
});
