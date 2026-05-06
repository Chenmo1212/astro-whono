import { visit } from 'unist-util-visit';

const CALLOUT_TYPES = new Set(['note', 'tip', 'info', 'warning']);

const getText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) {
    return node.children.map(getText).join('');
  }
  return '';
};

const restoreDirectiveText = (parent, index, node) => {
  if (!parent || typeof index !== 'number' || !node) return;
  parent.children.splice(index, 1, {
    type: 'text',
    value: `:${node.name || ''}`
  });
};

export default function remarkCallout() {
  return (tree) => {
    visit(tree, (node) => {
      return node.type === 'textDirective' || node.type === 'leafDirective' || node.type === 'containerDirective';
    }, (node, index, parent) => {
      if (node.type !== 'containerDirective') {
        restoreDirectiveText(parent, index, node);
        return;
      }

      if (!CALLOUT_TYPES.has(node.name)) {
        restoreDirectiveText(parent, index, node);
        return;
      }

      if (!node.data) node.data = {};
      node.data.hName = 'div';
      node.data.hProperties = {
        ...(node.data.hProperties || {}),
        className: ['callout', node.name]
      };

      if (!Array.isArray(node.children) || node.children.length === 0) return;

      const labelIndex = node.children.findIndex((child) => {
        return child?.type === 'paragraph' && child?.data?.directiveLabel === true;
      });

      if (labelIndex === -1) return;

      const labelNode = node.children[labelIndex];
      const labelText = getText(labelNode).trim();
      if (!labelText) {
        node.children.splice(labelIndex, 1);
        return;
      }

      if (!labelNode.data) labelNode.data = {};
      labelNode.data.hName = 'p';
      labelNode.data.hProperties = {
        ...(labelNode.data.hProperties || {}),
        className: ['callout-title']
      };
    });
  };
}
