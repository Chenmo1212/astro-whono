type PreviewTimerHandle = ReturnType<typeof globalThis.setTimeout>;

type PreviewRequestScheduler = {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

type EditorPreviewRequestGuardOptions = {
  scheduler?: PreviewRequestScheduler;
  createAbortController?: () => AbortController;
};

export type EditorPreviewRequestContext = {
  requestId: number;
  source: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  isCurrentForSource: (currentSource: string) => boolean;
};

export type EditorPreviewRequestGuard = {
  beginRequest: (source: string) => EditorPreviewRequestContext;
  finishRequest: (request: EditorPreviewRequestContext) => void;
  abortActiveRequest: (options?: { invalidate?: boolean }) => void;
  clearScheduledRequest: () => void;
  scheduleRequest: (
    source: string,
    delayMs: number,
    callback: (source: string) => void
  ) => () => void;
  consumeInitialRequest: () => boolean;
  getLatestSource: () => string;
  setLatestSource: (source: string) => void;
  destroy: () => void;
};

const getDefaultScheduler = (): PreviewRequestScheduler => ({
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis)
});

export const createEditorPreviewRequestGuard = ({
  scheduler = getDefaultScheduler(),
  createAbortController = () => new AbortController()
}: EditorPreviewRequestGuardOptions = {}): EditorPreviewRequestGuard => {
  let requestId = 0;
  let scheduledTimer: PreviewTimerHandle | null = null;
  let activeAbortController: AbortController | null = null;
  let latestSource = '';
  let initialized = false;

  const isCurrentRequest = (targetRequestId: number, signal: AbortSignal) =>
    targetRequestId === requestId
    && activeAbortController?.signal === signal
    && !signal.aborted;

  const clearScheduledRequest = () => {
    if (scheduledTimer === null) return;
    scheduler.clearTimeout(scheduledTimer);
    scheduledTimer = null;
  };

  const abortActiveRequest = ({ invalidate = false }: { invalidate?: boolean } = {}) => {
    clearScheduledRequest();
    if (invalidate) requestId += 1;
    activeAbortController?.abort();
    activeAbortController = null;
  };

  const beginRequest = (source: string): EditorPreviewRequestContext => {
    clearScheduledRequest();

    requestId += 1;
    const currentRequestId = requestId;
    latestSource = source;

    activeAbortController?.abort();
    activeAbortController = createAbortController();
    const signal = activeAbortController.signal;

    return {
      requestId: currentRequestId,
      source,
      signal,
      isCurrent: () => isCurrentRequest(currentRequestId, signal),
      isCurrentForSource: (currentSource: string) =>
        isCurrentRequest(currentRequestId, signal) && source === currentSource
    };
  };

  const finishRequest = (request: EditorPreviewRequestContext) => {
    if (!isCurrentRequest(request.requestId, request.signal)) return;
    activeAbortController = null;
  };

  const scheduleRequest = (
    source: string,
    delayMs: number,
    callback: (source: string) => void
  ) => {
    clearScheduledRequest();
    scheduledTimer = scheduler.setTimeout(() => {
      scheduledTimer = null;
      callback(source);
    }, delayMs);
    return clearScheduledRequest;
  };

  const consumeInitialRequest = () => {
    if (initialized) return false;
    initialized = true;
    return true;
  };

  const destroy = () => {
    initialized = false;
    abortActiveRequest({ invalidate: true });
  };

  return {
    beginRequest,
    finishRequest,
    abortActiveRequest,
    clearScheduledRequest,
    scheduleRequest,
    consumeInitialRequest,
    getLatestSource: () => latestSource,
    setLatestSource: (source: string) => {
      latestSource = source;
    },
    destroy
  };
};
