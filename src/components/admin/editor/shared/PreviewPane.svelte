<script lang="ts">
type Props = {
  html?: string;
  loading?: boolean;
  error?: string;
  articleClass?: string;
  onScrollElementChange?: (element: HTMLElement | null) => void;
  onArticleElementChange?: (element: HTMLElement | null) => void;
};

let {
  html = '',
  loading = false,
  error = '',
  articleClass = '',
  onScrollElementChange,
  onArticleElementChange
}: Props = $props();

let previewScrollElement = $state<HTMLElement | null>(null);
let previewArticleElement = $state<HTMLElement | null>(null);
const previewArticleClass = $derived(
  ['admin-editor-preview__article', 'prose', articleClass].filter(Boolean).join(' ')
);

$effect(() => {
  onScrollElementChange?.(previewScrollElement);

  return () => {
    onScrollElementChange?.(null);
  };
});

$effect(() => {
  onArticleElementChange?.(previewArticleElement);

  return () => {
    onArticleElementChange?.(null);
  };
});
</script>

<section class="admin-editor-preview" aria-label="Markdown preview">
  <div
    bind:this={previewScrollElement}
    class="admin-editor-preview__scroller"
    data-refreshing={loading && html ? 'true' : undefined}
  >
    {#if html}
      <article bind:this={previewArticleElement} class={previewArticleClass}>
        {@html html}
      </article>
    {:else if loading}
      <div class="admin-editor-preview__empty" role="status" aria-live="polite">
        正在生成预览…
      </div>
    {:else if error}
      <div class="admin-editor-preview__error" role="alert">{error}</div>
    {:else}
      <div class="admin-editor-preview__empty">预览将在正文载入后自动生成。</div>
    {/if}
  </div>

  {#if error && html}
    <div class="admin-editor-preview__error admin-editor-preview__error--inline" role="alert">{error}</div>
  {/if}
</section>
