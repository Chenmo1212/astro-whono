export const applyMemoHeadingNumbers = (content: ParentNode | null): void => {
  if (!content) return;

  let count = 0;
  content.querySelectorAll('h2, h3').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;

    if (node.tagName === 'H2') {
      count = 0;
      node.removeAttribute('data-num');
      return;
    }

    if (node.tagName === 'H3') {
      count += 1;
      node.dataset.num = String(count);
    }
  });
};
