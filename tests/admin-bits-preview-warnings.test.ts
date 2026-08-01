import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('bits editor preview warnings', () => {
  it('keeps API preview warnings wired into the preview status bar', async () => {
    const source = await readFile('src/components/admin/editor/bits/BitsEditorWorkspace.svelte', 'utf8');

    expect(source).toContain('let previewWarnings = $state<string[]>([]);');
    expect(source).not.toContain('const previewWarnings = $derived([]);');
    expect(source).toContain('previewWarnings = previewResult.warnings;');
    expect(source).toMatch(/previewBusy = true;\s+previewError = '';\s+previewWarnings = \[\];/);
    expect(source).toMatch(/previewHtml = '';\s+previewError = '';\s+previewWarnings = \[\];\s+return;/);
  });
});
