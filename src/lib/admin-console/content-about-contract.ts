import type { AdminContentValidationIssue } from './content-entry-contract';

export type AdminAboutEditorValues = Record<string, never>;

export type AdminAboutEditorPayload = {
  collection: 'about';
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  writable: true;
  readonlyReason: null;
  bodyText: string;
  values: AdminAboutEditorValues;
};

export type AdminAboutWritePlan = {
  issues: AdminContentValidationIssue[];
  changedFields: string[];
  patches: [];
  bodyText?: string;
};

type AdminAboutPayloadSourceState = {
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  bodyText: string;
};

type AdminAboutWriteSourceState = {
  bodyText: string;
};

const ABOUT_FIELD_LABELS: Readonly<Record<string, string>> = {
  body: '正文'
};

export const createAdminAboutEditorValues = (): AdminAboutEditorValues => ({});

export const buildAdminAboutWritePlan = (
  state: AdminAboutWriteSourceState,
  bodyInput?: string
): AdminAboutWritePlan => {
  const changedFields: string[] = [];
  if (bodyInput !== undefined && bodyInput !== state.bodyText) {
    changedFields.push('body');
  }

  return {
    issues: [],
    changedFields,
    patches: [],
    ...(bodyInput !== undefined ? { bodyText: bodyInput } : {})
  };
};

export const buildAdminAboutEditorPayload = (
  state: AdminAboutPayloadSourceState
): AdminAboutEditorPayload => ({
  collection: 'about',
  entryId: state.entryId,
  publicEntryId: state.publicEntryId,
  defaultPublicSlug: state.defaultPublicSlug,
  revision: state.revision,
  relativePath: state.relativePath,
  writable: true,
  readonlyReason: null,
  bodyText: state.bodyText,
  values: createAdminAboutEditorValues()
});

export const getAdminAboutWriteFieldLabel = (field: string): string =>
  ABOUT_FIELD_LABELS[field] ?? field;

export const isAdminAboutFrontmatterIssuePath = (_path?: string): boolean => false;
