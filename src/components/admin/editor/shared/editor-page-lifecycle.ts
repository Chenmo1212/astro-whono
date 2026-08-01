import {
  bindEditorPageIntegration,
  mountEditorPageActionsPortal,
  observeElementInlineSize
} from './editor-page-integration';

type Cleanup = () => void;

type EditorPageLifecycleOptions = {
  shellElement: HTMLElement | null;
  actionsElement: HTMLElement | null;
  pageActionsHostSelector: string;
  onInlineSize: (inlineSize: number) => void;
  detailsMenuSelectors: readonly string[];
  navigationGuard: {
    isDirty: () => boolean;
    message: string;
    onBlocked: () => void;
  };
  articleInfoTrigger?: {
    selector: string;
    onToggle: (trigger: HTMLButtonElement) => void;
  } | null;
  documentRoot?: Document;
  windowRef?: Window;
};

export const createEditorPageLifecycle = ({
  shellElement,
  actionsElement,
  pageActionsHostSelector,
  onInlineSize,
  detailsMenuSelectors,
  navigationGuard,
  articleInfoTrigger = null,
  documentRoot,
  windowRef
}: EditorPageLifecycleOptions): Cleanup => {
  const rootOption = documentRoot ? { documentRoot } : {};
  const cleanups = [
    observeElementInlineSize({
      element: shellElement,
      onInlineSize
    }),
    mountEditorPageActionsPortal({
      actionsEl: actionsElement,
      hostSelector: pageActionsHostSelector,
      ...rootOption
    }),
    bindEditorPageIntegration({
      detailsMenuSelectors,
      navigationGuard,
      articleInfoTrigger,
      ...rootOption,
      ...(windowRef ? { windowRef } : {})
    })
  ];

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
};
