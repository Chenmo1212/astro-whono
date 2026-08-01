import { describe, expect, it } from 'vitest';
import {
  buildAdminAboutEditorPayload,
  buildAdminAboutWritePlan,
  createAdminAboutEditorValues,
  getAdminAboutWriteFieldLabel,
  isAdminAboutFrontmatterIssuePath
} from '../src/lib/admin-console/content-about-contract';
import { applyAdminContentWritePlan } from '../src/lib/admin-console/content-shared';

const sourceState = {
  entryId: 'index',
  publicEntryId: 'index',
  defaultPublicSlug: 'index',
  revision: 'about-rev',
  relativePath: 'src/content/about/index.md',
  bodyText: '\nabout body\n'
};

const createSourceText = () => [
  '---',
  'legacyNote: 保留未知 frontmatter',
  'legacyFlag: true',
  '---',
  '',
  'about body',
  ''
].join('\n');

describe('admin about content contract', () => {
  it('builds a body-only about editor payload', () => {
    const payload = buildAdminAboutEditorPayload(sourceState);

    expect(payload).toMatchObject({
      collection: 'about',
      entryId: 'index',
      relativePath: 'src/content/about/index.md',
      writable: true,
      readonlyReason: null,
      bodyText: '\nabout body\n',
      values: {}
    });
  });

  it('keeps about editor values empty and ignores frontmatter issue paths', () => {
    expect(createAdminAboutEditorValues()).toEqual({});
    expect(isAdminAboutFrontmatterIssuePath()).toBe(false);
    expect(isAdminAboutFrontmatterIssuePath('legacyNote' as never)).toBe(false);
    expect(getAdminAboutWriteFieldLabel('body')).toBe('正文');
    expect(getAdminAboutWriteFieldLabel('unknown')).toBe('unknown');
  });

  it('tracks only body changes and emits no frontmatter patches', () => {
    const plan = buildAdminAboutWritePlan(sourceState, '\nupdated about body\n');

    expect(plan.issues).toEqual([]);
    expect(plan.changedFields).toEqual(['body']);
    expect(plan.patches).toEqual([]);

    const nextSource = applyAdminContentWritePlan(
      { sourceText: createSourceText() },
      plan.patches,
      plan.bodyText
    );
    expect(nextSource).toContain('legacyNote: 保留未知 frontmatter');
    expect(nextSource).toContain('legacyFlag: true');
    expect(nextSource.endsWith('\nupdated about body\n')).toBe(true);
  });

  it('returns no changes when the body is unchanged', () => {
    const plan = buildAdminAboutWritePlan(sourceState, sourceState.bodyText);

    expect(plan).toEqual({
      issues: [],
      changedFields: [],
      patches: [],
      bodyText: sourceState.bodyText
    });
  });
});
