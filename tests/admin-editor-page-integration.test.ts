import { afterEach, describe, expect, it, vi } from 'vitest';

const detailsMenuCleanups = new Map<string, () => void>();
const initAdminDetailsMenus = vi.fn(({ selector }: { selector: string }) => {
  const cleanup = vi.fn();
  detailsMenuCleanups.set(selector, cleanup);
  return cleanup;
});

vi.mock('../src/scripts/admin-content/details-menu', () => ({
  initAdminDetailsMenus
}));

vi.mock('../src/scripts/admin-console/navigation-guard', () => ({
  shouldGuardAdminNavigation: vi.fn(() => true)
}));

describe('admin editor page integration', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    detailsMenuCleanups.clear();
  });

  type ListenerKey = `${string}:${'capture' | 'bubble'}`;
  type DocumentRootStub = Document & {
    listeners: Map<ListenerKey, EventListener>;
  };
  type WindowRefStub = Window & {
    listeners: Map<string, EventListener>;
  };

  const getListenerKey = (type: string, capture?: boolean | AddEventListenerOptions): ListenerKey =>
    `${type}:${capture === true ? 'capture' : 'bubble'}`;

  const createDocumentRoot = () => ({
    listeners: new Map<ListenerKey, EventListener>(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => []),
    createComment: vi.fn(),
    addEventListener: vi.fn(function (
      this: DocumentRootStub,
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions
    ) {
      this.listeners.set(getListenerKey(type, options), listener);
    }),
    removeEventListener: vi.fn(function (
      this: DocumentRootStub,
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions
    ) {
      const key = getListenerKey(type, options);
      if (this.listeners.get(key) === listener) this.listeners.delete(key);
    })
  }) as unknown as DocumentRootStub;

  const createWindowRef = () => ({
    listeners: new Map<string, EventListener>(),
    location: {
      href: 'http://localhost/admin/content/essay/_edit/demo/'
    },
    addEventListener: vi.fn(function (
      this: WindowRefStub,
      type: string,
      listener: EventListener
    ) {
      this.listeners.set(type, listener);
    }),
    removeEventListener: vi.fn(function (
      this: WindowRefStub,
      type: string,
      listener: EventListener
    ) {
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    }),
    confirm: vi.fn(() => false)
  }) as unknown as WindowRefStub;

  const installElementStubs = () => {
    class TestElement {
      closest(_selector: string): unknown {
        return null;
      }
    }
    class TestAnchorElement extends TestElement {
      href = 'http://localhost/admin/content/';
      target = '';

      hasAttribute(_name: string): boolean {
        return false;
      }
    }
    class TestButtonElement extends TestElement {}

    vi.stubGlobal('Element', TestElement);
    vi.stubGlobal('HTMLAnchorElement', TestAnchorElement);
    vi.stubGlobal('HTMLButtonElement', TestButtonElement);

    return { TestElement, TestAnchorElement, TestButtonElement };
  };

  it('composes inline size observer, page actions portal, and page integration cleanup', async () => {
    const { createEditorPageLifecycle } = await import(
      '../src/components/admin/editor/shared/editor-page-lifecycle'
    );
    const documentRoot = createDocumentRoot();
    const windowRef = createWindowRef();
    const disconnect = vi.fn();
    const observe = vi.fn();
    const replaceWith = vi.fn();
    const onInlineSize = vi.fn();
    const originalParent = {
      insertBefore: vi.fn()
    };
    const host = {
      append: vi.fn()
    };
    const placeholder = {
      parentNode: {},
      replaceWith
    };
    const actionsElement = {
      parentNode: originalParent,
      nextSibling: null
    } as unknown as HTMLElement;
    const shellElement = {
      getBoundingClientRect: () => ({ width: 880 })
    } as HTMLElement;

    class ResizeObserverStub {
      constructor(private callback: ResizeObserverCallback) {}

      observe(element: Element) {
        observe(element);
        this.callback([
          {
            contentRect: { width: 900 }
          } as ResizeObserverEntry
        ], this as unknown as ResizeObserver);
      }

      disconnect = disconnect;
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    documentRoot.querySelector = vi.fn(() => host);
    documentRoot.createComment = vi.fn(() => placeholder as unknown as Comment);

    const cleanup = createEditorPageLifecycle({
      shellElement,
      actionsElement,
      pageActionsHostSelector: '[data-actions-host]',
      onInlineSize,
      detailsMenuSelectors: ['.preview-menu'],
      navigationGuard: {
        isDirty: () => false,
        message: 'confirm leave',
        onBlocked: vi.fn()
      },
      documentRoot,
      windowRef
    });

    expect(cleanup).toEqual(expect.any(Function));
    expect(onInlineSize).toHaveBeenNthCalledWith(1, 880);
    expect(onInlineSize).toHaveBeenNthCalledWith(2, 900);
    expect(observe).toHaveBeenCalledWith(shellElement);
    expect(originalParent.insertBefore).toHaveBeenCalledWith(placeholder, actionsElement);
    expect(host.append).toHaveBeenCalledWith(actionsElement);
    expect(initAdminDetailsMenus).toHaveBeenCalledWith({
      selector: '.preview-menu',
      documentRoot
    });

    cleanup();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(replaceWith).toHaveBeenCalledWith(actionsElement);
    expect(detailsMenuCleanups.get('.preview-menu')).toHaveBeenCalledTimes(1);
  });

  it('binds editor details, navigation guard, and article info trigger with one cleanup', async () => {
    const { bindEditorPageIntegration } = await import(
      '../src/components/admin/editor/shared/editor-page-integration'
    );
    const documentRoot = createDocumentRoot();
    const windowRef = createWindowRef();

    const cleanup = bindEditorPageIntegration({
      detailsMenuSelectors: ['.preview-menu', '.action-menu'],
      navigationGuard: {
        isDirty: () => true,
        message: 'confirm leave',
        onBlocked: vi.fn()
      },
      articleInfoTrigger: {
        selector: '[data-info-trigger]',
        onToggle: vi.fn()
      },
      documentRoot,
      windowRef
    });

    expect(initAdminDetailsMenus).toHaveBeenCalledTimes(2);
    expect(initAdminDetailsMenus).toHaveBeenNthCalledWith(1, {
      selector: '.preview-menu',
      documentRoot
    });
    expect(initAdminDetailsMenus).toHaveBeenNthCalledWith(2, {
      selector: '.action-menu',
      documentRoot
    });
    expect(documentRoot.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(documentRoot.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(windowRef.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    cleanup();

    expect(detailsMenuCleanups.get('.preview-menu')).toHaveBeenCalledTimes(1);
    expect(detailsMenuCleanups.get('.action-menu')).toHaveBeenCalledTimes(1);
    expect(documentRoot.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(documentRoot.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('supports workspaces without article info triggers', async () => {
    const { bindEditorPageIntegration } = await import(
      '../src/components/admin/editor/shared/editor-page-integration'
    );
    const documentRoot = createDocumentRoot();
    const windowRef = createWindowRef();

    const cleanup = bindEditorPageIntegration({
      detailsMenuSelectors: ['.preview-menu'],
      navigationGuard: {
        isDirty: () => false,
        message: 'confirm leave',
        onBlocked: vi.fn()
      },
      documentRoot,
      windowRef
    });

    expect(initAdminDetailsMenus).toHaveBeenCalledTimes(1);
    expect(documentRoot.addEventListener).toHaveBeenCalledTimes(1);
    expect(documentRoot.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);

    cleanup();

    expect(detailsMenuCleanups.get('.preview-menu')).toHaveBeenCalledTimes(1);
    expect(documentRoot.removeEventListener).toHaveBeenCalledTimes(1);
    expect(documentRoot.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('guards dirty navigation and beforeunload through the composed helper', async () => {
    const { bindEditorPageIntegration } = await import(
      '../src/components/admin/editor/shared/editor-page-integration'
    );
    const { TestElement, TestAnchorElement } = installElementStubs();
    const documentRoot = createDocumentRoot();
    const windowRef = createWindowRef();
    const onBlocked = vi.fn();
    const anchor = new TestAnchorElement();
    const target = new TestElement();
    target.closest = vi.fn((selector: string) => selector === 'a[href]' ? anchor : null);
    const clickEvent = {
      target,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as MouseEvent;

    const cleanup = bindEditorPageIntegration({
      detailsMenuSelectors: [],
      navigationGuard: {
        isDirty: () => true,
        message: 'confirm leave',
        onBlocked
      },
      documentRoot,
      windowRef
    });

    documentRoot.listeners.get('click:capture')?.(clickEvent);

    expect(windowRef.confirm).toHaveBeenCalledWith('confirm leave');
    expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledTimes(1);

    const beforeUnloadEvent = {
      preventDefault: vi.fn()
    } as unknown as BeforeUnloadEvent;
    windowRef.listeners.get('beforeunload')?.(beforeUnloadEvent);

    expect(beforeUnloadEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(Reflect.get(beforeUnloadEvent, 'returnValue')).toBe('');

    cleanup();

    expect(documentRoot.listeners.has('click:capture')).toBe(false);
    expect(windowRef.listeners.has('beforeunload')).toBe(false);
  });

  it('toggles article info triggers and removes the handler on cleanup', async () => {
    const { bindEditorPageIntegration } = await import(
      '../src/components/admin/editor/shared/editor-page-integration'
    );
    const { TestElement, TestButtonElement } = installElementStubs();
    const documentRoot = createDocumentRoot();
    const windowRef = createWindowRef();
    const onToggle = vi.fn();
    const trigger = new TestButtonElement();
    const target = new TestElement();
    target.closest = vi.fn((selector: string) => selector === '[data-info-trigger]' ? trigger : null);
    const clickEvent = {
      target,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;

    const cleanup = bindEditorPageIntegration({
      detailsMenuSelectors: [],
      navigationGuard: {
        isDirty: () => false,
        message: 'confirm leave',
        onBlocked: vi.fn()
      },
      articleInfoTrigger: {
        selector: '[data-info-trigger]',
        onToggle
      },
      documentRoot,
      windowRef
    });

    documentRoot.listeners.get('click:bubble')?.(clickEvent);

    expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(trigger);

    cleanup();

    expect(documentRoot.listeners.has('click:bubble')).toBe(false);
  });
});
