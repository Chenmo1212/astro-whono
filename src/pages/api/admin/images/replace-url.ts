import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
import { replaceImageUrlsWithProvider } from '../../../../lib/provider-url-replacer';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // 只在开发环境下可用
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
    const body = await request.json();
    const { markdownPath, imagePath, providerUrl } = body;

    // 验证参数
    if (!markdownPath || typeof markdownPath !== 'string') {
      return new Response(
        JSON.stringify({
          ok: false,
          errors: ['Invalid or missing markdownPath parameter']
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (!imagePath || typeof imagePath !== 'string') {
      return new Response(
        JSON.stringify({
          ok: false,
          errors: ['Invalid or missing imagePath parameter']
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (!providerUrl || typeof providerUrl !== 'string') {
      return new Response(
        JSON.stringify({
          ok: false,
          errors: ['Invalid or missing providerUrl parameter']
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 读取 Markdown 文件
    let content: string;
    try {
      content = await readFile(markdownPath, 'utf-8');
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          errors: [`Failed to read markdown file: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 创建图片映射并替换 URL
    const imageMap = new Map<string, string>();
    imageMap.set(imagePath, providerUrl);
    const updatedContent = replaceImageUrlsWithProvider(content, imageMap);

    // 检查是否有变化
    if (updatedContent === content) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            replaced: false,
            message: 'No changes needed - image path not found in markdown file'
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 写回文件
    try {
      await writeFile(markdownPath, updatedContent, 'utf-8');
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          errors: [`Failed to write markdown file: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          replaced: true,
          message: 'Successfully replaced image URL in markdown file'
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
        errors: [`URL replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

// Made with Bob