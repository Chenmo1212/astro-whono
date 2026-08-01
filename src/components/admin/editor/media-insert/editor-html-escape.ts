export const normalizeInlineText = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

export const escapeHtmlText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const escapeHtmlAttribute = (value: string): string =>
  escapeHtmlText(value).replace(/"/g, '&quot;');
