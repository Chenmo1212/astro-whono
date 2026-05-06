import { visit } from 'unist-util-visit';
import path from 'node:path';

/**
 * Remark plugin to transform relative image paths in content collections
 * to absolute paths that work in the built site.
 * 
 * This allows markdown files to use relative paths (e.g., "./image.png")
 * which work in markdown preview, while transforming them to absolute paths
 * (e.g., "/images/essay/slug/image.png") for the built site.
 */
export default function remarkRelativeImages() {
  return (tree, file) => {
    // Extract collection and slug from file path
    // Expected path format: src/content/{collection}/{slug}.md
    const filePath = file.history[0];
    if (!filePath) return;

    const match = filePath.match(/src\/content\/([^/]+)\/([^/]+)\.md$/);
    if (!match) return;

    const [, collection, slug] = match;

    visit(tree, ['image', 'html'], (node) => {
      if (node.type === 'image') {
        // Handle markdown images: ![alt](path)
        if (node.url && !node.url.startsWith('http') && !node.url.startsWith('/')) {
          // Transform relative path to absolute
          // e.g., "in-summer.assets/image.png" -> "/images/essay/in-summer/image.png"
          const imagePath = node.url.replace(/^\.\//, '').replace(`${slug}.assets/`, '');
          node.url = `/images/${collection}/${slug}/${imagePath}`;
        }
      } else if (node.type === 'html') {
        // Handle HTML img tags: <img src="path" />
        const imgRegex = /<img\s+([^>]*\s)?src=["']([^"']+)["']([^>]*)>/gi;
        node.value = node.value.replace(imgRegex, (match, before = '', src, after = '') => {
          if (!src.startsWith('http') && !src.startsWith('/')) {
            const imagePath = src.replace(/^\.\//, '').replace(`${slug}.assets/`, '');
            const newSrc = `/images/${collection}/${slug}/${imagePath}`;
            return `<img ${before}src="${newSrc}"${after}>`;
          }
          return match;
        });
      }
    });
  };
}

// Made with Bob
