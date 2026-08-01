import {
  findEssayImageBlockAtSelection,
  findEssayImageBlockNearSelection,
  type EssayImageBlock,
  type EssayImageBlockKind,
  type EssayImageBlockSearchOptions
} from '../../../../lib/admin-console/essay-image-blocks';
import type { EditorTextSelection } from '../markdown/editor-markdown-transforms';
import type { ImageBlockDraft } from './image-insert-helpers';

export type EditableImageBlockKind = EssayImageBlockKind;

export type EditableImageBlock = Omit<EssayImageBlock, 'draft'> & {
  draft: ImageBlockDraft;
};

export type EditableImageBlockSearchOptions = EssayImageBlockSearchOptions;

const toEditableImageBlock = (block: EssayImageBlock | null): EditableImageBlock | null =>
  block as EditableImageBlock | null;

export const findEditableImageBlockAtSelection = (
  source: string,
  selection: EditorTextSelection
): EditableImageBlock | null =>
  toEditableImageBlock(findEssayImageBlockAtSelection(source, selection));

export const findEditableImageBlockNearSelection = (
  source: string,
  selection: EditorTextSelection,
  options: EditableImageBlockSearchOptions = {}
): EditableImageBlock | null =>
  toEditableImageBlock(findEssayImageBlockNearSelection(source, selection, options));
