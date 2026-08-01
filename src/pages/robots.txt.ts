import type { APIRoute } from 'astro';
import { hasSiteUrl, siteUrl } from '../../site.config.mjs';

export const GET: APIRoute = () => {
  const lines = ['User-agent: *', 'Allow: /'];

  if (hasSiteUrl) {
    const basePath = import.meta.env.BASE_URL.replace(/\/+$/, '');
    // 直接拼接（siteUrl 无尾随斜杠）：保留 SITE_URL 自带的路径段，new URL 的根绝对路径会把它剥掉。
    lines.push(`Sitemap: ${siteUrl}${basePath}/sitemap-index.xml`);
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
};
