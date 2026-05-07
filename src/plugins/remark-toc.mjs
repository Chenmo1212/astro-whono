import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import GithubSlugger from 'github-slugger';

/**
 * Remark plugin to extract table of contents from markdown headings
 * Adds TOC data to vfile.data for use in Astro components
 */
export default function remarkToc() {
  return (tree, file) => {
    const slugger = new GithubSlugger();
    const toc = [];
    
    visit(tree, 'heading', (node) => {
      // Only include h2 and h3 headings in TOC
      if (node.depth === 2 || node.depth === 3) {
        const text = toString(node);
        const slug = slugger.slug(text);
        
        toc.push({
          depth: node.depth,
          text: text,
          slug: slug
        });
      }
    });
    
    // Store TOC in file data so it can be accessed in Astro
    file.data.astro = file.data.astro || {};
    file.data.astro.frontmatter = file.data.astro.frontmatter || {};
    file.data.astro.frontmatter.toc = toc;
  };
}


