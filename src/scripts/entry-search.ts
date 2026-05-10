import { getTagKeys, getTagPath, toTagKey, type TagScope } from '../lib/tags';
import {
  buildSearchHaystack,
  createDebouncedAsyncRunner,
  createJsonIndexLoader,
  createWithBase,
  tokenizeSearchQuery
} from '../utils/format';

type IndexItem = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  text: string;
  date: string | null;
  category?: string;
  filter?: string;
};

type PageItem = {
  el: HTMLElement;
  slug: string;
};

const root = document.querySelector<HTMLElement>('[data-entry-filters]');
const FILTER_DEBOUNCE_MS = 120;
const HOVER_PREVIEW_CLOSE_DELAY_MS = 48;
const HOVER_PREVIEW_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';

if (!root) {
  // Current page does not use entry search / tags.
} else {
  const searchRoot = root.querySelector<HTMLElement>('[data-entry-search]');
  const input = searchRoot?.querySelector<HTMLInputElement>('[data-entry-search-input]') ?? null;
  const toggleBtn = searchRoot?.querySelector<HTMLButtonElement>('[data-entry-search-toggle]') ?? null;
  const panel = searchRoot?.querySelector<HTMLElement>('[data-entry-search-panel]') ?? null;
  const feedbackEl = searchRoot?.querySelector<HTMLParagraphElement>('[data-entry-search-feedback]') ?? null;
  const liveEl = searchRoot?.querySelector<HTMLParagraphElement>('[data-entry-search-live]') ?? null;
  const isStandalonePage = searchRoot?.classList.contains('entry-search--standalone') ?? false;
  const tagTrigger = root.querySelector<HTMLAnchorElement>('[data-entry-tag-trigger]');
  const tagDialog = root.querySelector<HTMLDialogElement>('[data-entry-tag-dialog]');
  const tagCloseBtn = root.querySelector<HTMLButtonElement>('[data-entry-tag-close]');
  const tagDialogTitle = tagDialog?.querySelector<HTMLElement>('.entry-tags-dialog__title') ?? null;
  const pagination = document.querySelector<HTMLElement>('.pagination');
  const indexUrlRaw = (root.dataset.indexUrl ?? '').trim();
  const sectionSelector = (root.dataset.sectionSelector ?? '').trim();
  const tagScopeRaw = (root.dataset.tagScope ?? '').trim();
  const activeTagKey = (root.dataset.activeTagKey ?? '').trim();
  const activeTagLabel = (root.dataset.activeTagLabel ?? '').trim();

  const base = import.meta.env.BASE_URL ?? '/';
  const withBase = createWithBase(base);
  const indexUrl = indexUrlRaw ? withBase(indexUrlRaw) : '';
  const shouldBypassIndexCache = import.meta.env.DEV;

  const originalItems = Array.from(document.querySelectorAll<HTMLElement>('[data-entry-item]')).map((el) => ({
    el,
    slug: (el.getAttribute('data-slug') || '').trim()
  })) as PageItem[];
  
  let items = [...originalItems];
  let dynamicItemsContainer: HTMLElement | null = null;

  const sections = sectionSelector
    ? Array.from(document.querySelectorAll<HTMLElement>(sectionSelector))
    : [];
  const tagScope: TagScope | null = tagScopeRaw === 'archive' ? 'archive' : null;
  const availableTagKeys = new Set(
    Array.from(root.querySelectorAll<HTMLElement>('[data-entry-tag-key]'))
      .map((el) => (el.dataset.entryTagKey ?? '').trim())
      .filter(Boolean)
  );

  const setFeedbackStatus = (text: string) => {
    if (!feedbackEl) return;
    const next = text.trim();
    const nextHidden = next === '';
    if (feedbackEl.textContent === next && feedbackEl.hidden === nextHidden) return;
    feedbackEl.textContent = next;
    feedbackEl.hidden = nextHidden;
  };

  const setLiveStatus = (text: string) => {
    if (!liveEl) return;
    if (liveEl.textContent === text) return;
    liveEl.textContent = text;
  };

  const setStatus = (
    text: string,
    options: {
      announce?: boolean;
      visible?: boolean;
    } = {}
  ) => {
    const { announce = true, visible = true } = options;
    setFeedbackStatus(visible ? text : '');
    setLiveStatus(announce ? text : '');
  };

  const setItemVisible = (item: PageItem, visible: boolean) => {
    if (item.el.hidden === !visible) return;
    item.el.hidden = !visible;
  };

  const syncLegacyTagParam = () => {
    const url = new URL(window.location.href);
    const rawTag = (url.searchParams.get('tag') ?? '').trim();
    if (!rawTag) return;

    if (!tagScope) {
      url.searchParams.delete('tag');
      const fallback = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (fallback !== current) {
        window.history.replaceState({}, '', fallback);
      }
      return;
    }

    const tagKey = toTagKey(rawTag);
    url.searchParams.delete('tag');
    const search = url.searchParams.toString();
    const hash = url.hash || '';
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (!tagKey || (availableTagKeys.size > 0 && !availableTagKeys.has(tagKey))) {
      const fallback = `${url.pathname}${search ? `?${search}` : ''}${hash}`;
      if (fallback !== current) {
        window.history.replaceState({}, '', fallback);
      }
      return;
    }

    const targetPath = withBase(getTagPath(tagScope, tagKey));
    const target = `${targetPath}${search ? `?${search}` : ''}${hash}`;
    if (target !== current) {
      window.location.replace(target);
    }
  };

  const showAllItems = () => {
    for (const item of items) {
      setItemVisible(item, true);
    }
  };

  const highlightText = (text: string, query: string): string => {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  };

  const createDynamicItemElement = (indexItem: IndexItem, query = ''): HTMLElement => {
    const base = import.meta.env.BASE_URL ?? '/';
    const href = `${base}archive/${indexItem.slug}/`;
    const date = indexItem.date ? new Date(indexItem.date) : new Date();
    
    // Detect if we're on search page (has search-results section)
    const isSearchPage = !!document.querySelector('[data-search-results-section]');
    // Detect if we're on archive page (has year sections)
    const isArchivePage = !!document.querySelector('[data-entry-section]');
    
    if (isSearchPage) {
      // Create search result item with enhanced styling
      const item = document.createElement('div');
      item.className = 'result-item';
      item.setAttribute('data-entry-item', '');
      item.setAttribute('data-slug', indexItem.slug);
      item.setAttribute('data-dynamic-item', 'true');
      
      const meta = document.createElement('div');
      meta.className = 'result-item__meta';
      
      const category = document.createElement('span');
      category.className = 'result-item__category';
      category.textContent = indexItem.category || '随笔';
      meta.appendChild(category);
      
      const dateSpan = document.createElement('span');
      dateSpan.className = 'result-item__date';
      dateSpan.textContent = date.toISOString().split('T')[0] || '';
      meta.appendChild(dateSpan);
      
      item.appendChild(meta);
      
      const title = document.createElement('div');
      title.className = 'result-item__title';
      title.innerHTML = highlightText(indexItem.title, query);
      item.appendChild(title);
      
      if (indexItem.description) {
        const excerpt = document.createElement('div');
        excerpt.className = 'result-item__excerpt';
        excerpt.innerHTML = highlightText(indexItem.description, query);
        item.appendChild(excerpt);
      }
      
      // Make the whole item clickable
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        window.location.href = href;
      });
      
      return item;
    } else if (isArchivePage) {
      // Create archive-style item for archive pages
      const row = document.createElement('div');
      row.className = 'archive-row';
      row.setAttribute('data-entry-item', '');
      row.setAttribute('data-slug', indexItem.slug);
      row.setAttribute('data-dynamic-item', 'true');
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'archive-title';
      const link = document.createElement('a');
      link.href = href;
      link.textContent = indexItem.title;
      titleDiv.appendChild(link);
      
      const metaDiv = document.createElement('div');
      metaDiv.className = 'archive-meta';
      
      const dateDiv = document.createElement('div');
      dateDiv.className = 'archive-date';
      const dateMd = document.createElement('span');
      dateMd.className = 'archive-date-md';
      dateMd.textContent = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      const dateFull = document.createElement('span');
      dateFull.className = 'archive-date-full';
      dateFull.textContent = date.toISOString().split('T')[0] || '';
      dateDiv.appendChild(dateMd);
      dateDiv.appendChild(dateFull);
      metaDiv.appendChild(dateDiv);
      
      const tag = indexItem.tags?.[0] || '';
      if (tag) {
        const tagDiv = document.createElement('div');
        tagDiv.className = 'archive-tag';
        tagDiv.textContent = `#${tag}`;
        metaDiv.appendChild(tagDiv);
      }
      
      row.appendChild(titleDiv);
      row.appendChild(metaDiv);
      return row;
    } else {
      // Create list-item style card for essay and search pages
      const card = document.createElement('a');
      card.className = 'list-item list-item--link';
      card.href = href;
      card.setAttribute('data-entry-item', '');
      card.setAttribute('data-slug', indexItem.slug);
      card.setAttribute('data-dynamic-item', 'true');
      
      const rowDiv = document.createElement('div');
      rowDiv.className = 'list-item__row';
      
      const flexDiv = document.createElement('div');
      flexDiv.style.display = 'flex';
      flexDiv.style.alignItems = 'center';
      flexDiv.style.gap = '10px';
      
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '随笔';
      
      const title = document.createElement('h2');
      title.className = 'list-item__title';
      title.style.margin = '0';
      title.textContent = indexItem.title;
      
      flexDiv.appendChild(badge);
      flexDiv.appendChild(title);
      rowDiv.appendChild(flexDiv);
      card.appendChild(rowDiv);
      
      if (indexItem.description) {
        const excerpt = document.createElement('p');
        excerpt.className = 'list-item__excerpt';
        excerpt.textContent = indexItem.description;
        card.appendChild(excerpt);
      }
      
      const metaLine = document.createElement('div');
      metaLine.className = 'meta-line meta-line--items';
      
      const dateSpan = document.createElement('span');
      dateSpan.className = 'meta-line__item';
      dateSpan.textContent = date.toISOString().split('T')[0] || '';
      metaLine.appendChild(dateSpan);
      
      if (indexItem.tags.length > 0) {
        const tagsSpan = document.createElement('span');
        tagsSpan.className = 'meta-line__item meta-line__item--tags';
        indexItem.tags.forEach(tag => {
          const tagSpan = document.createElement('span');
          tagSpan.className = 'tag';
          tagSpan.textContent = `#${tag}`;
          tagsSpan.appendChild(tagSpan);
        });
        metaLine.appendChild(tagsSpan);
      }
      
      card.appendChild(metaLine);
      return card;
    }
  };

  const clearDynamicItems = () => {
    // Remove all dynamically created items
    const dynamicItems = document.querySelectorAll('[data-dynamic-item="true"]');
    dynamicItems.forEach(el => el.remove());
    
    // Remove dynamic sections
    const dynamicSections = document.querySelectorAll('[data-dynamic-section="true"]');
    dynamicSections.forEach(el => el.remove());
    
    // Remove dynamic container if it exists
    if (dynamicItemsContainer) {
      dynamicItemsContainer.remove();
      dynamicItemsContainer = null;
    }
    
    // For search page, restore placeholder if needed
    const isSearchPage = !!document.querySelector('[data-search-results-section]');
    if (isSearchPage) {
      const resultsContainer = document.querySelector('[data-search-results-section]');
      const placeholder = document.querySelector('[data-search-placeholder]');
      
      if (resultsContainer && !placeholder) {
        const placeholderDiv = document.createElement('div');
        placeholderDiv.className = 'search-results__placeholder';
        placeholderDiv.setAttribute('data-search-placeholder', '');
        placeholderDiv.innerHTML = `
          <svg class="search-results__icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <p class="search-results__text">输入关键词开始搜索</p>
        `;
        resultsContainer.appendChild(placeholderDiv);
      }
    }
    
    // Reset items array to original
    items = [...originalItems];
  };

  const insertDynamicItems = (matchedIndexItems: IndexItem[]) => {
    clearDynamicItems();
    
    const isArchivePage = !!document.querySelector('[data-entry-section]');
    const isSearchPage = !!document.querySelector('[data-search-results-section]');
    const query = input?.value.trim() || '';
    
    if (isSearchPage) {
      // For search page, insert into search results container
      const resultsContainer = document.querySelector('[data-search-results-section]');
      const placeholder = document.querySelector('[data-search-placeholder]');
      
      if (!resultsContainer) return;
      
      // Hide placeholder when showing results
      if (placeholder) {
        placeholder.remove();
      }
      
      // Show empty state if no results
      if (matchedIndexItems.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'state-panel';
        emptyState.setAttribute('data-dynamic-item', 'true');
        emptyState.innerHTML = `
          <div class="state-panel__icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
              <circle cx="11" cy="11" r="7"/>
              <line x1="16.5" y1="16.5" x2="22" y2="22"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </div>
          <p class="state-panel__title">没有找到相关内容</p>
          <p class="state-panel__hint">试试其他关键词，或切换范围筛选</p>
        `;
        resultsContainer.appendChild(emptyState);
        return;
      }
      
      // Add items directly without year grouping
      for (const item of matchedIndexItems) {
        const el = createDynamicItemElement(item, query);
        resultsContainer.appendChild(el);
        items.push({ el, slug: item.slug });
      }
    } else if (isArchivePage) {
      // For archive page, group by year and insert into existing sections or create new ones
      const yearGroups = new Map<number, IndexItem[]>();
      
      for (const item of matchedIndexItems) {
        const year = item.date ? new Date(item.date).getFullYear() : new Date().getFullYear();
        if (!yearGroups.has(year)) {
          yearGroups.set(year, []);
        }
        yearGroups.get(year)!.push(item);
      }
      
      const sectionsContainer = document.querySelector('[data-entry-section]')?.parentElement;
      if (!sectionsContainer) return;
      
      // Sort years descending
      const sortedYears = Array.from(yearGroups.keys()).sort((a, b) => b - a);
      
      for (const year of sortedYears) {
        const yearItems = yearGroups.get(year)!;
        
        // Try to find existing section for this year
        let section = Array.from(document.querySelectorAll('[data-entry-section]')).find(
          s => s.querySelector('.archive-year')?.textContent === String(year)
        ) as HTMLElement | undefined;
        
        if (!section) {
          // Create new section
          section = document.createElement('section');
          section.setAttribute('data-entry-section', '');
          section.setAttribute('data-dynamic-section', 'true');
          
          const yearHeading = document.createElement('h2');
          yearHeading.className = 'archive-year';
          yearHeading.textContent = String(year);
          section.appendChild(yearHeading);
          
          const list = document.createElement('div');
          list.className = 'archive-list';
          section.appendChild(list);
          
          // Insert in correct position (sorted by year)
          const existingSections = Array.from(document.querySelectorAll('[data-entry-section]'));
          let inserted = false;
          for (const existingSection of existingSections) {
            const existingYear = parseInt(existingSection.querySelector('.archive-year')?.textContent || '0');
            if (year > existingYear) {
              existingSection.parentElement?.insertBefore(section, existingSection);
              inserted = true;
              break;
            }
          }
          if (!inserted) {
            sectionsContainer.appendChild(section);
          }
        }
        
        const list = section.querySelector('.archive-list');
        if (!list) continue;
        
        // Add items to this section
        for (const item of yearItems) {
          const el = createDynamicItemElement(item, query);
          list.appendChild(el);
          items.push({ el, slug: item.slug });
        }
      }
    } else {
      // For essay page, append to the list container
      const listContainer = document.querySelector('.list');
      if (!listContainer) return;
      
      for (const item of matchedIndexItems) {
        const el = createDynamicItemElement(item, query);
        listContainer.appendChild(el);
        items.push({ el, slug: item.slug });
      }
    }
  };

  const syncSections = (hasActiveFilter: boolean) => {
    if (!sections.length) return;
    for (const section of sections) {
      const sectionItems = Array.from(section.querySelectorAll<HTMLElement>('[data-entry-item]'));
      const hasVisible = sectionItems.some((el) => !el.hidden);
      section.hidden = hasActiveFilter && !hasVisible;
    }
  };

  const setPaginationVisible = (visible: boolean) => {
    if (!pagination) return;
    pagination.hidden = !visible;
  };

  let indexHay: Map<string, string> | null = null;
  let indexTagKeys: Map<string, string[]> | null = null;
  let filterRunId = 0;
  let hoverCloseTimer: number | null = null;
  let hoverPreviewActive = false;
  const hoverPreviewMedia = window.matchMedia(HOVER_PREVIEW_MEDIA_QUERY);
  const filterRunner = createDebouncedAsyncRunner(() => applyFilter(), FILTER_DEBOUNCE_MS);

  const isSearchOpen = () => searchRoot?.classList.contains('is-open') ?? false;
  const supportsHoverPreview = () => hoverPreviewMedia.matches;

  const setSearchOpen = (open: boolean) => {
    if (!searchRoot) return;
    searchRoot.classList.toggle('is-open', open);
    toggleBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (input) input.tabIndex = open ? 0 : -1;
  };

  const clearHoverCloseTimer = () => {
    if (hoverCloseTimer === null) return;
    window.clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  };

  const hasSearchValue = () => Boolean(input?.value.trim());

  const isInputFocused = () => document.activeElement === input;

  const closeSearch = (options: { reset?: boolean } = {}) => {
    clearHoverCloseTimer();
    hoverPreviewActive = false;
    if (options.reset) {
      resetSearch();
    }
    setSearchOpen(false);
  };

  const openSearchInteractive = (options: { focusInput?: boolean; preloadIndex?: boolean } = {}) => {
    clearHoverCloseTimer();
    hoverPreviewActive = false;
    setSearchOpen(true);
    if (options.focusInput) {
      window.setTimeout(() => input?.focus(), 0);
    }
    if (options.preloadIndex) {
      void loadIndex();
    }
  };

  const openSearchHoverPreview = () => {
    if (!supportsHoverPreview() || indexLoader.hasFailed()) return;
    clearHoverCloseTimer();
    if (isSearchOpen() && !hoverPreviewActive) return;
    hoverPreviewActive = true;
    setSearchOpen(true);
  };

  const scheduleHoverPreviewClose = () => {
    if (!supportsHoverPreview() || !hoverPreviewActive) return;
    clearHoverCloseTimer();
    hoverCloseTimer = window.setTimeout(() => {
      hoverCloseTimer = null;
      if (!hoverPreviewActive || hasSearchValue() || isInputFocused()) return;
      closeSearch();
    }, HOVER_PREVIEW_CLOSE_DELAY_MS);
  };

  const getStatusPrefix = (query: string, totalMatches: number) => {
    if (query && activeTagLabel) {
      return `标签 #${activeTagLabel} 下共命中 ${totalMatches} 条`;
    }
    if (query) {
      return totalMatches === 0 ? `未找到与「${query}」相关的内容` : `找到 ${totalMatches} 篇相关文章`;
    }
    return '';
  };

  const updateStatusForMatches = (query: string, totalMatches: number) => {
    const prefix = getStatusPrefix(query, totalMatches);
    
    // For standalone search page, use direct status update
    const updateSearchStatus = (window as any).__updateSearchStatus;
    if (updateSearchStatus && isStandalonePage) {
      if (!prefix) {
        updateSearchStatus('');
        return;
      }
      if (totalMatches === 0) {
        updateSearchStatus(`未找到与「${query}」相关的内容`);
        return;
      }
      updateSearchStatus(query && !activeTagKey ? `找到 ${totalMatches} 篇相关文章` : prefix);
      return;
    }
    
    // For other pages, use the original setStatus method
    if (!prefix) {
      setStatus('');
      return;
    }

    if (totalMatches === 0) {
      setStatus(`未找到与「${query}」相关的内容`);
      return;
    }
    setStatus(query && !activeTagKey ? `找到 ${totalMatches} 篇相关文章` : prefix);
  };

  const scheduleApplyFilter = (delay = FILTER_DEBOUNCE_MS) => {
    filterRunner.schedule(delay);
  };

  const setDegradedMode = () => {
    if (input) {
      input.placeholder = '索引加载失败';
      input.disabled = true;
      input.setAttribute('aria-disabled', 'true');
    }
    if (toggleBtn) {
      toggleBtn.disabled = true;
      toggleBtn.setAttribute('aria-disabled', 'true');
    }
    setSearchOpen(true);
    showAllItems();
    syncSections(false);
    setStatus('索引加载失败，已禁用搜索');
  };

  const indexLoader = createJsonIndexLoader<IndexItem>({
    url: indexUrl,
    shouldBypassCache: shouldBypassIndexCache,
    onPending: () => {
      setStatus('正在加载索引...', { visible: false });
    },
    onResolved: (data) => {
      indexHay = new Map(
        data.map((item) => [
          item.slug,
          buildSearchHaystack([item.title, item.description, item.tags, item.text])
        ])
      );
      indexTagKeys = new Map(data.map((item) => [item.slug, getTagKeys(item.tags)]));
      setStatus('');
    },
    onRejected: () => {
      setDegradedMode();
    }
  });

  const loadIndex = () => indexLoader.load();

  const applyFilter = async () => {
    filterRunner.cancel();

    const runId = ++filterRunId;
    const rawQuery = (input?.value || '').trim();
    const queryTerms = tokenizeSearchQuery(rawQuery);

    if (queryTerms.length === 0) {
      clearDynamicItems();
      showAllItems();
      syncSections(false);
      setPaginationVisible(true);
      setStatus('');
      
      // Show initial state on search page
      const isSearchPage = !!document.querySelector('[data-search-results-section]');
      if (isSearchPage) {
        const initialState = document.getElementById('initial-state');
        if (initialState) {
          initialState.style.display = '';
        }
      }
      return;
    }

    const index = await loadIndex();
    if (runId !== filterRunId) return;
    if (!index || !indexHay || !indexTagKeys) return;

    // Get active filter from search page if available
    const getActiveFilter = (window as any).__searchPageFilter;
    const pageFilter = getActiveFilter ? getActiveFilter() : 'all';

    const matchedItems: IndexItem[] = [];
    const matchedSlugs = new Set<string>();
    
    for (const item of index) {
      const hay = indexHay.get(item.slug) || '';
      if (!queryTerms.every((term) => hay.includes(term))) continue;

      if (activeTagKey) {
        const normalizedTagKeys = indexTagKeys.get(item.slug) ?? [];
        if (!normalizedTagKeys.includes(activeTagKey)) continue;
      }

      // Apply page filter if on search page
      if (pageFilter !== 'all' && item.filter && item.filter !== pageFilter) {
        continue;
      }

      matchedSlugs.add(item.slug);
      matchedItems.push(item);
    }

    // Hide all original items
    for (const item of originalItems) {
      setItemVisible(item, false);
    }

    // Insert all matched items dynamically
    insertDynamicItems(matchedItems);

    syncSections(true);
    setPaginationVisible(false);
    updateStatusForMatches(rawQuery, matchedSlugs.size);
  };

  const removePickerParam = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('picker') !== 'tag') return;
    url.searchParams.delete('picker');
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === next) return;
    window.history.replaceState({}, '', next);
  };

  const setTagDialogExpanded = (expanded: boolean) => {
    tagTrigger?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  const finalizeTagDialogClose = () => {
    if (tagDialog?.open) return;
    setTagDialogExpanded(false);
    removePickerParam();
  };

  const openTagDialog = (options: { focusTitle?: boolean } = {}) => {
    if (!tagDialog || tagDialog.open) return;
    if (typeof tagDialog.showModal === 'function') {
      tagDialog.showModal();
      if (options.focusTitle && tagDialogTitle) {
        window.requestAnimationFrame(() => {
          tagDialogTitle.focus({ preventScroll: true });
        });
      }
      setTagDialogExpanded(true);
      return;
    }
    tagDialog.setAttribute('open', '');
    if (options.focusTitle && tagDialogTitle) {
      window.requestAnimationFrame(() => {
        tagDialogTitle.focus({ preventScroll: true });
      });
    }
    setTagDialogExpanded(true);
  };

  const closeTagDialog = () => {
    if (!tagDialog) return;
    if (typeof tagDialog.close === 'function') {
      tagDialog.close();
      return;
    }
    tagDialog.removeAttribute('open');
    finalizeTagDialogClose();
  };

  const resetSearch = () => {
    if (input) input.value = '';
    clearDynamicItems();
    showAllItems();
    syncSections(false);
    setPaginationVisible(true);
    setStatus('');
  };

  syncLegacyTagParam();
  
  if (isStandalonePage) {
    // For standalone search page, always keep search open and load index immediately
    setSearchOpen(true);
    void loadIndex();
  } else {
    setSearchOpen(false);
  }
  
  setTagDialogExpanded(false);

  if (!isStandalonePage) {
    toggleBtn?.addEventListener('click', () => {
      if (hoverPreviewActive) {
        openSearchInteractive({ focusInput: true, preloadIndex: true });
        return;
      }
      const next = !isSearchOpen();
      if (next) {
        openSearchInteractive({ focusInput: true, preloadIndex: true });
        return;
      }
      closeSearch({ reset: true });
    });

    input?.addEventListener('focus', () => {
      openSearchInteractive({ preloadIndex: true });
    });
  } else {
    // For standalone page, just load index on focus
    input?.addEventListener('focus', () => {
      void loadIndex();
    });
  }

  input?.addEventListener('input', () => {
    scheduleApplyFilter();
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSearch({ reset: true });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void applyFilter();
    }
  });

  if (!isStandalonePage) {
    const handleHoverPreviewEnter = () => {
      openSearchHoverPreview();
    };

    const handleHoverPreviewLeave = (event: PointerEvent) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && searchRoot?.contains(nextTarget)) return;
      scheduleHoverPreviewClose();
    };

    searchRoot?.addEventListener('pointerenter', handleHoverPreviewEnter);
    searchRoot?.addEventListener('pointerleave', handleHoverPreviewLeave);

    document.addEventListener('click', (event) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!isSearchOpen()) return;
      if (indexLoader.hasFailed()) return;
      if (searchRoot?.contains(target)) return;
      if (hasSearchValue()) return;
      closeSearch();
    });
  }

  tagTrigger?.addEventListener('click', (event) => {
    event.preventDefault();
    openTagDialog();
  });

  tagCloseBtn?.addEventListener('click', () => {
    closeTagDialog();
  });

  tagDialog?.addEventListener('cancel', () => {
    window.requestAnimationFrame(() => {
      finalizeTagDialogClose();
    });
  });

  tagDialog?.addEventListener('close', () => {
    finalizeTagDialogClose();
  });

  tagDialog?.addEventListener('click', (event) => {
    if (event.target === tagDialog) {
      closeTagDialog();
    }
  });

  if (new URLSearchParams(window.location.search).get('picker') === 'tag') {
    if (tagDialog) {
      openTagDialog({ focusTitle: true });
    }
    removePickerParam();
  }
}
