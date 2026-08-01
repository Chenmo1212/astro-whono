export type BitPublicOrderItem = {
  id: string;
  date: Date;
  draft: boolean;
};

type BitRoutingOrderItem = Pick<BitPublicOrderItem, 'id' | 'date'>;

export const getBitAnchorId = (key: string) => `bit-${key}`;

export const getBitsPagePath = (page: number) => (page <= 1 ? '/bits/' : `/bits/page/${page}/`);

export const compareBitsForRouting = <T extends BitRoutingOrderItem>(left: T, right: T): number => {
  const dateOrder = right.date.valueOf() - left.date.valueOf();
  if (dateOrder !== 0) return dateOrder;
  return left.id.localeCompare(right.id, 'en');
};

export const orderBitsForRouting = <T extends BitRoutingOrderItem>(items: readonly T[]): T[] =>
  items.slice().sort(compareBitsForRouting);

export const orderPublishedBitsForRouting = <T extends BitPublicOrderItem>(items: readonly T[]): T[] =>
  orderBitsForRouting(items.filter((item) => item.draft !== true));

export const buildPublishedBitsHrefMap = (
  items: readonly BitPublicOrderItem[],
  pageSize: number
): Map<string, string> => {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`Invalid bits page size: ${pageSize}`);
  }

  const hrefById = new Map<string, string>();
  orderPublishedBitsForRouting(items).forEach((item, index) => {
    const page = Math.floor(index / pageSize) + 1;
    hrefById.set(item.id, `${getBitsPagePath(page)}#${getBitAnchorId(item.id)}`);
  });
  return hrefById;
};
