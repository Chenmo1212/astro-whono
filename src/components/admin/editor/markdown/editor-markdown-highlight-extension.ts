import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

// 只在 CodeMirror token 层定义语义映射；具体 preset palette 由 pane-content.css 的
// data-markdown-highlight-theme 变量控制，避免 fixed color 在暗色模式下失效。
const adminMarkdownHighlightStyle = HighlightStyle.define([
  {
    tag: [
      tags.meta,
      tags.punctuation,
      tags.processingInstruction,
      tags.contentSeparator
    ],
    color: 'var(--admin-editor-markdown-marker-color)'
  },
  {
    tag: tags.comment,
    color: 'var(--admin-editor-markdown-comment-color)'
  },
  {
    tag: tags.angleBracket,
    color: 'var(--admin-editor-markdown-html-color)'
  },
  {
    tag: tags.tagName,
    color: 'var(--admin-editor-markdown-html-tag-color)'
  },
  {
    tag: tags.attributeName,
    color: 'var(--admin-editor-markdown-html-attribute-color)'
  },
  {
    tag: tags.attributeValue,
    color: 'var(--admin-editor-markdown-html-value-color)'
  },
  {
    tag: tags.heading,
    color: 'var(--admin-editor-markdown-heading-color)',
    fontWeight: '650'
  },
  {
    tag: [
      tags.heading1,
      tags.heading2
    ],
    color: 'var(--admin-editor-markdown-heading-color)',
    fontWeight: '650'
  },
  {
    tag: tags.heading3,
    color: 'var(--admin-editor-markdown-heading3-color)',
    fontWeight: '650'
  },
  {
    tag: [
      tags.heading4,
      tags.heading5,
      tags.heading6
    ],
    color: 'var(--admin-editor-markdown-heading-muted-color)',
    fontWeight: '650'
  },
  {
    tag: tags.link,
    color: 'var(--admin-editor-markdown-link-color)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--admin-editor-markdown-link-underline)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px'
  },
  {
    tag: tags.url,
    color: 'var(--admin-editor-markdown-url-color)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--admin-editor-markdown-link-underline)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px'
  },
  {
    tag: tags.monospace,
    color: 'var(--admin-editor-markdown-code-color)'
  },
  {
    tag: tags.quote,
    color: 'var(--admin-editor-markdown-quote-color)',
    fontStyle: 'italic'
  },
  {
    tag: tags.emphasis,
    color: 'var(--admin-editor-markdown-emphasis-color)',
    fontStyle: 'italic'
  },
  {
    tag: tags.strong,
    color: 'var(--admin-editor-markdown-strong-color)',
    fontWeight: '700'
  },
  {
    tag: tags.strikethrough,
    color: 'var(--admin-editor-markdown-strike-color)',
    textDecoration: 'line-through'
  },
  {
    tag: [
      tags.keyword,
      tags.atom,
      tags.bool,
      tags.number,
      tags.string,
      tags.literal
    ],
    color: 'var(--admin-editor-markdown-literal-color)'
  },
  {
    tag: tags.invalid,
    color: 'var(--admin-error-accent)',
    textDecoration: 'underline wavy var(--admin-error-accent)'
  }
]);

export const getMarkdownHighlightExtension = (): Extension =>
  syntaxHighlighting(adminMarkdownHighlightStyle);
