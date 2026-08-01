import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { showTooltip, type Tooltip } from '@codemirror/view';
import {
  findEditableImageBlockAtSelection,
  type EditableImageBlock
} from './editor-image-blocks';
import {
  findEditableGalleryBlockAroundSelection,
  type EditableGalleryBlock
} from './editor-gallery-blocks';
import { resolveNearbyImageSearchChars } from '../../../../lib/admin-console/essay-image-blocks';
import type { EditorTextSelection } from '../markdown/editor-markdown-transforms';

type ImageEditTooltipOptions = {
  isDisabled: () => boolean;
  onEditImageBlock: (block: EditableImageBlock) => void;
  onEditGalleryBlock?: (block: EditableGalleryBlock) => void;
};

type EditableMediaBlock =
  | { type: 'image'; block: EditableImageBlock }
  | { type: 'gallery'; block: EditableGalleryBlock };

const IGNORED_MARKDOWN_NODE_NAMES = new Set([
  'FencedCode',
  'CodeText',
  'CodeMark',
  'CodeInfo',
  'InlineCode',
  'Comment',
  'CommentBlock'
]);

const getEditorSelection = (state: EditorState): EditorTextSelection => {
  const selection = state.selection.main;
  return {
    from: selection.from,
    to: selection.to
  };
};

const isIgnoredMarkdownPosition = (state: EditorState, pos: number): boolean => {
  const tree = syntaxTree(state);
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
    Math.max(0, Math.min(state.doc.length, pos)),
    -1
  );
  while (node) {
    if (IGNORED_MARKDOWN_NODE_NAMES.has(node.name)) return true;
    node = node.parent;
  }
  return false;
};

const isSelectionInIgnoredMarkdown = (state: EditorState): boolean => {
  const selection = state.selection.main;
  if (selection.from === selection.to) return isIgnoredMarkdownPosition(state, selection.from);

  return (
    isIgnoredMarkdownPosition(state, selection.from)
    || isIgnoredMarkdownPosition(state, Math.max(selection.from, selection.to - 1))
  );
};

type NearbyMediaSearchContext = {
  source: string;
  selection: EditorTextSelection;
  offset: number;
};

const offsetImageBlock = (block: EditableImageBlock, offset: number): EditableImageBlock => ({
  ...block,
  range: {
    from: block.range.from + offset,
    to: block.range.to + offset
  }
});

const offsetGalleryBlock = (block: EditableGalleryBlock, offset: number): EditableGalleryBlock => ({
  ...block,
  range: {
    from: block.range.from + offset,
    to: block.range.to + offset
  }
});

const getNearbyMediaSearchContext = (
  state: EditorState,
  selection: EditorTextSelection
): NearbyMediaSearchContext => {
  const maxChars = resolveNearbyImageSearchChars();
  const roughFrom = Math.max(0, selection.from - maxChars);
  const roughTo = Math.min(state.doc.length, selection.to + maxChars);
  const from = state.doc.lineAt(roughFrom).from;
  const to = state.doc.lineAt(roughTo).to;

  return {
    source: state.doc.sliceString(from, to),
    selection: {
      from: selection.from - from,
      to: selection.to - from
    },
    offset: from
  };
};

const findMediaBlockForState = (
  state: EditorState,
  isDisabled: () => boolean,
  canEditGallery: boolean
): EditableMediaBlock | null => {
  if (isDisabled()) return null;
  if (isSelectionInIgnoredMarkdown(state)) return null;

  const selection = getEditorSelection(state);
  const searchContext = getNearbyMediaSearchContext(state, selection);

  if (canEditGallery) {
    const galleryBlock = findEditableGalleryBlockAroundSelection(
      searchContext.source,
      searchContext.selection
    );
    if (galleryBlock) {
      return { type: 'gallery', block: offsetGalleryBlock(galleryBlock, searchContext.offset) };
    }
  }

  const imageBlock = findEditableImageBlockAtSelection(searchContext.source, searchContext.selection);
  return imageBlock
    ? { type: 'image', block: offsetImageBlock(imageBlock, searchContext.offset) }
    : null;
};

const isSameImageBlock = (
  left: EditableImageBlock | null,
  right: EditableImageBlock | null
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind
    && left.range.from === right.range.from
    && left.range.to === right.range.to
    && left.sourceText === right.sourceText
  );
};

const isSameGalleryBlock = (
  left: EditableGalleryBlock | null,
  right: EditableGalleryBlock | null
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.range.from === right.range.from
    && left.range.to === right.range.to
    && left.sourceText === right.sourceText
  );
};

const isSameMediaBlock = (
  left: EditableMediaBlock | null,
  right: EditableMediaBlock | null
): boolean => {
  if (left === right) return true;
  if (!left || !right || left.type !== right.type) return false;
  if (left.type === 'image' && right.type === 'image') {
    return isSameImageBlock(left.block, right.block);
  }
  if (left.type === 'gallery' && right.type === 'gallery') {
    return isSameGalleryBlock(left.block, right.block);
  }
  return false;
};

const createMediaEditTooltip = (
  mediaBlock: EditableMediaBlock,
  onEditImageBlock: (block: EditableImageBlock) => void,
  onEditGalleryBlock?: (block: EditableGalleryBlock) => void
): Tooltip => ({
  pos: mediaBlock.block.range.from,
  end: mediaBlock.block.range.to,
  above: true,
  create: () => {
    const button = document.createElement('button');
    button.className = mediaBlock.type === 'gallery'
      ? 'admin-editor-image-edit-tooltip admin-editor-image-edit-tooltip--gallery'
      : 'admin-editor-image-edit-tooltip';
    button.type = 'button';
    button.textContent = mediaBlock.type === 'gallery' ? '编辑画廊' : '编辑图片';
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (mediaBlock.type === 'gallery') {
        onEditGalleryBlock?.(mediaBlock.block);
        return;
      }
      onEditImageBlock(mediaBlock.block);
    });
    return { dom: button };
  }
});

export const getImageEditTooltipExtension = ({
  isDisabled,
  onEditImageBlock,
  onEditGalleryBlock
}: ImageEditTooltipOptions): Extension => {
  const imageBlockField = StateField.define<EditableMediaBlock | null>({
    create: (state) => findMediaBlockForState(state, isDisabled, Boolean(onEditGalleryBlock)),
    update: (block, transaction) => {
      if (isDisabled()) return null;
      if (!transaction.docChanged && !transaction.selection) return block;
      return findMediaBlockForState(transaction.state, isDisabled, Boolean(onEditGalleryBlock));
    },
    compare: isSameMediaBlock,
    provide: (field) =>
      showTooltip.computeN([field], (state) => {
        const block = state.field(field);
        return block ? [createMediaEditTooltip(block, onEditImageBlock, onEditGalleryBlock)] : [];
      })
  });

  return imageBlockField;
};
