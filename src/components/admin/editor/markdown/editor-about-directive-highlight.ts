import { type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view';

type AboutDirectiveName = 'friend' | 'faq' | 'site-info';

const directiveLineRe = /^\s*(?::{3,}(friend|faq)|:{2,}(site-info))\b/;
const attributeRe = /([A-Za-z][\w:-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'}]+)/g;
const urlValueRe = /^https?:\/\//i;
const localAvatarPathValueRe = /^(?:\.\/)?[\w.-]+(?:\/[\w.-]+)+\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const friendAttributeNames = new Set(['name', 'url', 'avatar']);
const faqAttributeNames = new Set(['question']);
const siteInfoAttributeNames = new Set(['name', 'url', 'description', 'avatar']);

const directiveStringValueDecoration = Decoration.mark({
  class: 'cm-admin-about-directive-input cm-admin-about-directive-input--text'
});
const directiveQuestionValueDecoration = Decoration.mark({
  class: 'cm-admin-about-directive-input cm-admin-about-directive-input--question'
});
const directiveUrlValueDecoration = Decoration.mark({
  class: 'cm-admin-about-directive-input cm-admin-about-directive-input--url'
});
const directivePathValueDecoration = Decoration.mark({
  class: 'cm-admin-about-directive-input cm-admin-about-directive-input--path'
});

const shouldHighlightAttribute = (
  directiveName: AboutDirectiveName,
  attributeName: string
): boolean =>
  directiveName === 'friend'
    ? friendAttributeNames.has(attributeName)
    : directiveName === 'faq'
      ? faqAttributeNames.has(attributeName)
      : siteInfoAttributeNames.has(attributeName);

const getValueDecoration = (
  directiveName: AboutDirectiveName,
  attributeName: string,
  value: string
): Decoration => {
  if (directiveName === 'faq' && attributeName === 'question') return directiveQuestionValueDecoration;
  if (urlValueRe.test(value)) return directiveUrlValueDecoration;
  if (
    (directiveName === 'friend' || directiveName === 'site-info')
    && attributeName === 'avatar'
    && localAvatarPathValueRe.test(value)
  ) {
    return directivePathValueDecoration;
  }
  return directiveStringValueDecoration;
};

const stripAttributeValueQuotes = (rawValue: string) => {
  const firstChar = rawValue[0];
  const lastChar = rawValue[rawValue.length - 1];
  if ((firstChar === '"' || firstChar === "'") && lastChar === firstChar) {
    return {
      value: rawValue.slice(1, -1),
      quoteLength: 1
    };
  }

  return {
    value: rawValue,
    quoteLength: 0
  };
};

const addAboutDirectiveLineDecorations = (
  decorations: Array<Range<Decoration>>,
  lineFrom: number,
  lineText: string
) => {
  const directiveMatch = directiveLineRe.exec(lineText);
  if (!directiveMatch) return;

  const directiveName = directiveMatch[1] ?? directiveMatch[2];
  if (directiveName !== 'friend' && directiveName !== 'faq' && directiveName !== 'site-info') return;

  const openBraceIndex = lineText.indexOf('{', directiveMatch[0].length);
  if (openBraceIndex < 0) return;

  const closeBraceIndex = lineText.indexOf('}', openBraceIndex + 1);
  const attributesEndIndex = closeBraceIndex < 0 ? lineText.length : closeBraceIndex;

  const attributesText = lineText.slice(openBraceIndex + 1, attributesEndIndex);
  const attributesFrom = lineFrom + openBraceIndex + 1;
  attributeRe.lastIndex = 0;

  for (let match = attributeRe.exec(attributesText); match; match = attributeRe.exec(attributesText)) {
    const [fullMatch, attributeName, rawValue] = match;
    if (!fullMatch || !attributeName || !rawValue) continue;
    if (!shouldHighlightAttribute(directiveName, attributeName)) continue;

    const rawValueOffset = fullMatch.lastIndexOf(rawValue);
    const valueFrom = attributesFrom + match.index + rawValueOffset;
    const valueTo = valueFrom + rawValue.length;
    const { value, quoteLength } = stripAttributeValueQuotes(rawValue);
    const valueContentFrom = valueFrom + quoteLength;
    const valueContentTo = valueTo - quoteLength;

    if (valueContentFrom < valueContentTo) {
      decorations.push(
        getValueDecoration(directiveName, attributeName, value)
          .range(valueContentFrom, valueContentTo)
      );
    }
  }
};

const createAboutDirectiveDecorations = (view: EditorView): DecorationSet => {
  const decorations: Array<Range<Decoration>> = [];
  let position = view.viewport.from;

  while (position <= view.viewport.to && position <= view.state.doc.length) {
    const line = view.state.doc.lineAt(position);
    addAboutDirectiveLineDecorations(decorations, line.from, line.text);
    if (line.to >= view.state.doc.length) break;
    position = line.to + 1;
  }

  return Decoration.set(decorations, true);
};

const adminAboutDirectiveHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createAboutDirectiveDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = createAboutDirectiveDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
);

export const getAboutDirectiveHighlightExtension = (): Extension =>
  adminAboutDirectiveHighlight;
