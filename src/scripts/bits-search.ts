import {
  buildSearchHaystack,
  createDebouncedAsyncRunner,
  createJsonIndexLoader,
  createWithBase,
  tokenizeSearchQuery
} from '../utils/format';

const form = document.querySelector<HTMLFormElement>('[data-bits-search-form]');
const input = document.getElementById('bits-search') as HTMLInputElement | null;
const btn = document.getElementById('bits-search-btn') as HTMLButtonElement | null;
const statusEl = document.getElementById('bits-search-status') as HTMLDivElement | null;
const liveEl = document.getElementById('bits-search-live') as HTMLParagraphElement | null;
const browseRoot = document.querySelector<HTMLElement>('[data-bits-browse]');
const resultsRoot = document.querySelector<HTMLElement>('[data-bits-search-results]');
const resultsSummaryEl = document.querySelector<HTMLElement>('[data-bits-search-results-summary]');
const resultsListEl = document.querySelector<HTMLElement>('[data-bits-search-results-list]');
const resultsPaginationEl = document.querySelector<HTMLElement>('[data-bits-search-pagination]');
const clearBtn = document.querySelector<HTMLButtonElement>('[data-bits-search-clear]');
const yearFilterRoot = document.querySelector<HTMLElement>('[data-bits-year-filter]');
const yearCursor = document.querySelector<HTMLElement>('[data-bits-year-cursor]');
const yearButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-bits-year-item]'));
const yearMoreRoot = document.querySelector<HTMLElement>('[data-bits-year-more]');
const yearMoreTrigger = document.querySelector<HTMLButtonElement>('[data-bits-year-more-trigger]');
const yearMoreLabel = document.querySelector<HTMLElement>('[data-bits-year-more-label]');
const yearMenu = document.querySelector<HTMLElement>('[data-bits-year-menu]');
const yearMenuButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-bits-year-menu-item]'));
const yearSelect = document.querySelector<HTMLSelectElement>('[data-bits-year-select]');
const yearSelectWrap = yearSelect?.closest<HTMLElement>('.bits-year-select-wrap') ?? null;

const encryptedMoreRoot = document.querySelector<HTMLElement>('[data-bits-encrypted-more]');
const encryptedTrigger = document.querySelector<HTMLButtonElement>('[data-bits-encrypted-trigger]');
const encryptedLabel = document.querySelector<HTMLElement>('[data-bits-encrypted-label]');
const encryptedMenu = document.querySelector<HTMLElement>('[data-bits-encrypted-menu]');
const encryptedMenuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-bits-encrypted-menu-item]'));
const encryptedSelect = document.querySelector<HTMLSelectElement>('[data-bits-encrypted-select]');
const encryptedSelectWrap = encryptedSelect?.closest<HTMLElement>('.bits-encrypted-select-wrap') ?? null;

const base = import.meta.env.BASE_URL ?? '/';
const withBase = createWithBase(base);
const indexUrl = withBase('bits/index.json');

const FILTER_DEBOUNCE_MS = 120;
const PAGE_SIZE = 50;
const QUERY_PARAM_QUERY = 'q';
const QUERY_PARAM_YEAR = 'year';
const QUERY_PARAM_ENCRYPTED = 'encrypted';

// 加密筛选的三种状态：
//   'all'       — 不筛选，显示全部（默认）
//   'public'    — 仅显示公开内容
//   'encrypted' — 仅显示加密内容
type EncryptedFilter = 'all' | 'public' | 'encrypted';

type IndexItem = {
  key?: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  text: string;
  excerpt?: string;
  date: string | null;
  dateLabel?: string | null;
  year?: number | null;
  page?: number;
  href?: string;
  encrypted?: boolean;
  thumbnail?: {
    src: string;
    width?: number;
    height?: number;
    alt: string;
  } | null;
};

const getIndexKey = (item: Pick<IndexItem, 'key' | 'slug'>) => (item.key || item.slug || '').trim();
const getYearButtonValue = (button: HTMLButtonElement) => {
  const raw = (button.dataset.bitsYear ?? '').trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const availableYears = new Set(
  (yearSelect
    ? Array.from(yearSelect.options)
        .map((option) => option.value.trim())
        .filter(Boolean)
        .map((value) => Number(value))
        .filter((year): year is number => Number.isFinite(year))
    : [...yearButtons, ...yearMenuButtons]
        .map((button) => getYearButtonValue(button))
        .filter((year): year is number => year !== null))
);
const overflowYears = new Set(
  yearMenuButtons.map((button) => getYearButtonValue(button)).filter((year): year is number => year !== null)
);
const shouldBypassIndexCache = import.meta.env.DEV;

let indexHay: Map<string, string> | null = null;
let filterRunId = 0;
let activeYear: number | null = null;
let activeEncrypted: EncryptedFilter = 'public';
let isMoreMenuOpen = false;
let statusTimer: number | null = null;
let currentPage = 1;
let totalFilteredItems: IndexItem[] = [];
const filterRunner = createDebouncedAsyncRunner(() => applyFilter(), FILTER_DEBOUNCE_MS);

const getTrimmedQuery = () => (input?.value || '').trim();
const getNormalizedQuery = () => getTrimmedQuery().toLowerCase();

const clearStatusTimer = () => {
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const includesAnyTerm = (value: string, terms: string[]) => {
  if (!value.trim()) return false;
  if (!terms.length) return true;
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
};

const getContextSnippet = (value: string, terms: string[], maxLength = 120) => {
  const normalized = value.trim();
  if (!normalized) return '';
  if (!terms.length) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  const lower = normalized.toLowerCase();
  let matchIndex = -1;
  let matchedTerm = '';

  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
      matchedTerm = term;
    }
  }

  if (matchIndex < 0) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  const before = Math.max(0, matchIndex - Math.floor((maxLength - matchedTerm.length) / 2));
  const after = Math.min(normalized.length, before + maxLength);
  const snippet = normalized.slice(before, after).trim();
  const prefix = before > 0 ? '…' : '';
  const suffix = after < normalized.length ? '…' : '';
  return `${prefix}${snippet}${suffix}`;
};

const getDisplaySnippet = (item: IndexItem, terms: string[]) => {
  const candidates = [
    item.description?.trim() ?? '',
    item.excerpt?.trim() ?? '',
    item.text?.trim() ?? '',
    item.title?.trim() ?? ''
  ].filter(Boolean);

  const matchedCandidate = candidates.find((value) => includesAnyTerm(value, terms));
  const source = matchedCandidate || candidates[0] || '';
  if (!source) return '';

  return getContextSnippet(source, terms, 120);
};

const highlightText = (value: string, terms: string[]) => {
  if (!value) return '';
  if (!terms.length) return escapeHtml(value);

  const validTerms = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!validTerms.length) return escapeHtml(value);

  const regex = new RegExp(`(${validTerms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = value.split(regex);

  return parts
    .map((part) => {
      if (!part) return '';
      const matched = validTerms.some((term) => part.toLowerCase() === term.toLowerCase());
      const escaped = escapeHtml(part);
      return matched ? `<mark class="bit-search-result__mark">${escaped}</mark>` : escaped;
    })
    .join('');
};

const getDisplayTags = (tags: string[]) => {
  const visibleTags = Array.isArray(tags)
    ? tags.filter((tag) => typeof tag === 'string' && tag.trim() !== '')
    : [];
  const placeTag = visibleTags.find((tag) => tag.toLowerCase().startsWith('loc:')) ?? '';
  const placeText = placeTag ? placeTag.slice(4).trim() : '';
  const normalTags = visibleTags.filter((tag) => tag !== placeTag);

  return {
    placeText,
    normalTags
  };
};

const setVisibleStatus = (text: string) => {
  if (!statusEl) return;
  if (statusEl.textContent !== text) {
    statusEl.textContent = text;
  }
};

const setLiveStatus = (text: string) => {
  if (!liveEl) return;
  if (liveEl.textContent !== text) {
    liveEl.textContent = text;
  }
};

const setStatus = (
  text: string,
  options: {
    announce?: boolean;
    autoClearMs?: number;
    visible?: boolean;
  } = {}
) => {
  clearStatusTimer();
  const { announce = true, autoClearMs, visible = true } = options;
  setVisibleStatus(visible ? text : '');
  setLiveStatus(announce ? text : '');
  if (text && options.autoClearMs) {
    statusTimer = window.setTimeout(() => {
      setVisibleStatus('');
      setLiveStatus('');
      statusTimer = null;
    }, autoClearMs);
  }
};

const formatResultsSummary = (count: number, year: number | null, page: number, totalPages: number) => {
  const summary =
    totalPages > 1
      ? `找到 ${count} 条结果，第 ${page} / ${totalPages} 页`
      : `找到 ${count} 条结果`;
  return year ? `${year} 年 · ${summary}` : summary;
};

const isResultsVisible = () => resultsRoot?.hasAttribute('hidden') === false;
const getFirstResultLink = () => resultsListEl?.querySelector<HTMLAnchorElement>('.bit-search-result__link') ?? null;
const isOverflowYear = (year: number | null): year is number => year !== null && overflowYears.has(year);
const getCursorTargetButton = () => {
  if ((isMoreMenuOpen || isOverflowYear(activeYear)) && yearMoreTrigger) {
    return yearMoreTrigger;
  }
  return yearButtons.find((button) => button.classList.contains('is-active')) ?? yearMoreTrigger ?? null;
};

const updateYearCursor = () => {
  if (!yearFilterRoot || !yearCursor) return;
  const activeButton = getCursorTargetButton();
  if (!activeButton) return;
  const rootRect = yearFilterRoot.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  const primaryCursorWidth = yearButtons
    .map((button) => ({
      button,
      year: getYearButtonValue(button)
    }))
    .filter((item) => item.year !== null)
    .reduce((width, item) => Math.max(width, item.button.offsetWidth), activeButton.offsetWidth);
  const cursorWidth =
    (isMoreMenuOpen || isOverflowYear(activeYear)) && yearMoreTrigger
      ? Math.max(yearMoreTrigger.offsetWidth, primaryCursorWidth)
      : Math.max(activeButton.offsetWidth, primaryCursorWidth);
  const centeredLeft = buttonRect.left - rootRect.left - (cursorWidth - activeButton.offsetWidth) / 2;
  const maxLeft = Math.max(rootRect.width - cursorWidth, 0);
  const cursorLeft = Math.min(Math.max(centeredLeft, 0), maxLeft);

  yearCursor.style.width = `${cursorWidth}px`;
  yearCursor.style.transform = `translateX(${cursorLeft}px)`;
};

const setMoreMenuOpen = (open: boolean) => {
  if (!yearMoreRoot || !yearMoreTrigger || !yearMenu) {
    isMoreMenuOpen = false;
    return;
  }
  isMoreMenuOpen = open;
  yearMoreRoot.dataset.open = String(open);
  yearMoreTrigger.classList.toggle('is-open', open);
  yearMoreTrigger.setAttribute('aria-expanded', String(open));
  if (open) {
    yearMenu.removeAttribute('hidden');
  } else {
    yearMenu.setAttribute('hidden', 'true');
  }
  window.requestAnimationFrame(updateYearCursor);
};

const closeMoreMenu = () => {
  if (!isMoreMenuOpen) return;
  setMoreMenuOpen(false);
};

const ENCRYPTED_LABELS: Record<EncryptedFilter, string> = {
  all: '全部',
  public: '公开',
  encrypted: '加密'
};

const setActiveEncryptedState = (encrypted: EncryptedFilter) => {
  activeEncrypted = encrypted;
  // data-bits-encrypted="" → 全部；data-bits-encrypted="true" → 加密；data-bits-encrypted="false" → 公开
  encryptedMenuItems.forEach((button) => {
    const val = button.dataset.bitsEncrypted;
    const buttonFilter: EncryptedFilter = val === '' ? 'all' : val === 'true' ? 'encrypted' : 'public';
    const isActive = buttonFilter === encrypted;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  if (encryptedLabel) {
    encryptedLabel.textContent = ENCRYPTED_LABELS[encrypted];
  }
  if (encryptedSelect) {
    // <select> 的 value 约定：'' = 全部, 'true' = 加密, 'false' = 公开
    encryptedSelect.value = encrypted === 'all' ? '' : encrypted === 'encrypted' ? 'true' : 'false';
    encryptedSelect.dataset.empty = String(encrypted === 'all');
  }
  if (encryptedSelectWrap) {
    encryptedSelectWrap.dataset.empty = String(encrypted === 'all');
    encryptedSelectWrap.dataset.active = String(encrypted !== 'all');
  }
};

const setActiveYearState = (year: number | null) => {
  activeYear = year;
  yearButtons.forEach((button) => {
    const buttonYear = getYearButtonValue(button);
    const isActive = buttonYear === year;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  yearMenuButtons.forEach((button) => {
    const buttonYear = getYearButtonValue(button);
    const isActive = buttonYear === year;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  if (yearMoreRoot && yearMoreTrigger) {
    const isMoreActive = isOverflowYear(year);
    yearMoreRoot.dataset.active = String(isMoreActive);
    yearMoreTrigger.classList.toggle('is-active', isMoreActive);
    yearMoreTrigger.setAttribute('aria-label', isMoreActive ? `打开更多年份筛选，当前 ${year} 年` : '打开更多年份筛选');
  }
  if (yearMoreLabel) {
    yearMoreLabel.textContent = isOverflowYear(year) ? String(year) : '更多';
  }
  if (yearSelect) {
    yearSelect.value = year === null ? '' : String(year);
    yearSelect.dataset.empty = String(year === null);
  }
  if (yearSelectWrap) {
    yearSelectWrap.dataset.empty = String(year === null);
    yearSelectWrap.dataset.active = String(year !== null);
  }
  window.requestAnimationFrame(updateYearCursor);
};

const getFilterUrl = (query: string, year: number | null, encrypted: EncryptedFilter = activeEncrypted) => {
  const nextUrl = new URL(window.location.href);
  nextUrl.hash = '';
  if (query) {
    nextUrl.searchParams.set(QUERY_PARAM_QUERY, query);
  } else {
    nextUrl.searchParams.delete(QUERY_PARAM_QUERY);
  }
  if (year !== null) {
    nextUrl.searchParams.set(QUERY_PARAM_YEAR, String(year));
  } else {
    nextUrl.searchParams.delete(QUERY_PARAM_YEAR);
  }
  // 'public' 是默认值，不写入 URL 以保持干净；'encrypted' 写入 true，'all' 写入 all
  if (encrypted === 'encrypted') {
    nextUrl.searchParams.set(QUERY_PARAM_ENCRYPTED, 'true');
  } else if (encrypted === 'all') {
    nextUrl.searchParams.set(QUERY_PARAM_ENCRYPTED, 'all');
  } else {
    nextUrl.searchParams.delete(QUERY_PARAM_ENCRYPTED);
  }
  const search = nextUrl.searchParams.toString();
  return `${nextUrl.pathname}${search ? `?${search}` : ''}`;
};

const syncUrlState = (query = getTrimmedQuery(), year = activeYear, encrypted = activeEncrypted) => {
  const next = getFilterUrl(query, year, encrypted);
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) {
    window.history.replaceState({}, '', next);
  }
};

const readInitialState = () => {
  const url = new URL(window.location.href);
  const query = (url.searchParams.get(QUERY_PARAM_QUERY) ?? '').trim();
  const rawYear = (url.searchParams.get(QUERY_PARAM_YEAR) ?? '').trim();
  const rawEncrypted = (url.searchParams.get(QUERY_PARAM_ENCRYPTED) ?? '').trim();

  let year: number | null = null;
  if (rawYear) {
    const parsedYear = Number(rawYear);
    if (Number.isFinite(parsedYear) && availableYears.has(parsedYear)) {
      year = parsedYear;
    }
  }

  // 无参数 = 公开（默认），'true' = 仅加密，'all' = 全部
  let encrypted: EncryptedFilter = 'public';
  if (rawEncrypted === 'true') {
    encrypted = 'encrypted';
  } else if (rawEncrypted === 'all') {
    encrypted = 'all';
  }

  return {
    query,
    year,
    encrypted
  };
};

const bitsList = document.getElementById('bits-list');

// 切回 browse 视图（带搜索词高亮的结果列表）
// 根据当前 activeEncrypted 状态决定是否展示加密卡片
const showBrowse = () => {
  browseRoot?.removeAttribute('hidden');
  resultsRoot?.setAttribute('hidden', 'true');
  if (resultsListEl) {
    resultsListEl.innerHTML = '';
  }
  if (resultsSummaryEl) {
    resultsSummaryEl.textContent = '搜索结果';
  }
  if (bitsList) {
    // 'all' 或 'encrypted' 时显示加密卡片，'public' 时隐藏
    if (activeEncrypted !== 'public') {
      bitsList.setAttribute('data-show-encrypted', '');
    } else {
      bitsList.removeAttribute('data-show-encrypted');
    }
  }
};

const getEmptyResultsText = (query: string, year: number | null) => {
  if (year !== null && query) {
    return '这个年份下没有匹配内容，试试换个关键词或年份。';
  }
  return '未找到相关内容，换个关键词试试。';
};

const renderPagination = (total: number, page: number) => {
  if (!resultsPaginationEl) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) {
    resultsPaginationEl.innerHTML = '';
    resultsPaginationEl.setAttribute('hidden', 'true');
    return;
  }

  resultsPaginationEl.removeAttribute('hidden');

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  resultsPaginationEl.innerHTML = `
    <nav class="pagination" aria-label="搜索结果分页">
      <div class="pagination__inner">
        <button
          class="pagination__link${prevDisabled ? ' pagination__link--disabled' : ''}"
          type="button"
          data-bits-page-prev
          ${prevDisabled ? 'disabled aria-disabled="true"' : ''}
          aria-label="上一页"
        >上一页</button>
        <span class="pagination__info" aria-live="polite">${page} / ${totalPages}</span>
        <button
          class="pagination__link pagination__link--next${nextDisabled ? ' pagination__link--disabled' : ''}"
          type="button"
          data-bits-page-next
          ${nextDisabled ? 'disabled aria-disabled="true"' : ''}
          aria-label="下一页"
        >下一页</button>
      </div>
    </nav>
  `;

  resultsPaginationEl.querySelector('[data-bits-page-prev]')?.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderResults(totalFilteredItems, false);
    resultsRoot?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  resultsPaginationEl.querySelector('[data-bits-page-next]')?.addEventListener('click', () => {
    const pages = Math.ceil(totalFilteredItems.length / PAGE_SIZE);
    if (currentPage >= pages) return;
    currentPage += 1;
    renderResults(totalFilteredItems, false);
    resultsRoot?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
};

const renderResults = (matchedItems: IndexItem[], resetPage = true) => {
  if (!resultsRoot || !resultsListEl) return;

  if (resetPage) {
    currentPage = 1;
  }
  totalFilteredItems = matchedItems;

  const totalPages = Math.ceil(matchedItems.length / PAGE_SIZE);
  const safePage = Math.min(Math.max(currentPage, 1), totalPages || 1);
  if (safePage !== currentPage) currentPage = safePage;

  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleItems = matchedItems.slice(start, start + PAGE_SIZE);
  const summary = formatResultsSummary(matchedItems.length, activeYear, currentPage, totalPages);
  if (resultsSummaryEl) {
    resultsSummaryEl.textContent = summary;
  }

  resultsListEl.innerHTML = visibleItems
    .map((item) => {
      const href = item.href ? escapeHtml(item.href) : withBase('bits/');
      const dateLabel = item.dateLabel?.trim() ?? '';
      const metaTrail = dateLabel
        ? `<time class="bit-search-result__date" datetime="${escapeHtml(item.date ?? '')}">${escapeHtml(dateLabel)}</time>`
        : '';

      if (item.encrypted) {
        const { placeText, normalTags } = getDisplayTags(item.tags ?? []);
        const place = placeText
          ? `<span class="bit-search-result__tag bit-search-result__tag--place">📍 ${escapeHtml(placeText)}</span>`
          : '';
        const tags = normalTags
          .slice(0, 3)
          .map((tag) => `<span class="bit-search-result__tag">#${escapeHtml(tag.trim())}</span>`)
          .join('');
        const encryptedSummary = item.excerpt?.trim() ?? '';

        return `
          <article class="bit-card bit-card--search-result">
            <a class="bit-search-result__link" href="${href}">
              <div class="bit-search-result__layout bit-search-result__layout--encrypted">
                <div class="bit-search-result__encrypted-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div class="bit-search-result__encrypted-body">
                  <div class="bit-search-result__encrypted-header">
                    <span class="bit-search-result__encrypted-badge">加密内容</span>
                  </div>
                  ${encryptedSummary
                    ? `<p class="bit-search-result__excerpt bit-search-result__encrypted-summary">${escapeHtml(encryptedSummary)}</p>`
                    : `<p class="bit-search-result__encrypted-hint">此内容受密码保护，点击前往输入密码</p>`}
                  ${place || tags || metaTrail
                    ? `
                      <div class="bit-search-result__footer">
                        ${place || tags ? `<div class="bit-search-result__tags">${place}${tags}</div>` : '<div></div>'}
                        ${metaTrail ? `<div class="bit-search-result__meta-line">${metaTrail}</div>` : ''}
                      </div>
                    `
                    : ''}
                </div>
              </div>
            </a>
          </article>
        `;
      }

      const query = getTrimmedQuery();
      const queryTerms = tokenizeSearchQuery(query);
      const snippet = getDisplaySnippet(item, queryTerms);
      const { placeText, normalTags } = getDisplayTags(item.tags ?? []);
      const place = placeText
        ? `<span class="bit-search-result__tag bit-search-result__tag--place">📍 ${highlightText(placeText, queryTerms)}</span>`
        : '';
      const tags = normalTags
        .slice(0, 3)
        .map(
          (tag) =>
            `<span class="bit-search-result__tag" data-tag="${escapeHtml(tag.trim())}" role="button" tabindex="0">#${highlightText(tag.trim(), queryTerms)}</span>`
        )
        .join('');
      const fullMetaTrail = [
        metaTrail
      ]
        .filter(Boolean)
        .join('<span class="bit-search-result__sep" aria-hidden="true">·</span>');
      const thumbnail = item.thumbnail
        ? `
          <div class="bit-search-result__thumb">
            <img
              src="${escapeHtml(item.thumbnail.src)}"
              alt="${escapeHtml(item.thumbnail.alt || snippet || '絮语配图')}"
              ${item.thumbnail.width ? `width="${item.thumbnail.width}"` : ''}
              ${item.thumbnail.height ? `height="${item.thumbnail.height}"` : ''}
              loading="lazy"
              decoding="async"
              onload="this.setAttribute('data-loaded','')"
              onerror="this.onerror=null;this.src='${escapeHtml(base)}images/placeholder.svg';this.setAttribute('data-loaded','')"
            />
          </div>
        `
        : '';

      return `
        <article class="bit-card bit-card--search-result">
          <a class="bit-search-result__link" href="${href}">
            <div class="bit-search-result__layout${thumbnail ? ' bit-search-result__layout--media' : ''}">
              <div class="bit-search-result__content">
                ${thumbnail ? `${thumbnail}<div class="bit-search-result__body">` : ''}
                ${snippet ? `<p class="bit-search-result__excerpt">${highlightText(snippet, queryTerms)}</p>` : ''}
                ${place || tags || fullMetaTrail
                  ? `
                    <div class="bit-search-result__footer">
                      ${place || tags ? `<div class="bit-search-result__tags">${place}${tags}</div>` : '<div></div>'}
                      ${fullMetaTrail ? `<div class="bit-search-result__meta-line">${fullMetaTrail}</div>` : ''}
                    </div>
                  `
                  : ''}
                ${thumbnail ? '</div>' : ''}
              </div>
            </div>
          </a>
        </article>
      `;
    })
    .join('');

  browseRoot?.setAttribute('hidden', 'true');
  resultsRoot.removeAttribute('hidden');
  renderPagination(matchedItems.length, currentPage);
};

const filterIndexItems = (index: IndexItem[], queryTerms: string[], year: number | null, encrypted: EncryptedFilter) =>
  index.filter((item) => {
    const key = getIndexKey(item);
    if (!key) return false;
    if (year !== null && item.year !== year) return false;
    // 'all' 不过滤；'encrypted' 只留加密项；'public' 只留公开项
    if (encrypted === 'encrypted' && !item.encrypted) return false;
    if (encrypted === 'public' && item.encrypted) return false;
    const hay = indexHay?.get(key) || '';
    return queryTerms.every((term) => hay.includes(term));
  });

const scheduleApplyFilter = (delay = FILTER_DEBOUNCE_MS) => {
  filterRunner.schedule(delay);
};

// 重置年份和搜索词，但保留加密筛选状态
// 'encrypted' 时需要走 applyFilter 展示仅加密结果；其他情况直接回到 browse 视图
const resetYearOnly = async () => {
  filterRunId += 1;
  filterRunner.cancel();
  if (input) input.value = '';
  currentPage = 1;
  totalFilteredItems = [];
  setActiveYearState(null);
  if (activeEncrypted === 'encrypted') {
    await applyFilter();
  } else {
    showBrowse();
    setStatus('');
    syncUrlState('', null, activeEncrypted);
  }
};

const resetFilters = (options: { focusInput?: boolean } = {}) => {
  filterRunId += 1;
  filterRunner.cancel();
  closeMoreMenu();
  if (input) {
    input.value = '';
  }
  currentPage = 1;
  totalFilteredItems = [];
  setActiveYearState(null);
  setActiveEncryptedState('public');
  showBrowse();
  setStatus('');
  syncUrlState('', null, 'public');
  if (options.focusInput) {
    input?.focus();
  }
};

const setDegradedMode = () => {
  if (input) {
    input.placeholder = '索引加载失败';
    input.disabled = true;
    input.setAttribute('aria-disabled', 'true');
  }
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
  yearButtons.forEach((button) => {
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('disabled', 'true');
  });
  yearMoreTrigger?.setAttribute('aria-disabled', 'true');
  yearMoreTrigger?.setAttribute('disabled', 'true');
  yearMenuButtons.forEach((button) => {
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('disabled', 'true');
  });
  if (yearSelect) {
    yearSelect.disabled = true;
    yearSelect.setAttribute('aria-disabled', 'true');
  }
  yearSelectWrap?.setAttribute('data-disabled', 'true');
  encryptedTrigger?.setAttribute('aria-disabled', 'true');
  encryptedTrigger?.setAttribute('disabled', 'true');
  if (encryptedSelect) {
    encryptedSelect.disabled = true;
    encryptedSelect.setAttribute('aria-disabled', 'true');
  }
  encryptedSelectWrap?.setAttribute('data-disabled', 'true');
  closeMoreMenu();
  setStatus('索引加载失败，已禁用搜索');
  showBrowse();
};

const indexLoader = createJsonIndexLoader<IndexItem>({
  url: indexUrl,
  shouldBypassCache: shouldBypassIndexCache,
  onPending: () => {
    setStatus('正在加载索引...', { visible: false });
  },
  onResolved: (data) => {
    indexHay = new Map(
      data
        .map((item) => [
          getIndexKey(item),
          buildSearchHaystack([item.title, item.description, item.tags, item.text])
        ] as const)
        .filter(([key]) => key !== '')
    );
    setStatus('');
  },
  onRejected: () => {
    setDegradedMode();
  }
});

const loadIndex = () => indexLoader.load();

const applyFilter = async (preloadedIndex: IndexItem[] | null = null) => {
  if (!input) return;
  filterRunner.cancel();

  const runId = ++filterRunId;
  const rawQuery = getTrimmedQuery();
  const queryTerms = tokenizeSearchQuery(rawQuery);
  const normalizedQuery = rawQuery.toLowerCase();

  if (rawQuery === '' && activeYear === null && activeEncrypted === 'public') {
    showBrowse();
    setStatus('');
    syncUrlState('', null, 'public');
    return;
  }

  const index = preloadedIndex ?? (await loadIndex());
  if (runId !== filterRunId || getNormalizedQuery() !== normalizedQuery) {
    return;
  }
  if (!index || !indexHay) {
    showBrowse();
    return;
  }

  syncUrlState(rawQuery, activeYear, activeEncrypted);

  const matchedItems = filterIndexItems(index, queryTerms, activeYear, activeEncrypted);
  if (matchedItems.length === 0) {
    showBrowse();
    if (resultsRoot && resultsListEl) {
      if (resultsSummaryEl) {
        resultsSummaryEl.textContent = '无匹配结果';
      }
      resultsListEl.innerHTML = `<p class="bits-search-results__empty">${escapeHtml(getEmptyResultsText(rawQuery, activeYear))}</p>`;
      browseRoot?.setAttribute('hidden', 'true');
      resultsRoot.removeAttribute('hidden');
    }
    setStatus('');
    return;
  }

  renderResults(matchedItems);
  setStatus('');
};

input?.addEventListener('focus', () => {
  void loadIndex();
});

input?.addEventListener('input', () => {
  scheduleApplyFilter();
});

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    resetFilters({ focusInput: true });
    return;
  }
  if (event.key !== 'ArrowDown' || !isResultsVisible()) return;
  const firstResultLink = getFirstResultLink();
  if (!firstResultLink) return;
  event.preventDefault();
  firstResultLink.focus();
});

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  void applyFilter();
});

clearBtn?.addEventListener('click', () => {
  resetFilters({ focusInput: true });
});

const handleTagClick = (tag: string) => {
  if (!tag || !input) return;
  input.value = `${tag}`;
  void applyFilter();
  input.focus();
};

resultsListEl?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;

  const tagEl = target?.closest<HTMLElement>('span[data-tag]');
  if (tagEl) {
    event.preventDefault();
    event.stopPropagation();
    handleTagClick(tagEl.dataset.tag ?? '');
    return;
  }

  const link = target?.closest<HTMLAnchorElement>('a[href]');
  if (!link) return;

  const nextUrl = new URL(link.href, window.location.href);
  const currentUrl = new URL(window.location.href);
  if (nextUrl.pathname !== currentUrl.pathname) {
    return;
  }

  event.preventDefault();

  // 点击搜索结果里的 bit 链接，切回 browse 视图定位到目标卡片
  // 保留当前加密筛选状态（showBrowse 会据此决定是否显示加密卡片）
  filterRunId += 1;
  filterRunner.cancel();
  if (input) input.value = '';
  currentPage = 1;
  totalFilteredItems = [];
  setActiveYearState(null);
  showBrowse();
  setStatus('');
  syncUrlState('', null, activeEncrypted);

  if (!nextUrl.hash) return;
  const targetEl = document.getElementById(nextUrl.hash.slice(1));
  if (!targetEl) {
    window.location.hash = nextUrl.hash;
    return;
  }

  const basePath = getFilterUrl('', null, activeEncrypted);
  window.history.replaceState({}, '', basePath);
  window.requestAnimationFrame(() => {
    window.location.hash = nextUrl.hash;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

resultsListEl?.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;

  const tagEl = target?.closest<HTMLElement>('span[data-tag]');
  if (tagEl && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    handleTagClick(tagEl.dataset.tag ?? '');
    return;
  }

  if (event.key !== 'ArrowUp') return;
  const currentLink = target?.closest<HTMLAnchorElement>('.bit-search-result__link');
  const firstResultLink = getFirstResultLink();
  if (!currentLink || !firstResultLink || currentLink !== firstResultLink) return;
  event.preventDefault();
  input?.focus();
});

yearButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const year = getYearButtonValue(button);
    if (button.dataset.bitsYear !== '' && year === null) return;
    if (indexLoader.hasFailed()) return;

    closeMoreMenu();

    // 年份"全部"：只重置年份和搜索词，保留加密筛选状态
    if (year === null) {
      if (activeYear === null && !isResultsVisible()) return;
      await resetYearOnly();
      return;
    }

    if (activeYear === year) return;
    setActiveYearState(year);
    await applyFilter();
  });
});

yearMoreTrigger?.addEventListener('click', (event) => {
  event.preventDefault();
  if (indexLoader.hasFailed()) return;
  setMoreMenuOpen(!isMoreMenuOpen);
});

yearMoreTrigger?.addEventListener('keydown', (event) => {
  if (indexLoader.hasFailed()) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setMoreMenuOpen(true);
    (yearMenuButtons.find((button) => button.classList.contains('is-active')) ?? yearMenuButtons[0])?.focus();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMoreMenu();
    yearMoreTrigger.focus();
  }
});

yearMenuButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    if (indexLoader.hasFailed()) return;
    const year = getYearButtonValue(button);
    if (year === null || activeYear === year) {
      closeMoreMenu();
      return;
    }

    setActiveYearState(year);
    closeMoreMenu();
    await applyFilter();
  });
});

yearMenu?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMoreMenu();
    yearMoreTrigger?.focus();
    return;
  }

  const currentIndex = yearMenuButtons.findIndex((button) => button === document.activeElement);
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (event.key === 'ArrowDown') {
    nextIndex = currentIndex >= yearMenuButtons.length - 1 ? 0 : currentIndex + 1;
  } else if (event.key === 'ArrowUp') {
    nextIndex = currentIndex <= 0 ? yearMenuButtons.length - 1 : currentIndex - 1;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = yearMenuButtons.length - 1;
  }

  if (nextIndex === currentIndex) return;
  event.preventDefault();
  yearMenuButtons[nextIndex]?.focus();
});

const closeEncryptedMenu = () => {
  if (!encryptedMoreRoot || !encryptedTrigger || !encryptedMenu) return;
  encryptedMoreRoot.dataset.open = 'false';
  encryptedTrigger.classList.remove('is-open');
  encryptedTrigger.setAttribute('aria-expanded', 'false');
  encryptedMenu.setAttribute('hidden', 'true');
};

yearSelect?.addEventListener('change', async () => {
  if (indexLoader.hasFailed()) return;

  const raw = yearSelect.value.trim();
  const year = raw ? Number(raw) : null;
  if (raw && !Number.isFinite(year)) return;

  closeMoreMenu();

  // 年份"全部"：只重置年份和搜索词，保留加密筛选状态
  if (year === null) {
    if (activeYear === null && !isResultsVisible()) return;
    await resetYearOnly();
    return;
  }

  if (activeYear === year) return;
  setActiveYearState(year);
  await applyFilter();
});

yearMoreRoot?.addEventListener('focusout', (event) => {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && yearMoreRoot.contains(nextTarget)) {
    return;
  }
  closeMoreMenu();
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (isMoreMenuOpen && yearMoreRoot) {
    if (target instanceof Node && yearMoreRoot.contains(target)) return;
    closeMoreMenu();
  }
  if (encryptedMoreRoot && encryptedMoreRoot.dataset.open === 'true') {
    if (target instanceof Node && encryptedMoreRoot.contains(target)) return;
    closeEncryptedMenu();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeMoreMenu();
  closeEncryptedMenu();
});

encryptedTrigger?.addEventListener('click', (event) => {
  event.preventDefault();
  if (indexLoader.hasFailed()) return;
  if (!encryptedMoreRoot || !encryptedMenu) return;
  const isOpen = encryptedMoreRoot.dataset.open === 'true';
  if (isOpen) {
    closeEncryptedMenu();
  } else {
    encryptedMoreRoot.dataset.open = 'true';
    encryptedTrigger.classList.add('is-open');
    encryptedTrigger.setAttribute('aria-expanded', 'true');
    encryptedMenu.removeAttribute('hidden');
  }
});

encryptedMenuItems.forEach((button) => {
  button.addEventListener('click', async () => {
    if (indexLoader.hasFailed()) return;
    const val = button.dataset.bitsEncrypted;
    const encrypted: EncryptedFilter = val === '' ? 'all' : val === 'true' ? 'encrypted' : 'public';
    if (activeEncrypted === encrypted) {
      closeEncryptedMenu();
      return;
    }
    setActiveEncryptedState(encrypted);
    closeEncryptedMenu();
    await applyFilter();
  });
});

encryptedMoreRoot?.addEventListener('focusout', (event) => {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && encryptedMoreRoot.contains(nextTarget)) return;
  closeEncryptedMenu();
});

encryptedSelect?.addEventListener('change', async () => {
  if (indexLoader.hasFailed()) return;
  const val = encryptedSelect.value;
  const encrypted: EncryptedFilter = val === '' ? 'all' : val === 'true' ? 'encrypted' : 'public';
  setActiveEncryptedState(encrypted);
  await applyFilter();
});

window.addEventListener('resize', () => {
  closeMoreMenu();
  updateYearCursor();
});

yearFilterRoot?.setAttribute('data-ready', 'true');

const initialState = readInitialState();
if (input && initialState.query) {
  input.value = initialState.query;
}
setActiveYearState(initialState.year);
setActiveEncryptedState(initialState.encrypted);
syncUrlState(initialState.query, initialState.year, initialState.encrypted);

// 仅当有实际筛选条件时才触发搜索；纯默认状态（无查询、无年份、公开筛选）直接展示 browse
if (initialState.query || initialState.year !== null || initialState.encrypted !== 'public') {
  void applyFilter();
}
