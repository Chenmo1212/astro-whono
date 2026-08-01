<script lang="ts">
import type {
  AdminContentIssue,
  AdminContentWriteResult
} from '../../../../scripts/admin-content/entry-transport';
import AdminEditorIcon from './AdminEditorIcon.svelte';

type Props = {
  bodyLineCount: number;
  bodyCharCount: number;
  errors?: readonly string[];
  issues?: readonly AdminContentIssue[];
  previewError?: string;
  previewWarnings?: readonly string[];
  writeResult?: AdminContentWriteResult | null;
  syncScrollEnabled?: boolean;
  scrollSyncToggleLabel: string;
  scrollSyncControlDisabled?: boolean;
  scrollTopControlDisabled?: boolean;
  getWriteFieldLabel: (field: string) => string;
  onToggleScrollSync: () => void;
  onScrollToTop: () => void;
};

let {
  bodyLineCount,
  bodyCharCount,
  errors = [],
  issues = [],
  previewError = '',
  previewWarnings = [],
  writeResult = null,
  syncScrollEnabled = false,
  scrollSyncToggleLabel,
  scrollSyncControlDisabled = false,
  scrollTopControlDisabled = false,
  getWriteFieldLabel,
  onToggleScrollSync,
  onScrollToTop
}: Props = $props();
</script>

<div class="admin-editor-shell__preview-bar" aria-label="正文统计与预览状态">
  <div class="admin-editor-shell__preview-bar-counts">
    <div class="admin-editor-shell__preview-stats" aria-label="正文统计">
      <span class="admin-editor-shell__preview-stat">行数: {bodyLineCount}</span>
      <span class="admin-editor-shell__preview-separator" aria-hidden="true">|</span>
      <span class="admin-editor-shell__preview-stat">字数: {bodyCharCount}</span>
    </div>

    {#if errors.length > 0}
      <details class="admin-editor-shell__preview-detail admin-editor-shell__preview-detail--error">
        <summary class="admin-editor-shell__preview-detail-trigger">
          <AdminEditorIcon name="triangle-alert" size={13} strokeWidth={2} class="admin-icon" />
          <span>保存失败 {errors.length}</span>
        </summary>
        <div class="admin-editor-shell__preview-detail-panel" role="group" aria-label="保存错误详情">
          <p class="admin-editor-shell__preview-detail-label">保存失败</p>
          <ul class="admin-editor-shell__preview-detail-list">
            {#each errors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </div>
      </details>
    {/if}

    {#if issues.length > 0}
      <details class="admin-editor-shell__preview-detail admin-editor-shell__preview-detail--warning">
        <summary class="admin-editor-shell__preview-detail-trigger">
          <AdminEditorIcon name="triangle-alert" size={13} strokeWidth={2} class="admin-icon" />
          <span>字段 {issues.length}</span>
        </summary>
        <div class="admin-editor-shell__preview-detail-panel" role="group" aria-label="字段问题详情">
          <p class="admin-editor-shell__preview-detail-label">字段问题</p>
          <ul class="admin-editor-shell__preview-detail-list">
            {#each issues as issue}
              <li>
                <span class="admin-editor-shell__preview-detail-path">{issue.path}</span>
                {issue.message}
              </li>
            {/each}
          </ul>
        </div>
      </details>
    {/if}

    {#if previewError}
      <details class="admin-editor-shell__preview-detail admin-editor-shell__preview-detail--error">
        <summary class="admin-editor-shell__preview-detail-trigger">
          <AdminEditorIcon name="triangle-alert" size={13} strokeWidth={2} class="admin-icon" />
          <span>预览失败</span>
        </summary>
        <div class="admin-editor-shell__preview-detail-panel" role="group" aria-label="预览错误详情">
          <p class="admin-editor-shell__preview-detail-label">预览失败</p>
          <p class="admin-editor-shell__preview-detail-copy">{previewError}</p>
        </div>
      </details>
    {/if}

    {#if previewWarnings.length > 0}
      <details class="admin-editor-shell__preview-detail admin-editor-shell__preview-detail--warning">
        <summary class="admin-editor-shell__preview-detail-trigger">
          <AdminEditorIcon name="triangle-alert" size={13} strokeWidth={2} class="admin-icon" />
          <span>预览 {previewWarnings.length}</span>
        </summary>
        <div class="admin-editor-shell__preview-detail-panel" role="group" aria-label="预览警告详情">
          <p class="admin-editor-shell__preview-detail-label">预览警告</p>
          <ul class="admin-editor-shell__preview-detail-list">
            {#each previewWarnings as warning}
              <li>{warning}</li>
            {/each}
          </ul>
        </div>
      </details>
    {/if}

    {#if writeResult}
      {@const result = writeResult}
      <details class="admin-editor-shell__preview-detail admin-editor-shell__preview-detail--ok">
        <summary class="admin-editor-shell__preview-detail-trigger">
          <AdminEditorIcon name="check" size={13} strokeWidth={2} class="admin-icon" />
          <span>{result.changed ? `写入 ${result.changedFields.length}` : '无改动'}</span>
        </summary>
        <div class="admin-editor-shell__preview-detail-panel" role="group" aria-label="写入结果详情">
          <p class="admin-editor-shell__preview-detail-label">写入结果</p>
          <p class="admin-editor-shell__preview-detail-copy">
            {result.changed
              ? `${result.relativePath || '当前条目'} 已更新，本次更新 ${result.changedFields.length} 个字段。`
              : '当前内容无改动。'}
          </p>
          {#if result.changedFields.length > 0}
            <ul class="admin-editor-shell__preview-detail-list">
              {#each result.changedFields as field}
                <li>{getWriteFieldLabel(field)}</li>
              {/each}
            </ul>
          {/if}
        </div>
      </details>
    {/if}
  </div>
  <div class="admin-editor-shell__preview-bar-actions" aria-label="预览滚动控制">
    <button
      class="admin-btn admin-btn--ghost admin-btn--compact admin-editor-shell__preview-action"
      type="button"
      data-active={syncScrollEnabled ? 'true' : 'false'}
      aria-label={scrollSyncToggleLabel}
      aria-pressed={syncScrollEnabled ? 'true' : 'false'}
      disabled={scrollSyncControlDisabled}
      onclick={onToggleScrollSync}
    >
      <AdminEditorIcon name={syncScrollEnabled ? 'lock' : 'lock-open'} size={14} strokeWidth={2} />
      <span>同步滚动</span>
    </button>
    <span class="admin-editor-shell__preview-separator" aria-hidden="true">|</span>
    <button
      class="admin-btn admin-btn--ghost admin-btn--compact admin-editor-shell__preview-action"
      type="button"
      aria-label="回到顶部"
      disabled={scrollTopControlDisabled}
      onclick={onScrollToTop}
    >
      <AdminEditorIcon name="arrow-up-to-line" size={14} strokeWidth={2} />
      <span>回到顶部</span>
    </button>
  </div>
</div>
