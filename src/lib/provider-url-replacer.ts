/**
 * 替换markdown内容中的本地图片URL为Provider CDN URL
 * @param content - markdown内容
 * @param imageMap - 图片路径到Provider URL的映射
 * @returns 替换后的内容
 */
export const replaceImageUrlsWithProvider = (
  content: string,
  imageMap: Map<string, string>
): string => {
  let result = content;

  // 遍历所有映射，进行替换
  for (const [localPath, providerUrl] of imageMap.entries()) {
    // 转义特殊字符用于正则表达式
    const escapedPath = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 匹配markdown图片语法: ![alt](path) 或 ![alt](path "title")
    const markdownRegex = new RegExp(
      `!\\[([^\\]]*)\\]\\(${escapedPath}(?:\\s+"[^"]*")?\\)`,
      'g'
    );
    result = result.replace(markdownRegex, `![$1](${providerUrl})`);

    // 匹配HTML img标签: <img src="path" /> 或 <img src="path" alt="..." />
    // 支持单引号和双引号
    const htmlRegex = new RegExp(
      `<img\\s+([^>]*?)src=["']${escapedPath}["']([^>]*?)(/?)>`,
      'gi'
    );
    result = result.replace(htmlRegex, `<img $1src="${providerUrl}"$2$3>`);
  }

  return result;
};

/**
 * 从图片列表构建URL映射
 * @param images - 包含Provider Url的图片列表
 * @returns 路径到Provider URL的映射
 */
export const buildProviderUrlMap = (
  images: Array<{ path: string; providerUrl: string | null }>
): Map<string, string> => {
  const map = new Map<string, string>();

  // 只包含已上传的图片（providerUrl不为null）
  for (const image of images) {
    if (image.providerUrl) {
      map.set(image.path, image.providerUrl);
    }
  }

  return map;
};