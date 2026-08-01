<script lang="ts">
import type {
  AdminContentBodyImageUploadCollectionKey,
  AdminContentWriteCollectionKey
} from '../../../../lib/admin-console/content-collections';
import type {
  AdminContentWorkspaceEditorValues
} from '../../../../lib/admin-console/content-editor-payload';
import type { AdminContentIssue } from '../shared/content-editor-client';
import ArticleInfoDialog from '../frontmatter/ArticleInfoDialog.svelte';
import GalleryInsertDialog from '../media-insert/GalleryInsertDialog.svelte';
import ImageInsertDialog from '../media-insert/ImageInsertDialog.svelte';
import type { MarkdownInsertPlacement } from '../markdown/markdown-tools';
import type { ImageBlockDraft } from '../media-insert/image-insert-helpers';
import type { GalleryBlockDraft } from '../media-insert/gallery-insert-helpers';

type Props = {
  frontmatter: AdminContentWorkspaceEditorValues;
  collection: AdminContentWriteCollectionKey;
  dialogTitle: string;
  fieldsAriaLabel: string;
  frontmatterOpen: boolean;
  relativePath: string;
  issues: readonly AdminContentIssue[];
  disabled: boolean;
  frontmatterDirty: boolean;
  canSave: boolean;
  slugPlaceholder: string;
  imageInsertOpen: boolean;
  galleryInsertOpen: boolean;
  imageUploadCollection?: AdminContentBodyImageUploadCollectionKey;
  imageEditDraft?: ImageBlockDraft | null;
  galleryEditDraft?: GalleryBlockDraft | null;
  imageInsertEnabled: boolean;
  galleryInsertEnabled: boolean;
  imageUploadEndpoint: string;
  entryId: string;
  onFrontmatterClose: () => void;
  onFrontmatterReset: () => void;
  onFrontmatterSave: () => void | Promise<void>;
  onImageClose: () => void;
  onImageInsert: (text: string, placement?: MarkdownInsertPlacement) => void;
  onGalleryClose: () => void;
  onGalleryInsert: (text: string, placement?: MarkdownInsertPlacement) => void;
  onGalleryRemove?: () => void;
};

let {
  frontmatter = $bindable(),
  collection,
  dialogTitle,
  fieldsAriaLabel,
  frontmatterOpen,
  relativePath,
  issues,
  disabled,
  frontmatterDirty,
  canSave,
  slugPlaceholder,
  imageInsertOpen,
  galleryInsertOpen,
  imageUploadCollection,
  imageEditDraft = null,
  galleryEditDraft = null,
  imageInsertEnabled,
  galleryInsertEnabled,
  imageUploadEndpoint,
  entryId,
  onFrontmatterClose,
  onFrontmatterReset,
  onFrontmatterSave,
  onImageClose,
  onImageInsert,
  onGalleryClose,
  onGalleryInsert,
  onGalleryRemove
}: Props = $props();

let articleInfoDialog = $state<ArticleInfoDialog | null>(null);

export const captureReturnFocus = (trigger?: Element | null) => {
  articleInfoDialog?.captureReturnFocus(trigger);
};
</script>

<ArticleInfoDialog
  bind:this={articleInfoDialog}
  bind:value={frontmatter}
  {collection}
  {dialogTitle}
  {fieldsAriaLabel}
  open={frontmatterOpen}
  {relativePath}
  {issues}
  {disabled}
  dirty={frontmatterDirty}
  {canSave}
  {slugPlaceholder}
  onClose={onFrontmatterClose}
  onReset={onFrontmatterReset}
  onSave={onFrontmatterSave}
/>

{#if imageInsertEnabled}
  <ImageInsertDialog
    open={imageInsertOpen}
    editDraft={imageEditDraft}
    collection={imageUploadCollection ?? 'essay'}
    uploadEndpoint={imageUploadEndpoint}
    {entryId}
    {disabled}
    onClose={onImageClose}
    onInsert={onImageInsert}
  />
{/if}

{#if galleryInsertEnabled}
  <GalleryInsertDialog
    open={galleryInsertOpen}
    editDraft={galleryEditDraft}
    uploadEndpoint={imageUploadEndpoint}
    {entryId}
    {disabled}
    onClose={onGalleryClose}
    onInsert={onGalleryInsert}
    onRemove={onGalleryRemove}
  />
{/if}
