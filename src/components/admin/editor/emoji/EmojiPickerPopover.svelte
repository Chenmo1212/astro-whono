<script lang="ts">
import { createAdminEditorEmojiPicker } from './emoji-picker-client';

type Props = {
  anchorElement: HTMLElement | null;
  fallbackFocusElements?: readonly (HTMLElement | null)[];
  disabled?: boolean;
  onClose: () => void;
  onInsert: (unicode: string) => void;
};

let {
  anchorElement,
  fallbackFocusElements = [],
  disabled = false,
  onClose,
  onInsert
}: Props = $props();

const POPOVER_VIEWPORT_PADDING = 12;
const POPOVER_ANCHOR_GAP = 8;
const POPOVER_MAX_WIDTH = 360;
const POPOVER_MIN_HEIGHT = 180;
const POPOVER_DEFAULT_MAX_HEIGHT = 420;

let popoverEl = $state<HTMLDivElement | null>(null);
let pickerHost = $state<HTMLDivElement | null>(null);
let pickerState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
let pickerErrorMessage = $state<string | null>(null);
let popoverPositioned = $state(false);
let popoverTop = $state(0);
let popoverLeft = $state(0);
let popoverMaxHeight = $state(POPOVER_DEFAULT_MAX_HEIGHT);

let pickerLoadStarted = false;
let pickerHandle: Awaited<ReturnType<typeof createAdminEditorEmojiPicker>> | null = null;

const isVisibleElement = (element: HTMLElement | null): element is HTMLElement =>
  Boolean(element?.isConnected && element.getClientRects().length > 0);

const restoreAnchorFocus = () => {
  const returnFocusElement = [anchorElement, ...fallbackFocusElements].find(isVisibleElement) ?? null;
  if (!returnFocusElement) return;

  window.setTimeout(() => {
    if (!isVisibleElement(returnFocusElement)) return;
    returnFocusElement.focus({ preventScroll: true });
  }, 0);
};

const closePopover = ({ restoreFocus = false }: { restoreFocus?: boolean } = {}) => {
  if (restoreFocus) restoreAnchorFocus();
  onClose();
};

const updatePopoverPosition = () => {
  if (!anchorElement) return;

  const rect = anchorElement.getBoundingClientRect();
  const panelWidth = Math.min(POPOVER_MAX_WIDTH, window.innerWidth - POPOVER_VIEWPORT_PADDING * 2);
  const top = Math.round(rect.bottom + POPOVER_ANCHOR_GAP);
  const left = Math.round(
    Math.min(
      Math.max(POPOVER_VIEWPORT_PADDING, rect.right - panelWidth),
      window.innerWidth - panelWidth - POPOVER_VIEWPORT_PADDING
    )
  );

  popoverTop = top;
  popoverLeft = left;
  popoverMaxHeight = Math.max(POPOVER_MIN_HEIGHT, window.innerHeight - top - POPOVER_VIEWPORT_PADDING);
  popoverPositioned = true;
};

const portalToBody = (node: HTMLElement) => {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
};

$effect(() => {
  updatePopoverPosition();

  const handleResize = () => updatePopoverPosition();
  const handleScroll = () => updatePopoverPosition();
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    closePopover({ restoreFocus: true });
  };
  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (!target) return;

    if (anchorElement?.contains(target)) return;
    if (popoverEl?.contains(target)) return;
    closePopover();
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleScroll, true);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('pointerdown', handlePointerDown);

  return () => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('scroll', handleScroll, true);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('pointerdown', handlePointerDown);
  };
});

$effect(() => {
  if (!pickerHost) return;
  if (pickerLoadStarted) return;

  let cancelled = false;
  pickerLoadStarted = true;
  pickerState = 'loading';
  pickerErrorMessage = null;

  (async () => {
    try {
      const handle = await createAdminEditorEmojiPicker({
        isDisabled: () => disabled,
        onEmojiClick: (unicode) => {
          onInsert(unicode);
          closePopover();
        }
      });
      if (cancelled) {
        handle.destroy();
        return;
      }

      pickerHandle = handle;
      pickerHost?.replaceChildren(handle.element);
      pickerState = 'ready';
    } catch (error) {
      if (cancelled) return;
      pickerErrorMessage = error instanceof Error ? error.message : '加载失败';
      pickerState = 'error';
    }
  })();

  return () => {
    cancelled = true;
  };
});

$effect(() => {
  return () => {
    pickerHandle?.destroy();
    pickerHandle = null;
  };
});
</script>

<div
  use:portalToBody
  class="admin-editor-emoji-picker-popover"
  bind:this={popoverEl}
  id="admin-editor-emoji-picker-menu"
  aria-label="插入表情"
  role="dialog"
  tabindex="-1"
  style={`top:${popoverTop}px;left:${popoverLeft}px;max-height:${popoverMaxHeight}px;--admin-editor-emoji-picker-max-height:${popoverMaxHeight}px;visibility:${popoverPositioned ? 'visible' : 'hidden'};`}
>
  {#if pickerState === 'loading'}
    <div class="admin-editor-emoji-picker-popover__placeholder">加载中...</div>
  {:else if pickerState === 'error'}
    <div class="admin-editor-emoji-picker-popover__placeholder">
      加载失败：{pickerErrorMessage ?? '未知错误'}
    </div>
  {/if}
  <div class="admin-editor-emoji-picker-popover__host" bind:this={pickerHost}></div>
</div>
