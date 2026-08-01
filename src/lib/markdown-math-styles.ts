import katexStylesheetHref from 'katex/dist/katex.min.css?url';

export const MARKDOWN_MATH_STYLESHEET_ID = 'astro-whono-katex-stylesheet';
export const MARKDOWN_MATH_STYLESHEET_DATA_ATTR = 'data-astro-whono-katex';
export const MARKDOWN_MATH_STYLESHEET_HREF = katexStylesheetHref;

export const ensureMarkdownMathStylesheet = (): HTMLLinkElement | null => {
  if (typeof document === 'undefined') return null;

  const existingById = document.getElementById(MARKDOWN_MATH_STYLESHEET_ID);
  if (existingById instanceof HTMLLinkElement) return existingById;

  const existingByAttr = document.querySelector<HTMLLinkElement>(
    `link[${MARKDOWN_MATH_STYLESHEET_DATA_ATTR}]`
  );
  if (existingByAttr) return existingByAttr;

  const link = document.createElement('link');
  link.id = MARKDOWN_MATH_STYLESHEET_ID;
  link.rel = 'stylesheet';
  link.href = MARKDOWN_MATH_STYLESHEET_HREF;
  link.setAttribute(MARKDOWN_MATH_STYLESHEET_DATA_ATTR, 'true');
  document.head.append(link);
  return link;
};
