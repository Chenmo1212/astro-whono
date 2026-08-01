export const getFieldIssueId = (scope: string, path: string): string =>
  `${scope}-${path.replace(/[^a-zA-Z0-9_-]+/g, '-')}-error`;

export const getFieldDescribedBy = (
  scope: string,
  path: string,
  issue: string,
  extraIds: readonly string[] = []
): string | undefined => {
  const ids = [...extraIds];
  if (issue) ids.push(getFieldIssueId(scope, path));
  return ids.length > 0 ? ids.join(' ') : undefined;
};
