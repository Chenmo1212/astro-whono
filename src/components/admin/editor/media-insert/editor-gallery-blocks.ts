import {
  findEssayGalleryBlockAroundSelection,
  findEssayGalleryBlockAtSelection,
  type EssayGalleryBlock,
  type EssayGalleryBlockSearchOptions
} from '../../../../lib/admin-console/essay-gallery-blocks';
import type { EditorTextSelection } from '../markdown/editor-markdown-transforms';
import type { GalleryBlockDraft } from './gallery-insert-helpers';

export type EditableGalleryBlock = Omit<EssayGalleryBlock, 'draft'> & {
  draft: GalleryBlockDraft;
};

export type EditableGalleryBlockSearchOptions = EssayGalleryBlockSearchOptions;

const toEditableGalleryBlock = (block: EssayGalleryBlock | null): EditableGalleryBlock | null =>
  block as EditableGalleryBlock | null;

export const findEditableGalleryBlockAtSelection = (
  source: string,
  selection: EditorTextSelection
): EditableGalleryBlock | null =>
  toEditableGalleryBlock(findEssayGalleryBlockAtSelection(source, selection));

export const findEditableGalleryBlockAroundSelection = (
  source: string,
  selection: EditorTextSelection,
  options: EditableGalleryBlockSearchOptions = {}
): EditableGalleryBlock | null =>
  toEditableGalleryBlock(findEssayGalleryBlockAroundSelection(source, selection, options));
