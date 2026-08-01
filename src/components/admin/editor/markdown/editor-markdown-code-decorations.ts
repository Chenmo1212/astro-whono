import { syntaxTree } from '@codemirror/language';
import { type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view';

const inlineCodeDecoration = Decoration.mark({
  class: 'cm-admin-markdown-inline-code'
});
const codeInfoDecoration = Decoration.mark({
  class: 'cm-admin-markdown-code-info'
});
const htmlBlockDecoration = Decoration.mark({
  class: 'cm-admin-markdown-html-block'
});

const createMarkdownCodeDecorations = (view: EditorView): DecorationSet => {
  const decorations: Array<Range<Decoration>> = [];

  syntaxTree(view.state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter: (node) => {
      switch (node.name) {
        case 'InlineCode':
          decorations.push(inlineCodeDecoration.range(node.from, node.to));
          break;
        case 'CodeInfo':
          decorations.push(codeInfoDecoration.range(node.from, node.to));
          break;
        case 'HTMLBlock':
          decorations.push(htmlBlockDecoration.range(node.from, node.to));
          break;
      }
    }
  });

  return Decoration.set(decorations, true);
};

const adminMarkdownCodeDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createMarkdownCodeDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = createMarkdownCodeDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
);

export const getMarkdownCodeDecorationsExtension = () => adminMarkdownCodeDecorations;
