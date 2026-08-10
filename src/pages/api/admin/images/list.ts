import type { APIRoute } from 'astro';
import {
  AdminImageError,
  getAdminImageListRequest
} from '../../../../lib/admin-console/image-params';
import { listAdminImageItems } from '../../../../lib/admin-console/image-shared';
import { AdminImageUploadError } from '../../../../lib/admin-console/image-upload-error';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
} as const;

const DEV_ONLY_NOT_FOUND_RESPONSE = new Response('Not Found', { status: 404 });

export const GET: APIRoute = async ({ url }) => {
  if (!import.meta.env.DEV && !process.env.VITEST) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  try {
    const request = getAdminImageListRequest(url.searchParams);
    const result = await listAdminImageItems(request);
    return new Response(JSON.stringify({ ok: true, result }, null, 2), {
      headers: JSON_HEADERS
    });
  } catch (error) {
    const status = error instanceof AdminImageError || error instanceof AdminImageUploadError
      ? error.status
      : 500;
    const message = error instanceof Error ? error.message : '图片列表读取失败';
    return new Response(JSON.stringify({ ok: false, errors: [message] }, null, 2), {
      status,
      headers: JSON_HEADERS
    });
  }
};
