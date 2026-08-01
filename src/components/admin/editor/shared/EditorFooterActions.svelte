<script lang="ts">
import type { StatusState } from './editor-shell-helpers';

type Props = {
  statusText: string;
  statusState: StatusState;
  busy: boolean;
  dirty: boolean;
  canWriteContent: boolean;
  saveLabel?: string;
  resetLabel?: string;
  onReset: () => void;
  onSave: () => void | Promise<void>;
};

let {
  statusText,
  statusState,
  busy,
  dirty,
  canWriteContent,
  saveLabel = '保存内容',
  resetLabel = '还原',
  onReset,
  onSave
}: Props = $props();
</script>

<div class="admin-content-toolbar__footer admin-editor-shell__actions">
  <div class="admin-editor-shell__footer-copy">
    {#if statusText}
      <div class="admin-editor-shell__status">
        <p class="admin-status admin-status--inline" data-state={statusState} role="status" aria-live="polite" aria-atomic="true">{statusText}</p>
      </div>
    {/if}
  </div>
  <div class="admin-content-actions">
    <button class="admin-btn admin-btn--ghost admin-btn--compact" type="button" onclick={onReset} disabled={busy || !dirty}>
      {resetLabel}
    </button>
    <button class="admin-btn admin-btn--secondary admin-btn--compact" type="button" onclick={() => void onSave()} disabled={!canWriteContent}>
      {saveLabel}
    </button>
  </div>
</div>
