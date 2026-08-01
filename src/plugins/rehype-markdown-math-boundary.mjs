const MARKDOWN_MATH_BOUNDARY_NODE_TYPE = 'astroWhonoMarkdownMath';
const MATH_TRIGGER_CLASSES = new Set(['language-math', 'math-display', 'math-inline']);

const getClassNames = (node) => {
  const className = node.properties?.className;
  if (Array.isArray(className)) return className.map(String);
  if (typeof className === 'string') return className.split(/\s+/).filter(Boolean);
  return [];
};

const setClassNames = (node, classNames) => {
  if (!node.properties) node.properties = {};
  if (classNames.length > 0) {
    node.properties.className = classNames;
    return;
  }
  delete node.properties.className;
};

const textContent = (node) =>
  (node.children ?? [])
    .map((child) => {
      if (child.type === 'text') return child.value;
      if (child.children) return textContent(child);
      return '';
    })
    .join('');

const mapChildren = (node, mapper) => {
  if (Array.isArray(node.children)) {
    node.children = node.children.map((child) => mapper(child));
  }
  return node;
};

const createTrustedMathNode = (node, code, displayMode) => ({
  type: MARKDOWN_MATH_BOUNDARY_NODE_TYPE,
  value: textContent(code),
  displayMode,
  position: node.position
});

const restoreTrustedMathNode = (node) => {
  if (node.displayMode) {
    return {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-math', 'math-display'] },
          children: [{ type: 'text', value: node.value }],
          position: node.position
        }
      ],
      position: node.position
    };
  }

  return {
    type: 'element',
    tagName: 'code',
    properties: { className: ['language-math', 'math-inline'] },
    children: [{ type: 'text', value: node.value }],
    position: node.position
  };
};

export const markdownMathRawOptions = {
  passThrough: [MARKDOWN_MATH_BOUNDARY_NODE_TYPE]
};

export const rehypeProtectMarkdownMath = () => (tree) => {
  const protectNode = (node) => {
    if (node.type !== 'element') return mapChildren(node, protectNode);

    if (node.tagName === 'pre') {
      const code = node.children?.find((child) => child.type === 'element' && child.tagName === 'code');
      if (code && getClassNames(code).includes('math-display')) {
        return createTrustedMathNode(node, code, true);
      }
    }

    if (node.tagName === 'code' && getClassNames(node).includes('math-inline')) {
      return createTrustedMathNode(node, node, false);
    }

    return mapChildren(node, protectNode);
  };

  tree.children = tree.children.map((child) => protectNode(child));
};

export const rehypeRestoreMarkdownMathBoundary = () => (tree) => {
  const restoreNode = (node) => {
    if (node.type === MARKDOWN_MATH_BOUNDARY_NODE_TYPE) {
      return restoreTrustedMathNode(node);
    }

    if (node.type === 'element') {
      const classNames = getClassNames(node).filter((className) => !MATH_TRIGGER_CLASSES.has(className));
      setClassNames(node, classNames);
    }

    return mapChildren(node, restoreNode);
  };

  tree.children = tree.children.map((child) => restoreNode(child));
};
