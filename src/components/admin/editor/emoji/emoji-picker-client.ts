import type { EmojiClickEventDetail, I18n } from 'emoji-picker-element/shared.js';

type EmojiPickerHandle = {
  element: HTMLElement;
  destroy: () => void;
};

type CreateEmojiPickerOptions = {
  isDisabled?: () => boolean;
  onEmojiClick: (unicode: string) => void;
};

const emojiPickerI18n: I18n = {
  categoriesLabel: '分类',
  emojiUnsupportedMessage: '当前浏览器不支持彩色 emoji。',
  favoritesLabel: '最近使用',
  loadingMessage: '加载中...',
  networkErrorMessage: '无法加载 emoji 数据。',
  regionLabel: '表情选择器',
  searchDescription: '有搜索结果时，可用上下方向键选择，按回车插入。',
  searchLabel: '搜索表情',
  searchResultsLabel: '搜索结果',
  skinToneDescription: '展开后可用上下方向键选择肤色，按回车确认。',
  skinToneLabel: '选择肤色，当前为 {skinTone}',
  skinTonesLabel: '肤色',
  skinTones: ['默认', '浅色', '中浅色', '中等', '中深色', '深色'],
  categories: {
    custom: '自定义',
    'smileys-emotion': '表情',
    'people-body': '人物',
    'animals-nature': '动物与自然',
    'food-drink': '食物',
    'travel-places': '旅行与地点',
    activities: '活动',
    objects: '物品',
    symbols: '符号',
    flags: '旗帜'
  }
};

const emojiPickerShadowStyle = `
  .picker {
    --admin-editor-emoji-picker-chrome-bg: color-mix(
      in srgb,
      var(--background) 92%,
      var(--category-font-color) 8%
    );
    --admin-editor-emoji-picker-control-bg: color-mix(
      in srgb,
      var(--background) 96%,
      var(--category-font-color) 4%
    );
    --admin-editor-emoji-picker-menu-bg: color-mix(
      in srgb,
      var(--background) 97%,
      var(--category-font-color) 3%
    );
    --admin-editor-emoji-picker-menu-border: color-mix(in srgb, var(--border-color) 82%, transparent);
    --admin-editor-emoji-picker-menu-shadow: color-mix(in srgb, var(--input-font-color) 28%, transparent);
    --admin-editor-emoji-picker-control-size: calc(
      (var(--input-font-size) * var(--input-line-height)) + (0.38rem * 2) + (var(--input-border-size) * 2)
    );
  }

  /*
   * emoji-picker-element does not expose variables for these chrome details.
   * Keep internal selectors limited to this adapter so library upgrades have one review point.
   */
  .pad-top {
    height: 0;
    background: var(--admin-editor-emoji-picker-chrome-bg);
  }

  .search-row {
    gap: calc(var(--emoji-padding) * 0.72);
    z-index: 4;
    padding: calc(var(--emoji-padding) * 0.82) calc(var(--emoji-padding) * 1.04);
    overflow: visible;
    background: var(--admin-editor-emoji-picker-chrome-bg);
    border-bottom: 1px solid var(--border-color);
  }

  .search-wrapper {
    position: relative;
  }

  .search-wrapper::before,
  .search-wrapper::after {
    content: '';
    position: absolute;
    pointer-events: none;
    z-index: 1;
  }

  .search-wrapper::before {
    inset-block-start: 50%;
    inset-inline-start: 0.54rem;
    width: 0.52rem;
    height: 0.52rem;
    border: 1.3px solid color-mix(in srgb, var(--input-placeholder-color) 78%, transparent);
    border-radius: 999px;
    transform: translateY(-56%);
  }

  .search-wrapper::after {
    inset-block-start: calc(50% + 0.17rem);
    inset-inline-start: 1.02rem;
    width: 0.32rem;
    height: 1.3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--input-placeholder-color) 78%, transparent);
    transform: rotate(45deg);
    transform-origin: left center;
  }

  input.search {
    padding-inline-start: 1.5rem;
    background: var(--admin-editor-emoji-picker-control-bg);
    font-family: var(--admin-font-ui);
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease;
  }

  input.search:hover {
    border-color: color-mix(in srgb, var(--input-border-color) 62%, var(--input-font-color) 38%);
  }

  input.search:focus {
    background: var(--background);
    box-shadow: inset 0 0 0 1px var(--outline-color);
  }

  .skintone-button-wrapper {
    background: transparent;
    border-radius: var(--skintone-border-radius);
  }

  button#skintone-button {
    width: var(--admin-editor-emoji-picker-control-size);
    height: var(--admin-editor-emoji-picker-control-size);
    background: transparent;
    border-radius: var(--skintone-border-radius);
    font-size: calc(var(--emoji-size) * 0.9);
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease;
  }

  button#skintone-button:hover {
    background: var(--admin-editor-emoji-picker-control-bg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--input-font-color) 5%, transparent);
  }

  .skintone-list {
    inset-inline-end: calc(var(--emoji-padding) * 1.04);
    top: calc((var(--emoji-padding) * 0.82) + var(--total-emoji-size) + 3px);
    z-index: 5;
    border: 1px solid var(--admin-editor-emoji-picker-menu-border);
    border-radius: var(--skintone-border-radius);
    overflow: hidden;
    background: var(--admin-editor-emoji-picker-menu-bg);
    box-shadow: 0 12px 24px -18px var(--admin-editor-emoji-picker-menu-shadow);
  }

  .emoji,
  button.emoji {
    padding-block-start: 0.03em;
  }

  .nav {
    padding-block: calc(var(--emoji-padding) * 0.28);
  }

  .skintone-list .emoji,
  .nav-emoji {
    border-radius: var(--skintone-border-radius);
  }

  .category {
    padding-block: calc(var(--emoji-padding) * 0.72);
    background: color-mix(in srgb, var(--background) 94%, var(--category-font-color) 6%);
    border-block: 1px solid var(--border-color);
    font-family: var(--admin-font-ui);
    letter-spacing: 0;
  }

  .favorites {
    background: color-mix(in srgb, var(--background) 92%, var(--category-font-color) 8%);
    border-top: 1px solid var(--border-color);
    overflow-x: auto;
    overflow-y: hidden;
  }
`;

const injectEmojiPickerShadowStyle = (picker: HTMLElement) => {
  const style = document.createElement('style');
  style.textContent = emojiPickerShadowStyle;
  picker.shadowRoot?.appendChild(style);
};

export const createAdminEditorEmojiPicker = async ({
  isDisabled,
  onEmojiClick
}: CreateEmojiPickerOptions): Promise<EmojiPickerHandle> => {
  const { Picker } = await import('emoji-picker-element');
  const dataSource = new URL('emoji-picker-element-data/en/emojibase/data.json', import.meta.url).toString();
  const picker = new Picker({
    dataSource,
    i18n: emojiPickerI18n,
    locale: 'zh-CN',
    skinToneEmoji: '👋'
  });
  const handleEmojiClick = (event: Event) => {
    if (isDisabled?.()) return;

    const detail = (event as CustomEvent<EmojiClickEventDetail>).detail;
    const unicode = detail?.unicode;
    if (!unicode) return;

    onEmojiClick(unicode);
  };

  injectEmojiPickerShadowStyle(picker);
  picker.addEventListener('emoji-click', handleEmojiClick);

  return {
    element: picker,
    destroy() {
      picker.removeEventListener('emoji-click', handleEmojiClick);
      picker.remove();
    }
  };
};
