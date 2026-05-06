/**
 * Shared slug rules for essay public URLs.
 *
 * Both `content.config.ts` (schema validation) and `content.ts` (build-time
 * assertions) depend on this module so the "what is a valid public slug"
 * contract is defined in exactly one place.
 */

/**
 * A valid public slug must be lowercase kebab-case or contain Unicode characters (e.g., Chinese).
 * Supports:
 * - Lowercase ASCII letters and numbers with hyphens (e.g., "my-post-123")
 * - Unicode characters including Chinese, Japanese, Korean, etc. (e.g., "在夏天，认真做一个融化的雪人")
 * - Mixed format with Unicode and ASCII (e.g., "中文-post-2024")
 */
export const ESSAY_PUBLIC_SLUG_RE = /^[\p{L}\p{N}\p{M}\p{Pc}\p{Pd}\p{Po}]+$/u;

/**
 * Slug values that collide with sibling static routes under `/archive/` or
 * `/essay/`.  Since essay slugs are always single-segment (enforced by schema
 * + `[slug]` route), only exact matches need to be checked.
 */
export const RESERVED_ESSAY_SLUGS: ReadonlySet<string> = new Set([
  'page',
  'tag',
  'rss.xml'
]);

/**
 * Convert a potentially multi-segment `entry.id` (e.g. `2024/my-post`) into a
 * single-segment slug suitable for the `[slug]` route.
 */
export const flattenEntryIdToSlug = (entryId: string): string =>
  entryId.replaceAll('/', '-');
