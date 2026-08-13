import type { APIRoute } from 'astro';
import {
  AdminImageError,
  getAdminImageListRequest
} from '../../../../lib/admin-console/image-params';
import { listAdminImageItems } from '../../../../lib/admin-console/image-shared';
import {
  createAdminImageCloudError,
  AdminImageUploadError,
  logAdminImageCloudError,
  toAdminImageErrorPayload
} from '../../../../lib/admin-console/image-upload-error';
import { isAdminImageCloudStorageEnabled } from '../../../../lib/admin-console/image-cloud-storage';

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
    if (error instanceof AdminImageUploadError) {
      logAdminImageCloudError('list', error);
      return new Response(JSON.stringify(toAdminImageErrorPayload(error), null, 2), {
        status: error.status,
        headers: JSON_HEADERS
      });
    }
    if (error instanceof AdminImageError) {
      return new Response(JSON.stringify({ ok: false, errors: [error.message] }, null, 2), {
        status: error.status,
        headers: JSON_HEADERS
      });
    }
    const message = error instanceof Error ? error.message : '图片列表读取失败';
    if (isAdminImageCloudStorageEnabled()) {
      const cloudError = createAdminImageCloudError('cloud_unknown', 'failed_known', error);
      logAdminImageCloudError('list', cloudError);
      return new Response(JSON.stringify(toAdminImageErrorPayload(cloudError), null, 2), {
        status: cloudError.status,
        headers: JSON_HEADERS
      });
    }
    return new Response(JSON.stringify({ ok: false, errors: [message] }, null, 2), {
      status: 500,
      headers: JSON_HEADERS
    });
  }
};
