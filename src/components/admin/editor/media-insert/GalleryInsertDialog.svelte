<script lang="ts">
import { createModalDialogFocusController } from '../../../../scripts/admin-console/modal-dialog-focus';
import AdminEditorIcon from '../shared/AdminEditorIcon.svelte';
import { uploadEssayEditorImage } from './editor-image-upload';
import {
  GALLERY_IMAGE_SOURCE_ERROR,
  createGalleryInsertText,
  normalizeGalleryImageSource,
  type GalleryBlockDraft,
  type GalleryColumnMode,
  type GalleryImageDraft
} from './gallery-insert-helpers';
import type { MarkdownInsertPlacement } from '../markdown/markdown-tools';

type GalleryItem = {
  id: number;
  source: string;
  alt: string;
  caption: string;
};

type Props = {
  open: boolean;
  editDraft?: GalleryBlockDraft | null;
  uploadEndpoint: string;
  entryId: string;
  disabled?: boolean;
  onClose: () => void;
  onInsert: (text: string, placement?: MarkdownInsertPlacement) => void;
  onRemove?: () => void;
};

const GALLERY_COLUMN_OPTIONS: Array<{ value: GalleryColumnMode; label: string }> = [
  { value: 'default', label: '自适应' },
  { value: 'cols-2', label: '两列' },
  { value: 'cols-3', label: '三列' }
];

let {
  open,
  editDraft = null,
  uploadEndpoint,
  entryId,
  disabled = false,
  onClose,
  onInsert,
  onRemove
}: Props = $props();

let nextItemId = 0;
let dialogPanelEl = $state<HTMLElement | null>(null);
let closeButtonEl = $state<HTMLButtonElement | null>(null);
let addButtonEl = $state<HTMLButtonElement | null>(null);
let fileInputEl = $state<HTMLInputElement | null>(null);
let columns = $state<GalleryColumnMode>('default');
let items = $state<GalleryItem[]>([]);
let uploadTargetItemId = $state<number | null>(null);
let uploadingItemId = $state<number | null>(null);
let errorText = $state('');
let appliedEditDraftKey = $state('');

const busy = $derived(uploadingItemId !== null);
const dialogTitle = $derived(editDraft ? '编辑画廊' : '插入画廊');
const submitButtonText = $derived(busy ? '上传中…' : editDraft ? '保存画廊' : '插入画廊');
const removeGalleryConfirmMessage = [
  '确认移除整个画廊？',
  '',
  '此操作只会从正文中移除该画廊，不会删除图片文件。'
].join('\n');

const createGalleryItem = (): GalleryItem => {
  nextItemId += 1;
  return {
    id: nextItemId,
    source: '',
    alt: '',
    caption: ''
  };
};

const createGalleryItemFromDraft = (draft: GalleryImageDraft): GalleryItem => {
  nextItemId += 1;
  return {
    id: nextItemId,
    source: draft.src,
    alt: draft.alt,
    caption: draft.caption
  };
};

const createInitialGalleryItems = (): GalleryItem[] => [
  createGalleryItem(),
  createGalleryItem()
];

const resetDialog = () => {
  columns = 'default';
  items = createInitialGalleryItems();
  uploadTargetItemId = null;
  uploadingItemId = null;
  errorText = '';
  appliedEditDraftKey = '';
  if (fileInputEl) fileInputEl.value = '';
};

const getEditDraftKey = (draft: GalleryBlockDraft | null): string =>
  draft
    ? [
      draft.columns,
      ...draft.items.map((item) => [item.src, item.alt, item.caption].join('\u0000'))
    ].join('\u0001')
    : '';

const applyEditDraft = (draft: GalleryBlockDraft) => {
  columns = draft.columns;
  items = draft.items.length > 0
    ? draft.items.map((item) => createGalleryItemFromDraft(item))
    : createInitialGalleryItems();
  uploadTargetItemId = null;
  uploadingItemId = null;
  errorText = '';
  if (fileInputEl) fileInputEl.value = '';
};

const finishDialog = (options: { restoreFocus?: boolean } = {}) => {
  resetDialog();
  onClose();
  if (options.restoreFocus !== false) {
    galleryDialogFocus.restoreFocus();
  }
};

const closeDialog = () => {
  if (busy) return;
  finishDialog();
};

const updateItem = (id: number, patch: Partial<Omit<GalleryItem, 'id'>>) => {
  items = items.map((item) => item.id === id ? { ...item, ...patch } : item);
  errorText = '';
};

const addItem = () => {
  if (disabled || busy) return;
  items = [...items, createGalleryItem()];
  errorText = '';
};

const removeItem = (id: number) => {
  if (disabled || busy || items.length <= 1) return;
  items = items.filter((item) => item.id !== id);
  errorText = '';
};

const moveItem = (id: number, direction: -1 | 1) => {
  if (disabled || busy) return;

  const currentIndex = items.findIndex((item) => item.id === id);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;

  const nextItems = [...items];
  const currentItem = nextItems[currentIndex];
  const nextItem = nextItems[nextIndex];
  if (!currentItem || !nextItem) return;

  nextItems[currentIndex] = nextItem;
  nextItems[nextIndex] = currentItem;
  items = nextItems;
};

const requestUpload = (id: number) => {
  if (disabled || busy) return;
  uploadTargetItemId = id;
  if (fileInputEl) fileInputEl.value = '';
  fileInputEl?.click();
};

const handleFileChange = async () => {
  const itemId = uploadTargetItemId;
  const [file] = Array.from(fileInputEl?.files ?? []);
  uploadTargetItemId = null;
  if (!file || itemId === null) return;

  uploadingItemId = itemId;
  errorText = '';

  const upload = await uploadEssayEditorImage({ uploadEndpoint, entryId, file });
  if (upload.ok) {
    updateItem(itemId, { source: upload.result.src });
  } else {
    errorText = upload.error;
  }

  uploadingItemId = null;
  if (fileInputEl) fileInputEl.value = '';
};

const getPreparedItems = (): GalleryImageDraft[] | null => {
  const prepared: GalleryImageDraft[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;

    const hasAnyValue = Boolean(item.source.trim() || item.alt.trim() || item.caption.trim());
    if (!hasAnyValue) continue;

    const source = normalizeGalleryImageSource(item.source);
    if (!source) {
      errorText = `第 ${index + 1} 张图片来源无效：${GALLERY_IMAGE_SOURCE_ERROR}`;
      return null;
    }

    prepared.push({
      src: source,
      alt: item.alt,
      caption: item.caption
    });
  }

  if (prepared.length === 0) {
    errorText = '至少填写一张图片';
    return null;
  }

  return prepared;
};

const submitGallery = () => {
  if (disabled || busy) return;

  const preparedItems = getPreparedItems();
  if (!preparedItems) return;

  const galleryInsert = createGalleryInsertText({
    columns,
    items: preparedItems
  });
  onInsert(galleryInsert.text, galleryInsert.placement);
  finishDialog({ restoreFocus: false });
};

const removeGallery = () => {
  if (disabled || busy || !editDraft || !onRemove) return;
  if (!window.confirm(removeGalleryConfirmMessage)) return;

  onRemove();
  finishDialog({ restoreFocus: false });
};

const galleryDialogFocus = createModalDialogFocusController({
  getDialog: () => dialogPanelEl,
  getInitialFocus: () =>
    dialogPanelEl?.querySelector<HTMLInputElement>('[data-gallery-source-input]')
    ?? addButtonEl
    ?? closeButtonEl,
  onClose: () => closeDialog()
});

$effect(() => {
  if (!open) {
    resetDialog();
    return;
  }

  const editDraftKey = getEditDraftKey(editDraft);
  if (editDraft && editDraftKey !== appliedEditDraftKey) {
    applyEditDraft(editDraft);
    appliedEditDraftKey = editDraftKey;
  }

  if (items.length === 0) {
    items = createInitialGalleryItems();
  }

  galleryDialogFocus.captureReturnFocus();
  galleryDialogFocus.focusInitial();
  document.addEventListener('keydown', galleryDialogFocus.handleKeydown);
  return () => {
    document.removeEventListener('keydown', galleryDialogFocus.handleKeydown);
  };
});
</script>

{#if open}
  <div class="admin-modal admin-editor-gallery-insert" role="presentation">
    <button
      class="admin-modal__backdrop admin-editor-gallery-insert__backdrop"
      type="button"
      aria-label={`关闭${dialogTitle}`}
      onclick={closeDialog}
    ></button>
    <div
      bind:this={dialogPanelEl}
      class="admin-modal__panel admin-editor-gallery-insert__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-editor-gallery-insert-title"
      tabindex="-1"
    >
      <form
        class="admin-editor-gallery-insert__form"
        onsubmit={(event) => {
          event.preventDefault();
          submitGallery();
        }}
      >
        <header class="admin-modal__head admin-editor-gallery-insert__head">
          <div class="admin-editor-gallery-insert__title-wrap">
            <span class="admin-editor-gallery-insert__icon" aria-hidden="true">
              <AdminEditorIcon name="images" size={16} strokeWidth={2} />
            </span>
            <h3 id="admin-editor-gallery-insert-title" class="admin-modal__title admin-content-section-title">{dialogTitle}</h3>
          </div>
          <div class="admin-editor-gallery-insert__head-controls">
            <button
              bind:this={addButtonEl}
              class="admin-btn admin-btn--ghost admin-btn--compact admin-editor-gallery-insert__add"
              type="button"
              disabled={disabled || busy}
              onclick={addItem}
            >
              <AdminEditorIcon name="plus" size={14} strokeWidth={2} />
              <span>添加图片</span>
            </button>
            <button
              bind:this={closeButtonEl}
              class="admin-btn admin-btn--ghost admin-btn--compact admin-btn--icon admin-editor-gallery-insert__close"
              type="button"
              aria-label={`关闭${dialogTitle}`}
              disabled={busy}
              onclick={closeDialog}
            >
              <AdminEditorIcon name="close" size={16} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div class="admin-modal__body admin-editor-gallery-insert__body">
          <input
            bind:this={fileInputEl}
            class="admin-sr-only"
            type="file"
            accept="image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp"
            tabindex="-1"
            onchange={() => void handleFileChange()}
          />

          <div class="admin-editor-gallery-insert__items" aria-label="画廊图片">
            {#each items as item, index (item.id)}
              <section class="admin-editor-gallery-insert__item" aria-label={`第 ${index + 1} 张图片`}>
                <div class="admin-field admin-editor-gallery-insert__field">
                  <div class="admin-editor-gallery-insert__item-head">
                    <label class="admin-field__label admin-editor-gallery-insert__source-label" for={`admin-editor-gallery-source-${item.id}`}>
                      <span class="admin-editor-gallery-insert__item-index">#{index + 1}</span>
                      <span>图片</span>
                    </label>
                    <div class="admin-editor-gallery-insert__sort-actions" role="group" aria-label={`调整第 ${index + 1} 张图片顺序`}>
                      <button
                        class="admin-btn admin-btn--ghost admin-btn--compact admin-btn--icon admin-editor-gallery-insert__item-action"
                        type="button"
                        title="上移"
                        aria-label={`上移第 ${index + 1} 张图片`}
                        disabled={disabled || busy || index === 0}
                        onclick={() => moveItem(item.id, -1)}
                      >
                        <AdminEditorIcon name="arrow-up" size={14} strokeWidth={2} />
                      </button>
                      <button
                        class="admin-btn admin-btn--ghost admin-btn--compact admin-btn--icon admin-editor-gallery-insert__item-action"
                        type="button"
                        title="下移"
                        aria-label={`下移第 ${index + 1} 张图片`}
                        disabled={disabled || busy || index === items.length - 1}
                        onclick={() => moveItem(item.id, 1)}
                      >
                        <AdminEditorIcon name="arrow-down" size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                  <div class="admin-editor-gallery-insert__source-control" class:is-disabled={disabled || busy}>
                    <div class="admin-editor-gallery-insert__source-actions admin-editor-gallery-insert__source-actions--leading" role="group" aria-label={`第 ${index + 1} 张图片上传操作`}>
                      <button
                        class="admin-btn admin-btn--ghost admin-btn--compact admin-btn--icon admin-editor-gallery-insert__source-action"
                        type="button"
                        title={uploadingItemId === item.id ? '上传中…' : '上传'}
                        aria-label={uploadingItemId === item.id ? `第 ${index + 1} 张图片上传中` : `上传第 ${index + 1} 张图片`}
                        aria-busy={uploadingItemId === item.id}
                        disabled={disabled || busy}
                        onclick={() => requestUpload(item.id)}
                      >
                        <AdminEditorIcon name="upload" size={14} strokeWidth={2} />
                      </button>
                    </div>
                    <input
                      id={`admin-editor-gallery-source-${item.id}`}
                      class="admin-field__control admin-editor-gallery-insert__source-input"
                      data-gallery-source-input
                      type="text"
                      inputmode="url"
                      autocomplete="off"
                      value={item.source}
                      disabled={disabled || busy}
                      placeholder="请上传图片或输入图片链接"
                      oninput={(event) => updateItem(item.id, { source: event.currentTarget.value })}
                    />
                    <div class="admin-editor-gallery-insert__source-actions admin-editor-gallery-insert__source-actions--trailing" role="group" aria-label={`第 ${index + 1} 张图片删除操作`}>
                      <button
                        class="admin-btn admin-btn--ghost admin-btn--compact admin-btn--icon admin-editor-gallery-insert__source-action admin-editor-gallery-insert__source-action--danger"
                        type="button"
                        title="删除"
                        aria-label={`删除第 ${index + 1} 张图片`}
                        disabled={disabled || busy || items.length <= 1}
                        onclick={() => removeItem(item.id)}
                      >
                        <AdminEditorIcon name="trash" size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="admin-editor-gallery-insert__meta-grid">
                  <label class="admin-field admin-editor-gallery-insert__field">
                    <span class="admin-field__label">图片描述</span>
                    <input
                      class="admin-field__control"
                      type="text"
                      value={item.alt}
                      disabled={disabled || busy}
                      placeholder="写入 alt，可留空"
                      oninput={(event) => updateItem(item.id, { alt: event.currentTarget.value })}
                    />
                  </label>

                  <label class="admin-field admin-editor-gallery-insert__field">
                    <span class="admin-field__label">图注</span>
                    <input
                      class="admin-field__control"
                      type="text"
                      value={item.caption}
                      disabled={disabled || busy}
                      placeholder="显示在图片下方，可留空"
                      oninput={(event) => updateItem(item.id, { caption: event.currentTarget.value })}
                    />
                  </label>
                </div>
              </section>
            {/each}
          </div>

          {#if errorText}
            <p class="admin-editor-gallery-insert__error" role="alert">{errorText}</p>
          {/if}
        </div>

        <footer class="admin-modal__actions admin-editor-gallery-insert__actions">
          <div class="admin-editor-gallery-insert__left-actions">
            <div class="admin-editor-gallery-insert__columns" role="group" aria-label="画廊列数">
              {#each GALLERY_COLUMN_OPTIONS as option}
                <button
                  class="admin-editor-gallery-insert__option-button"
                  class:is-active={columns === option.value}
                  type="button"
                  aria-pressed={columns === option.value}
                  disabled={disabled || busy}
                  onclick={() => {
                    columns = option.value;
                    errorText = '';
                  }}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>
          <div class="admin-editor-gallery-insert__action-buttons">
            {#if editDraft && onRemove}
              <button
                class="admin-btn admin-btn--ghost admin-btn--compact admin-editor-gallery-insert__remove"
                type="button"
                disabled={disabled || busy}
                onclick={removeGallery}
              >
                <AdminEditorIcon name="trash" size={14} strokeWidth={2} />
                <span>移除画廊</span>
              </button>
            {/if}
            <button class="admin-btn admin-btn--ghost admin-btn--compact" type="button" disabled={busy} onclick={closeDialog}>取消</button>
            <button class="admin-btn admin-btn--primary admin-btn--compact" type="submit" disabled={disabled || busy}>
              {submitButtonText}
            </button>
          </div>
        </footer>
      </form>
    </div>
  </div>
{/if}
