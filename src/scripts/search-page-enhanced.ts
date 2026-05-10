// Enhanced search page functionality for filter tabs, hot tags, and recent items

const input = document.querySelector<HTMLInputElement>('[data-entry-search-input]');
const clearBtn = document.getElementById('clear-btn');
const filterTabs = document.querySelectorAll<HTMLButtonElement>('.filter-tab');
const hotTags = document.querySelectorAll<HTMLButtonElement>('.hot-tag');
const recentItems = document.querySelectorAll<HTMLElement>('.recent-item');
const initialState = document.getElementById('initial-state');
const resultsContainer = document.getElementById('results-container');
const statusEl = document.getElementById('search-status');

let activeFilter = 'all';

// Update status text directly
const updateStatus = (text: string) => {
  if (statusEl) {
    statusEl.textContent = text;
  }
};

// Export for use by entry-search
(window as any).__updateSearchStatus = updateStatus;

// Clear button visibility
const updateClearButton = () => {
  if (!input || !clearBtn) return;
  const hasValue = input.value.trim().length > 0;
  clearBtn.classList.toggle('visible', hasValue);
};

// Clear button click
clearBtn?.addEventListener('click', () => {
  if (!input) return;
  input.value = '';
  updateClearButton();
  input.focus();
  
  // Clear status
  updateStatus('');
  
  // Show initial state when clearing
  if (initialState) {
    initialState.style.display = '';
  }
  
  // Clear results
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }
  
  // Trigger input event to update search
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

// Input changes
input?.addEventListener('input', () => {
  updateClearButton();
  
  // Show/hide initial state based on input
  const hasValue = input.value.trim().length > 0;
  if (initialState) {
    initialState.style.display = hasValue ? 'none' : '';
  }
  
  // Clear status when input is empty
  if (!hasValue) {
    updateStatus('');
  }
  
  // Hide results container placeholder when typing
  if (hasValue && resultsContainer) {
    const placeholder = resultsContainer.querySelector('[data-search-placeholder]');
    if (placeholder) {
      placeholder.remove();
    }
  }
});

// Filter tabs
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Update active state
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Store active filter
    activeFilter = tab.dataset.filter || 'all';
    
    // Trigger search update if there's a query
    if (input?.value.trim()) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
});

// Hot tags
hotTags.forEach(tag => {
  tag.addEventListener('click', () => {
    if (!input) return;
    const tagText = tag.dataset.tag || tag.textContent?.trim() || '';
    input.value = tagText;
    updateClearButton();
    input.focus();
    // Trigger search
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

// Recent items
recentItems.forEach(item => {
  item.addEventListener('click', () => {
    if (!input) return;
    const title = item.dataset.title || item.querySelector('.recent-item__title')?.textContent?.trim() || '';
    input.value = title;
    updateClearButton();
    input.focus();
    // Trigger search
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

// Export active filter for use by entry-search.ts
(window as any).__searchPageFilter = () => activeFilter;

// Initialize
updateClearButton();

// Made with Bob
