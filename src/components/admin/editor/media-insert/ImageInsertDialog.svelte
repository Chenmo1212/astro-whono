<script lang="ts">
import { createModalDialogFocusController } from '../../../../scripts/admin-console/modal-dialog-focus';
import AdminEditorIcon from '../shared/AdminEditorIcon.svelte';
import type { AdminContentBodyImageUploadCollectionKey } from '../../../../lib/admin-console/content-collections';
import { uploadContentEditorImage, type EditorImageUploadResult } from './editor-image-upload';
import {
  REMOTE_IMAGE_URL_ERROR,
  createImageInsertText,
  type ImageBlockDraft,
  type ImageDisplayAlignment,
  type ImageDisplaySize,
  type ImageInsertPresentation,
  normalizeRemoteMarkdownImageUrl
} from './image-insert-helpers';
import type { MarkdownInsertPlacement } from '../markdown/markdown-tools';

type Props = {
  open: boolean;
  editDraft?: ImageBlockDraft | null;
  collection: AdminContentBodyImageUploadCollectionKey;
  uploadEndpoint: string;
  entryId: string;
  disabled?: boolean;
  onClose: () => void;
  onInsert: (text: string, placement?: MarkdownInsertPlacement, result?: EditorImageUploadResult) => void;
};

type ImageInsertMode = 'upload' | 'url';

const IMAGE_DISPLAY_SIZE_OPTIONS: Array<{ value: ImageDisplaySize; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
  { value: 'full', label: '全宽' }
];

const IMAGE_ALIGNMENT_OPTIONS: Array<{ value: ImageDisplayAlignment; label: string }> = [
  { value: 'center', label: '居中' },
  { value: 'left', label: '左对齐' },
  { value: 'right', label: '右对齐' }
];

let {
  open,
  editDraft = null,
  collection,
  uploadEndpoint,
  entryId,
  disabled = false,
  onClose,
  onInsert
}: Props = $props();

let fileInputEl = $state<HTMLInputElement | null>(null);
let dialogPanelEl = $state<HTMLElement | null>(null);
let closeButtonEl = $state<HTMLButtonElement | null>(null);
let chooseButtonEl = $state<HTMLButtonElement | null>(null);
let urlInputEl = $state<HTMLInputElement | null>(null);
let insertMode = $state<ImageInsertMode>('upload');
let selectedFile = $state<File | null>(null);
let previewUrl = $state('');
let altText = $state('');
let remoteUrl = $state('');
let presentation = $state<ImageInsertPresentation>('plain');
let captionText = $state('');
let displaySize = $state<ImageDisplaySize>('default');
let displayAlignment = $state<ImageDisplayAlignment>('center');
let busy = $state(false);
let errorText = $state('');
let appliedEditDraftKey = $state('');

const submitButtonText = $derived(
  busy
    ? insertMode === 'upload'
      ? '上传中…'
      : '插入中…'
    : insertMode === 'url'
      ? editDraft
        ? '保存链接'
        : '插入链接'
      : editDraft
        ? selectedFile
          ? '上传并替换'
          : '保存修改'
        : '上传并插入'
);

const dialogTitle = $derived(editDraft ? '编辑图片' : '插入图片');

const formatBytes = (value: number): string => {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

const resetDialog = () => {
  insertMode = 'upload';
  selectedFile = null;
  altText = '';
  remoteUrl = '';
  presentation = 'plain';
  captionText = '';
  displaySize = 'default';
  displayAlignment = 'center';
  errorText = '';
  busy = false;
  appliedEditDraftKey = '';
  if (fileInputEl) fileInputEl.value = '';
};

const getEditDraftKey = (draft: ImageBlockDraft | null): string =>
  draft
    ? [
      draft.src,
      draft.alt,
      draft.presentation,
      draft.caption,
      draft.size,
      draft.alignment
    ].join('\u0000')
    : '';

const applyEditDraft = (draft: ImageBlockDraft) => {
  insertMode = draft.src.startsWith('https://') ? 'url' : 'upload';
  selectedFile = null;
  altText = draft.alt;
  remoteUrl = draft.src.startsWith('https://') ? draft.src : '';
  presentation = draft.presentation;
  captionText = draft.caption;
  displaySize = draft.size;
  displayAlignment = draft.alignment;
  errorText = '';
  busy = false;
  if (fileInputEl) fileInputEl.value = '';
};

const finishDialog = (options: { restoreFocus?: boolean } = {}) => {
  resetDialog();
  onClose();
  if (options.restoreFocus !== false) {
    imageDialogFocus.restoreFocus();
  }
};

const closeDialog = () => {
  if (busy) return;
  finishDialog();
};

const requestFileSelection = () => {
  if (disabled || busy) return;
  fileInputEl?.click();
};

const setInsertMode = (mode: ImageInsertMode) => {
  if (disabled || busy || insertMode === mode) return;
  insertMode = mode;
  errorText = '';

  if (mode === 'url') {
    queueMicrotask(() => {
      urlInputEl?.focus();
    });
  }
};

const handleFileChange = () => {
  const [file] = Array.from(fileInputEl?.files ?? []);
  selectedFile = file ?? null;
  errorText = '';
};

const insertImageText = (src: string, result?: EditorImageUploadResult) => {
  const imageInsert = createImageInsertText({
    src,
    alt: altText,
    presentation,
    caption: captionText,
    size: displaySize,
    alignment: displayAlignment
  });

  onInsert(imageInsert.text, imageInsert.placement, result);
  finishDialog({ restoreFocus: false });
};

const uploadAndInsert = async () => {
  if (disabled || busy) return;
  if (!selectedFile) {
    if (editDraft) {
      insertImageText(editDraft.src);
      return;
    }
    errorText = '请选择图片';
    return;
  }

  busy = true;
  errorText = '';

  const upload = await uploadContentEditorImage({ uploadEndpoint, collection, entryId, file: selectedFile });
  if (upload.ok) {
    insertImageText(upload.result.src, upload.result);
  } else {
    errorText = upload.error;
  }
  busy = false;
};

const insertRemoteUrl = () => {
  if (disabled || busy) return;

  const normalizedUrl = normalizeRemoteMarkdownImageUrl(remoteUrl);
  if (!normalizedUrl) {
    errorText = REMOTE_IMAGE_URL_ERROR;
    return;
  }

  insertImageText(normalizedUrl);
};

const submitInsert = () => {
  if (insertMode === 'url') {
    insertRemoteUrl();
    return;
  }

  void uploadAndInsert();
};

const imageDialogFocus = createModalDialogFocusController({
  getDialog: () => dialogPanelEl,
  getInitialFocus: () => (insertMode === 'url' ? urlInputEl : chooseButtonEl) ?? closeButtonEl,
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

  imageDialogFocus.captureReturnFocus();
  imageDialogFocus.focusInitial();
  document.addEventListener('keydown', imageDialogFocus.handleKeydown);
  return () => {
    document.removeEventListener('keydown', imageDialogFocus.handleKeydown);
  };
});

$effect(() => {
  const url = selectedFile ? URL.createObjectURL(selectedFile) : '';
  previewUrl = url;

  return () => {
    if (url) URL.revokeObjectURL(url);
  };
});
</script>

{#if open}
  <div class="admin-modal admin-editor-image-insert" role="presentation">
    <button
      class="admin-modal__backdrop admin-editor-image-insert__backdrop"
      type="button"
      aria-label="关闭插入图片"
      onclick={closeDialog}
    ></button>
    <div
      bind:this={dialogPanelEl}
      class="admin-modal__panel admin-editor-image-insert__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-editor-image-insert-title"
      tabindex="-1"
    >
      <form
        class="admin-editor-image-insert__form"
        onsubmit={(event) => {
          event.preventDefault();
          submitInsert();
        }}
      >
        <header class="admin-modal__head admin-editor-image-insert__head">
          <div class="admin-editor-image-insert__title-wrap">
            <span class="admin-editor-image-insert__icon" aria-hidden="true">
              <AdminEditorIcon name="image-plus" size={16} strokeWidth={2} />
            </span>
            <h3 id="admin-editor-image-insert-title" class="admin-modal__title admin-content-section-title">{dialogTitle}</h3>
          </div>
          <button
            bind:this={closeButtonEl}
            class="admin-btn admin-btn--ghost admin-btn--compact admin-btn--icon admin-editor-image-insert__close"
            type="button"
            aria-label="关闭插入图片"
            disabled={busy}
            onclick={closeDialog}
          >
            <AdminEditorIcon name="close" size={16} strokeWidth={2} />
          </button>
        </header>

        <div class="admin-modal__body admin-editor-image-insert__body">
          <div class="admin-editor-image-insert__mode-switch" role="group" aria-label="图片插入方式">
            <button
              class="admin-editor-image-insert__mode-button"
              class:is-active={insertMode === 'upload'}
              type="button"
              aria-pressed={insertMode === 'upload'}
              disabled={disabled || busy}
              onclick={() => setInsertMode('upload')}
            >
              上传文件
            </button>
            <button
              class="admin-editor-image-insert__mode-button"
              class:is-active={insertMode === 'url'}
              type="button"
              aria-pressed={insertMode === 'url'}
              disabled={disabled || busy}
              onclick={() => setInsertMode('url')}
            >
              图床链接
            </button>
          </div>

          <input
            bind:this={fileInputEl}
            class="admin-sr-only"
            type="file"
            accept="image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp"
            tabindex="-1"
            onchange={handleFileChange}
          />

          {#if insertMode === 'upload'}
            {#if editDraft && !selectedFile}
              <div class="admin-editor-image-insert__current-card">
                <span class="admin-editor-image-insert__source-icon" aria-hidden="true">
                  <AdminEditorIcon name="image" size={18} strokeWidth={2} />
                </span>
                <span class="admin-editor-image-insert__source-copy">
                  <strong>当前图片</strong>
                  <span>{editDraft.src}</span>
                </span>
                <button
                  class="admin-btn admin-btn--ghost admin-btn--compact admin-editor-image-insert__replace-button"
                  type="button"
                  disabled={disabled || busy}
                  onclick={requestFileSelection}
                >
                  替换
                </button>
              </div>
            {:else}
              <button
                bind:this={chooseButtonEl}
                class="admin-editor-image-insert__dropzone"
                type="button"
                disabled={disabled || busy}
                onclick={requestFileSelection}
              >
                <span class="admin-editor-image-insert__source-icon" aria-hidden="true">
                  <AdminEditorIcon name="upload" size={18} strokeWidth={2} />
                </span>
                <span class="admin-editor-image-insert__source-copy">
                  <strong>{selectedFile ? selectedFile.name : '选择本地图片'}</strong>
                  <span>{selectedFile ? formatBytes(selectedFile.size) : '上传后保存到当前内容附件目录，并插入 Markdown'}</span>
                </span>
              </button>
            {/if}

            {#if previewUrl}
              <div class="admin-editor-image-insert__preview">
                <img src={previewUrl} alt="" />
              </div>
            {/if}
          {:else}
            <label class="admin-field admin-editor-image-insert__field">
              <span class="admin-field__label">图床链接</span>
              <input
                bind:this={urlInputEl}
                class="admin-field__control"
                type="text"
                inputmode="url"
                autocomplete="off"
                bind:value={remoteUrl}
                disabled={disabled || busy}
                placeholder="https://example.com/image.webp"
                oninput={() => {
                  errorText = '';
                }}
              />
            </label>
          {/if}

          <label class="admin-field admin-editor-image-insert__field">
            <span class="admin-field__label">图片描述</span>
            <input
              class="admin-field__control"
              type="text"
              bind:value={altText}
              disabled={disabled || busy}
              placeholder="写入 alt，可留空"
            />
          </label>

          <div class="admin-editor-image-insert__section">
            <span class="admin-field__label">图片排版</span>
            <div class="admin-editor-image-insert__option-group" role="group" aria-label="图片排版">
              <button
                class="admin-editor-image-insert__option-button"
                class:is-active={presentation === 'plain'}
                type="button"
                aria-pressed={presentation === 'plain'}
                disabled={disabled || busy}
                onclick={() => {
                  presentation = 'plain';
                  errorText = '';
                }}
              >
                普通图片
              </button>
              <button
                class="admin-editor-image-insert__option-button"
                class:is-active={presentation === 'figure'}
                type="button"
                aria-pressed={presentation === 'figure'}
                disabled={disabled || busy}
                onclick={() => {
                  presentation = 'figure';
                  errorText = '';
                }}
              >
                图注图片
              </button>
            </div>
          </div>

          {#if presentation === 'figure'}
            <label class="admin-field admin-editor-image-insert__field">
              <span class="admin-field__label">图注</span>
              <input
                class="admin-field__control"
                type="text"
                bind:value={captionText}
                disabled={disabled || busy}
                placeholder="显示在图片下方，可留空"
              />
            </label>
          {/if}

          <div class="admin-editor-image-insert__display-grid">
            <label class="admin-field admin-editor-image-insert__field">
              <span class="admin-field__label">尺寸</span>
              <select class="admin-field__control" bind:value={displaySize} disabled={disabled || busy}>
                {#each IMAGE_DISPLAY_SIZE_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>

            <div class="admin-editor-image-insert__section">
              <span class="admin-field__label">对齐</span>
              <div class="admin-editor-image-insert__option-group" role="group" aria-label="图片对齐方式">
                {#each IMAGE_ALIGNMENT_OPTIONS as option}
                  <button
                    class="admin-editor-image-insert__option-button"
                    class:is-active={displayAlignment === option.value}
                    type="button"
                    aria-pressed={displayAlignment === option.value}
                    disabled={disabled || busy}
                    onclick={() => {
                      displayAlignment = option.value;
                    }}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          {#if errorText}
            <p class="admin-editor-image-insert__error" role="alert">{errorText}</p>
          {/if}
        </div>

        <footer class="admin-modal__actions admin-editor-image-insert__actions">
          <button class="admin-btn admin-btn--ghost admin-btn--compact" type="button" disabled={busy} onclick={closeDialog}>取消</button>
          <button class="admin-btn admin-btn--primary admin-btn--compact" type="submit" disabled={disabled || busy}>
            {submitButtonText}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}
