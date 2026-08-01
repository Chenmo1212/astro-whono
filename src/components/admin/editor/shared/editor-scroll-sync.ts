import {
  clearAllScrollbarVisibilityTimers,
  clearScrollbarVisibilityTimer,
  getOppositeScrollSource,
  getScrollRatio,
  getScrollableDistance,
  markScrollElementScrolling,
  type EditorScrollSource,
  type EditorViewMode
} from './editor-shell-helpers';

type EditorScrollSyncControllerOptions = {
  getScrollElement: (source: EditorScrollSource) => HTMLElement | null;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  isAvailable: () => boolean;
  scrollbarVisibilityTimeoutMs: number;
};

export type EditorScrollSyncController = {
  cancelQueued: () => void;
  clearElement: (element: HTMLElement) => void;
  destroy: () => void;
  handlePaneScroll: (source: EditorScrollSource) => void;
  markElementScrolling: (element: HTMLElement) => void;
  queueLastSource: () => void;
  releaseGuard: (frameDelay?: number) => void;
  scrollToTop: (viewMode: EditorViewMode) => void;
  setGuarded: (guarded: boolean) => void;
  setLastSource: (source: EditorScrollSource) => void;
  toggleEnabled: () => void;
};

const getWindowRef = (): Window | null => typeof window === 'undefined' ? null : window;

export const createEditorScrollSyncController = ({
  getScrollElement,
  isEnabled,
  setEnabled,
  isAvailable,
  scrollbarVisibilityTimeoutMs
}: EditorScrollSyncControllerOptions): EditorScrollSyncController => {
  let lastSource: EditorScrollSource = 'body';
  let pendingSource: EditorScrollSource | null = null;
  let syncFrame: number | null = null;
  let releaseFrame: number | null = null;
  let applyingScrollSync = false;
  const scrollbarVisibilityTimers = new Map<HTMLElement, number>();

  const cancelQueued = () => {
    const win = getWindowRef();
    if (!win || syncFrame === null) return;

    win.cancelAnimationFrame(syncFrame);
    syncFrame = null;
    pendingSource = null;
  };

  const releaseGuard = (frameDelay = 1) => {
    const win = getWindowRef();
    if (!win) return;

    if (releaseFrame !== null) {
      win.cancelAnimationFrame(releaseFrame);
    }

    let remainingFrames = Math.max(1, frameDelay);
    const releaseOnFrame = () => {
      remainingFrames -= 1;
      if (remainingFrames > 0) {
        releaseFrame = win.requestAnimationFrame(releaseOnFrame);
        return;
      }

      applyingScrollSync = false;
      releaseFrame = null;
    };

    releaseFrame = win.requestAnimationFrame(releaseOnFrame);
  };

  const applySync = (source: EditorScrollSource) => {
    const sourceElement = getScrollElement(source);
    const targetElement = getScrollElement(getOppositeScrollSource(source));
    if (!sourceElement || !targetElement) return;

    const scrollRatio = getScrollRatio(sourceElement);
    applyingScrollSync = true;
    targetElement.scrollTop = getScrollableDistance(targetElement) * scrollRatio;
    releaseGuard();
  };

  const queue = (source: EditorScrollSource) => {
    const win = getWindowRef();
    if (!win) return;

    pendingSource = source;
    if (syncFrame !== null) return;

    syncFrame = win.requestAnimationFrame(() => {
      const queuedSource = pendingSource;
      syncFrame = null;
      pendingSource = null;

      if (!queuedSource || !isEnabled() || !isAvailable()) return;
      applySync(queuedSource);
    });
  };

  const markElementScrolling = (element: HTMLElement) => {
    markScrollElementScrolling(scrollbarVisibilityTimers, element, scrollbarVisibilityTimeoutMs);
  };

  const setLastSource = (source: EditorScrollSource) => {
    lastSource = source;
  };

  const handlePaneScroll = (source: EditorScrollSource) => {
    const sourceElement = getScrollElement(source);
    if (sourceElement) markElementScrolling(sourceElement);
    if (applyingScrollSync) return;

    setLastSource(source);
    if (!isEnabled() || !isAvailable()) return;

    queue(source);
  };

  const toggleEnabled = () => {
    if (!isAvailable()) return;

    const nextEnabled = !isEnabled();
    setEnabled(nextEnabled);
    if (nextEnabled) queue(lastSource);
  };

  const scrollToTop = (viewMode: EditorViewMode) => {
    const scrollElements = [
      viewMode === 'preview' ? null : getScrollElement('body'),
      viewMode === 'edit' ? null : getScrollElement('preview')
    ].filter(
      (element): element is HTMLElement => element !== null
    );
    if (scrollElements.length === 0) return;

    setLastSource(viewMode === 'preview' ? 'preview' : 'body');
    cancelQueued();
    applyingScrollSync = true;
    scrollElements.forEach((element) => {
      element.scrollTop = 0;
    });
    releaseGuard();
  };

  const clearElement = (element: HTMLElement) => {
    clearScrollbarVisibilityTimer(scrollbarVisibilityTimers, element);
  };

  const destroy = () => {
    const win = getWindowRef();
    if (win) {
      if (syncFrame !== null) win.cancelAnimationFrame(syncFrame);
      if (releaseFrame !== null) win.cancelAnimationFrame(releaseFrame);
    }
    syncFrame = null;
    releaseFrame = null;
    pendingSource = null;
    applyingScrollSync = false;
    clearAllScrollbarVisibilityTimers(scrollbarVisibilityTimers);
  };

  return {
    cancelQueued,
    clearElement,
    destroy,
    handlePaneScroll,
    markElementScrolling,
    queueLastSource: () => queue(lastSource),
    releaseGuard,
    scrollToTop,
    setGuarded: (guarded) => {
      applyingScrollSync = guarded;
    },
    setLastSource,
    toggleEnabled
  };
};
