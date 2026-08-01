import type { AdminEditorDefaults } from '../../../../lib/admin-console/ui-prefs-keys';
import {
  DEFAULT_EDITOR_DISPLAY_PREFERENCE,
  DEFAULT_EDITOR_LAYOUT_INTENT,
  EDITOR_SINGLE_VIEW_RETURN_LABEL,
  EDITOR_SPLIT_MIN_INLINE_SIZE,
  getEditorCompactPaneToggleLabel,
  getEditorCompactPaneToggleText,
  getEditorEditViewToggleLabel,
  getEditorLayoutToggleIcon,
  getEditorLayoutToggleLabel,
  getEditorPreviewViewToggleLabel,
  getEditorSidePanelLayout,
  isEditorOutlineAvailableForInlineSize,
  mergeEditorDisplayPreference,
  readRestoredEditorPreferences,
  storeEditorDisplayPreference,
  storeEditorLayout,
  storeEditorSidePanelPreference,
  type EditorDisplayPreference,
  type EditorLayoutMode,
  type EditorPaneMode,
  type EditorSidePanelLayout,
  type EditorSidePanelPreference,
  type EditorViewMode
} from './editor-shell-helpers';
import type { MarkdownHighlightTheme } from '../markdown/editor-markdown-highlight';
import type { EditorOutlineTab } from '../markdown/editor-outline-helpers';

type OutlineTabNormalizer = (tab: EditorOutlineTab) => EditorOutlineTab;

type EditorShellControllerOptions = {
  layoutStorageKey: string;
  displayPreferenceStorageKey: string;
  sidePanelPreferenceStorageKey: string;
  readAdminDefaults: () => AdminEditorDefaults | null;
  initialOutlineTab?: EditorOutlineTab;
  normalizeOutlineTab?: OutlineTabNormalizer;
};

type StoreSidePanelPreferenceOptions = Partial<{
  outlineOpen: boolean;
  outlineActiveTab: EditorOutlineTab;
  syntaxOpen: boolean;
}>;

const identityOutlineTab: OutlineTabNormalizer = (tab) => tab;

export const createFixedOutlineTabNormalizer = (
  fixedTab: EditorOutlineTab
): OutlineTabNormalizer => () => fixedTab;

export const createFallbackOutlineTabNormalizer = (
  unavailableTab: EditorOutlineTab,
  fallbackTab: EditorOutlineTab
): OutlineTabNormalizer => (tab) => tab === unavailableTab ? fallbackTab : tab;

export const createEditorShellController = ({
  layoutStorageKey,
  displayPreferenceStorageKey,
  sidePanelPreferenceStorageKey,
  readAdminDefaults,
  initialOutlineTab = 'headings',
  normalizeOutlineTab = identityOutlineTab
}: EditorShellControllerOptions) => {
  let explicitLayout = $state<EditorLayoutMode | null>(null);
  let viewMode = $state<EditorViewMode>('both');
  let compactPaneMode = $state<EditorPaneMode>('edit');
  let outlineOpen = $state(false);
  let outlineActiveTab = $state<EditorOutlineTab>(normalizeOutlineTab(initialOutlineTab));
  let syntaxOpen = $state(false);
  let syntaxMaximized = $state(false);
  let inlineSize = $state(0);
  let lineNumbers = $state(false);
  let markdownHighlightTheme = $state<MarkdownHighlightTheme>(
    DEFAULT_EDITOR_DISPLAY_PREFERENCE.markdownHighlightTheme
  );
  let restored = false;

  const layout = $derived(explicitLayout ?? DEFAULT_EDITOR_LAYOUT_INTENT);
  const splitWidthIsCompact = $derived(
    inlineSize > 0 && inlineSize < EDITOR_SPLIT_MIN_INLINE_SIZE
  );
  const splitBothIsCompact = $derived(
    layout === 'split' && viewMode === 'both' && splitWidthIsCompact
  );
  const stackedCanReturnToCompact = $derived(
    layout === 'stacked' && viewMode === 'both' && splitWidthIsCompact
  );
  const effectiveViewMode: EditorViewMode = $derived(splitBothIsCompact ? compactPaneMode : viewMode);
  const sidePanelsAvailable = $derived(isEditorOutlineAvailableForInlineSize({
    inlineSize,
    layout,
    viewMode
  }));
  const sidePanelLayout: EditorSidePanelLayout = $derived(
    getEditorSidePanelLayout({
      outlineOpen,
      syntaxOpen,
      syntaxMaximized,
      available: sidePanelsAvailable
    })
  );
  const sidePanelsVisible = $derived(sidePanelLayout !== 'none');
  const outlineVisible = $derived(sidePanelLayout === 'outline' || sidePanelLayout === 'stacked');
  const syntaxVisible = $derived(
    sidePanelLayout === 'syntax' || sidePanelLayout === 'stacked' || sidePanelLayout === 'syntaxMaximized'
  );
  const syntaxMaximizeAllowed = $derived(outlineOpen && syntaxOpen);
  const singleViewActive = $derived(viewMode !== 'both');
  const layoutToggleLabel = $derived(getEditorLayoutToggleLabel({
    splitBothIsCompact,
    stackedCanReturnToCompact,
    editorLayout: layout
  }));
  const layoutToggleIcon = $derived(getEditorLayoutToggleIcon({
    stackedCanReturnToCompact,
    editorLayout: layout
  }));
  const editViewToggleLabel = $derived(getEditorEditViewToggleLabel({
    editorViewMode: viewMode,
    splitBothIsCompact
  }));
  const previewViewToggleLabel = $derived(getEditorPreviewViewToggleLabel(viewMode));
  const compactPaneToggleText = $derived(getEditorCompactPaneToggleText(compactPaneMode));
  const compactPaneToggleLabel = $derived(getEditorCompactPaneToggleLabel(compactPaneMode));
  const outlineToggleLabel = $derived(outlineOpen ? '关闭目录' : '打开目录');
  const outlineControlDisabled = $derived(!outlineOpen && !sidePanelsAvailable);
  const syntaxToggleLabel = $derived(syntaxOpen ? '关闭语法实例' : '打开语法实例');
  const syntaxControlDisabled = $derived(!syntaxOpen && !sidePanelsAvailable);
  const lineNumbersToggleLabel = $derived(lineNumbers ? '隐藏行号' : '显示行号');

  const shouldUseSessionDefaults = () => readAdminDefaults() !== null;

  const storeCurrentSidePanelPreference = (preference: StoreSidePanelPreferenceOptions = {}) => {
    if (shouldUseSessionDefaults()) return;

    storeEditorSidePanelPreference(sidePanelPreferenceStorageKey, {
      outlineOpen: preference.outlineOpen ?? outlineOpen,
      outlineActiveTab: normalizeOutlineTab(preference.outlineActiveTab ?? outlineActiveTab),
      syntaxOpen: preference.syntaxOpen ?? syntaxOpen
    });
  };

  const storeCurrentDisplayPreference = (preference: Partial<EditorDisplayPreference> = {}) => {
    const currentPreference: EditorDisplayPreference = {
      lineNumbers,
      markdownHighlightTheme
    };

    storeEditorDisplayPreference(
      displayPreferenceStorageKey,
      mergeEditorDisplayPreference(currentPreference, preference)
    );
  };

  const restorePreferences = () => {
    if (restored) return;
    restored = true;

    const restoredPreferences = readRestoredEditorPreferences({
      layoutStorageKey,
      displayPreferenceStorageKey,
      sidePanelPreferenceStorageKey,
      adminDefaults: readAdminDefaults(),
      normalizeSidePanelPreference: (preference): EditorSidePanelPreference => ({
        ...preference,
        outlineActiveTab: normalizeOutlineTab(preference.outlineActiveTab)
      })
    });

    explicitLayout = restoredPreferences.layout;
    lineNumbers = restoredPreferences.display.lineNumbers;
    markdownHighlightTheme = restoredPreferences.display.markdownHighlightTheme;

    const sidePanelPreference = restoredPreferences.sidePanel;
    if (!sidePanelPreference) return;

    outlineOpen = sidePanelPreference.outlineOpen;
    outlineActiveTab = normalizeOutlineTab(sidePanelPreference.outlineActiveTab);
    syntaxOpen = sidePanelPreference.syntaxOpen;
  };

  const toggleLayout = () => {
    if (singleViewActive) return;

    const nextLayout = layout === 'split' ? 'stacked' : 'split';
    explicitLayout = nextLayout;
    if (!shouldUseSessionDefaults()) {
      storeEditorLayout(layoutStorageKey, nextLayout);
    }
  };

  const toggleViewMode = (nextViewMode: Exclude<EditorViewMode, 'both'>) => {
    viewMode = viewMode === nextViewMode ? 'both' : nextViewMode;
  };

  const returnToBothView = () => {
    viewMode = 'both';
  };

  const toggleCompactPaneMode = () => {
    compactPaneMode = compactPaneMode === 'edit' ? 'preview' : 'edit';
  };

  const toggleOutline = () => {
    if (outlineOpen) {
      outlineOpen = false;
      storeCurrentSidePanelPreference({ outlineOpen: false });
      return;
    }

    outlineOpen = true;
    outlineActiveTab = normalizeOutlineTab(outlineActiveTab);
    storeCurrentSidePanelPreference({ outlineOpen: true, outlineActiveTab });
  };

  const toggleSyntax = () => {
    if (syntaxOpen) {
      syntaxOpen = false;
      syntaxMaximized = false;
      storeCurrentSidePanelPreference({ syntaxOpen: false });
      return;
    }

    syntaxOpen = true;
    syntaxMaximized = false;
    storeCurrentSidePanelPreference({ syntaxOpen: true });
  };

  const toggleLineNumbers = () => {
    lineNumbers = !lineNumbers;
    storeCurrentDisplayPreference({ lineNumbers });
  };

  const selectMarkdownHighlightTheme = (theme: MarkdownHighlightTheme) => {
    markdownHighlightTheme = theme;
    storeCurrentDisplayPreference({ markdownHighlightTheme: theme });
  };

  const toggleSyntaxMaximize = () => {
    if (!syntaxMaximizeAllowed) return;
    syntaxMaximized = !syntaxMaximized;
  };

  const setOutlineTab = (tab: EditorOutlineTab) => {
    outlineActiveTab = normalizeOutlineTab(tab);
    storeCurrentSidePanelPreference({ outlineActiveTab });
  };

  const setInlineSize = (nextInlineSize: number) => {
    inlineSize = nextInlineSize;
  };

  const syncSyntaxMaximized = () => {
    if (!syntaxMaximizeAllowed && syntaxMaximized) {
      syntaxMaximized = false;
    }
  };

  return {
    restorePreferences,
    setInlineSize,
    syncSyntaxMaximized,
    toggleLayout,
    toggleViewMode,
    returnToBothView,
    toggleCompactPaneMode,
    toggleOutline,
    toggleSyntax,
    toggleLineNumbers,
    selectMarkdownHighlightTheme,
    toggleSyntaxMaximize,
    setOutlineTab,
    get layout() {
      return layout;
    },
    get viewMode() {
      return viewMode;
    },
    get effectiveViewMode() {
      return effectiveViewMode;
    },
    get splitBothIsCompact() {
      return splitBothIsCompact;
    },
    get sidePanelLayout() {
      return sidePanelLayout;
    },
    get sidePanelsVisible() {
      return sidePanelsVisible;
    },
    get outlineOpen() {
      return outlineOpen;
    },
    get outlineVisible() {
      return outlineVisible;
    },
    get outlineActiveTab() {
      return outlineActiveTab;
    },
    get outlineToggleLabel() {
      return outlineToggleLabel;
    },
    get outlineControlDisabled() {
      return outlineControlDisabled;
    },
    get syntaxOpen() {
      return syntaxOpen;
    },
    get syntaxVisible() {
      return syntaxVisible;
    },
    get syntaxToggleLabel() {
      return syntaxToggleLabel;
    },
    get syntaxControlDisabled() {
      return syntaxControlDisabled;
    },
    get lineNumbers() {
      return lineNumbers;
    },
    get lineNumbersToggleLabel() {
      return lineNumbersToggleLabel;
    },
    get markdownHighlightTheme() {
      return markdownHighlightTheme;
    },
    get layoutToggleLabel() {
      return layoutToggleLabel;
    },
    get layoutToggleIcon() {
      return layoutToggleIcon;
    },
    get singleViewActive() {
      return singleViewActive;
    },
    get singleViewReturnLabel() {
      return EDITOR_SINGLE_VIEW_RETURN_LABEL;
    },
    get compactPaneToggleLabel() {
      return compactPaneToggleLabel;
    },
    get compactPaneToggleText() {
      return compactPaneToggleText;
    },
    get editViewToggleLabel() {
      return editViewToggleLabel;
    },
    get previewViewToggleLabel() {
      return previewViewToggleLabel;
    },
    get syntaxMaximizeAllowed() {
      return syntaxMaximizeAllowed;
    }
  };
};

export type EditorShellController = ReturnType<typeof createEditorShellController>;
