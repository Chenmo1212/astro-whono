export type OutlineScrollOptions = {
  targetOffsetRatio?: number;
};

const DEFAULT_TARGET_OFFSET_RATIO = 0.18;

const getTargetOffsetRatio = (options: OutlineScrollOptions = {}): number =>
  options.targetOffsetRatio ?? DEFAULT_TARGET_OFFSET_RATIO;

const getOutlineTargetScrollTop = (
  targetTop: number,
  viewportHeight: number,
  options: OutlineScrollOptions = {}
): number => Math.max(0, targetTop - viewportHeight * getTargetOffsetRatio(options));

const getRelativeTargetTop = (scroller: HTMLElement, target: HTMLElement): number => {
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return targetRect.top - scrollerRect.top + scroller.scrollTop;
};

export const findPreviewOutlineTarget = (
  previewElement: HTMLElement,
  outlineKey: string,
  outlineKeyAttribute: string
): HTMLElement | null => {
  const targets = previewElement.querySelectorAll<HTMLElement>(`[${outlineKeyAttribute}]`);
  for (const target of targets) {
    if (target.getAttribute(outlineKeyAttribute) === outlineKey) {
      return target;
    }
  }

  return null;
};

export const scrollPreviewToOutlineKey = (
  previewElement: HTMLElement | null,
  outlineKey: string,
  outlineKeyAttribute: string,
  options: OutlineScrollOptions = {}
): boolean => {
  if (!previewElement) return false;

  const target = findPreviewOutlineTarget(previewElement, outlineKey, outlineKeyAttribute);
  if (!target) return false;

  previewElement.scrollTop = getOutlineTargetScrollTop(
    getRelativeTargetTop(previewElement, target),
    previewElement.clientHeight,
    options
  );
  return true;
};
