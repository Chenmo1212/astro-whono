import type { AdminContentValidationIssue } from './content-entry-contract';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export const normalizeOptionalText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const createAdminContentValidationIssue = (
  path: string,
  message: string
): AdminContentValidationIssue => ({
  path,
  message
});
