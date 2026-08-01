import { BRAND_SVG_ICON_BODIES, type BrandSvgIconName } from './brand-icon-bodies';
import type { ResolvedSocialItem, SiteSocialIconKey } from './theme-settings';

const ABOUT_CONTACT_LINKS_PLACEHOLDER_RE =
  /<div(?=[^>]*\sdata-about-contact-links(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)[^>]*><\/div>/g;

const LUCIDE_CONTACT_ICON_BODIES = {
  email: [
    '<rect width="20" height="16" x="2" y="4" rx="2"/>',
    '<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'
  ].join(''),
  website: [
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>',
    '<path d="M2 12h20"/>'
  ].join('')
} as const satisfies Record<Extract<SiteSocialIconKey, 'email' | 'website'>, string>;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatExternalLabel = (href: string): string => {
  try {
    const parsed = new URL(href);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
    return path || parsed.hostname;
  } catch {
    return href;
  }
};

const getContactText = (item: ResolvedSocialItem): string =>
  item.id === 'email' ? item.href.replace(/^mailto:/i, '') : formatExternalLabel(item.href);

const renderContactIconHtml = (iconKey: SiteSocialIconKey): string => {
  if (iconKey === 'email' || iconKey === 'website') {
    return [
      '<svg class="contact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"',
      ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
      ' aria-hidden="true" focusable="false">',
      LUCIDE_CONTACT_ICON_BODIES[iconKey],
      '</svg>'
    ].join('');
  }

  const iconBody = BRAND_SVG_ICON_BODIES[iconKey as BrandSvgIconName];
  if (!iconBody) return '';

  return [
    '<svg class="contact-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    iconBody,
    '</svg>'
  ].join('');
};

export const renderAboutContactLinksHtml = (
  socialItems: readonly ResolvedSocialItem[]
): string => {
  const items = socialItems.filter((item) => item.visible);
  if (items.length === 0) return '';

  const listItems = items.map((item) => [
    '<li>',
    '<span class="contact-link-head" aria-hidden="true">',
    renderContactIconHtml(item.iconKey),
    '</span>',
    `<a href="${escapeHtml(item.href)}">${escapeHtml(getContactText(item))}</a>`,
    '</li>'
  ].join(''));

  return [
    '<div class="contact-block" aria-label="联系方式">',
    '<ul class="contact-list">',
    ...listItems,
    '</ul>',
    '</div>'
  ].join('');
};

export const replaceAboutContactLinksPlaceholderHtml = (
  html: string,
  socialItems: readonly ResolvedSocialItem[]
): string => html.replace(ABOUT_CONTACT_LINKS_PLACEHOLDER_RE, () => renderAboutContactLinksHtml(socialItems));
