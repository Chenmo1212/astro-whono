const MORE_REGEX = /<!--\s*more\s*-->/i;

export type DerivedMarkdownText = {
  plainText: string;
  excerptText: string;
  excerptMarkdown: string;
};

export function splitMore(md: string): string {
  if (!md) return '';
  const match = md.match(MORE_REGEX);
  if (!match) return md;
  const index = match.index ?? -1;
  return index >= 0 ? md.slice(0, index) : md;
}

export function cleanMarkdownToText(md: string): string {
  if (!md) return '';
  let text = md;

  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/~~~[\s\S]*?~~~/g, ' ');
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, ' ');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/`[^`]*`/g, ' ');

  text = text.replace(/^\s*#{1,6}\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[\.\)]\s+/gm, '');

  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\r?\n+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

export function truncateText(text: string, maxChars = 120): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars))}…`;
}

/**
 * Convert simple markdown to HTML for excerpts
 * Handles bold, italic, and basic inline formatting
 * Note: Nested formatting (e.g., bold within italic) may not render correctly
 */
export function excerptMarkdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Links - with URL validation to prevent XSS
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const trimmedUrl = url.trim();
    // Block dangerous protocols
    if (trimmedUrl.match(/^(javascript|data|vbscript):/i)) {
      return text; // Return just the text without creating a link
    }
    return `<a href="${trimmedUrl}">${text}</a>`;
  });
  
  // Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  return html;
}

export function deriveMarkdownText(md: string): DerivedMarkdownText {
  if (!md) {
    return {
      plainText: '',
      excerptText: '',
      excerptMarkdown: ''
    };
  }

  const excerptMarkdown = splitMore(md);
  const plainText = cleanMarkdownToText(md);

  return {
    plainText,
    excerptText: excerptMarkdown === md ? plainText : cleanMarkdownToText(excerptMarkdown),
    excerptMarkdown
  };
}
