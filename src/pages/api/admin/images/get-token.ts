import type { APIRoute } from 'astro';
import { getQiniuConfig, isQiniuConfigured } from '../../../../lib/qiniu-config';
import qiniu from 'qiniu';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // Only available in development environment
  if (import.meta.env.PROD) {
    return new Response(
      JSON.stringify({
        ok: false,
        errors: ['This API is only available in development mode']
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    if (!isQiniuConfigured()) {
      return new Response(
        JSON.stringify({
          ok: false,
          errors: ['Qiniu configuration is not completely configured']
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const config = getQiniuConfig();
    const body = await request.json();
    const { fileName } = body;

    if (!fileName || typeof fileName !== 'string') {
      return new Response(
        JSON.stringify({
          ok: false,
          errors: ['Invalid or missing fileName parameter']
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
    const putPolicy = new qiniu.rs.PutPolicy({ 
      scope: config.bucket,
      expires: 3600 // 1 hour
    });
    const uploadToken = putPolicy.uploadToken(mac);

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          uploadToken,
          domain: config.domain,
          key: fileName
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        errors: [`Failed to generate upload token: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};