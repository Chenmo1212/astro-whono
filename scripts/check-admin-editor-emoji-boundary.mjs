import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const editorToolbarPath = 'src/components/admin/editor/markdown/EditorToolbar.svelte';
const emojiPickerPopoverPath = 'src/components/admin/editor/emoji/EmojiPickerPopover.svelte';
const emojiPickerClientPath = 'src/components/admin/editor/emoji/emoji-picker-client.ts';

const readText = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

const editorToolbarSource = readText(editorToolbarPath);
const emojiPickerPopoverSource = readText(emojiPickerPopoverPath);
const emojiPickerClientSource = readText(emojiPickerClientPath);

const requiredAssertions = [
  [
    editorToolbarSource,
    /EmojiPickerPopover/,
    `${editorToolbarPath}: toolbar must delegate emoji picker integration to EmojiPickerPopover`
  ],
  [
    emojiPickerPopoverSource,
    /createAdminEditorEmojiPicker/,
    `${emojiPickerPopoverPath}: popover must use the admin editor emoji picker adapter`
  ],
  [
    emojiPickerClientSource,
    /import\(\s*['"]emoji-picker-element['"]\s*\)/,
    `${emojiPickerClientPath}: emoji picker must stay on a client-only dynamic import`
  ],
  [
    emojiPickerClientSource,
    /new URL\(\s*['"]emoji-picker-element-data\/en\/emojibase\/data\.json['"]\s*,\s*import\.meta\.url\s*\)\.toString\(\)/,
    `${emojiPickerClientPath}: emoji picker dataSource must keep using the local emoji-picker-element-data asset`
  ],
  [
    emojiPickerClientSource,
    /new Picker\(\s*\{[\s\S]*\bdataSource\b[\s\S]*\}\s*\)/,
    `${emojiPickerClientPath}: emoji picker must pass the local dataSource into Picker()`
  ],
  [
    emojiPickerClientSource,
    /shadowRoot\??\.appendChild\(\s*style\s*\)/,
    `${emojiPickerClientPath}: emoji picker internal styles must be injected into the shadow root`
  ]
];

const forbiddenAssertions = [
  [
    editorToolbarSource,
    /import\(\s*['"]emoji-picker-element['"]\s*\)|new Picker\(|emoji-picker-element-data/,
    `${editorToolbarPath}: toolbar must not own emoji picker loading or dataSource details`
  ],
  [
    emojiPickerClientSource,
    /\bpickerStyle\b/,
    `${emojiPickerClientPath}: emoji-picker-element does not support pickerStyle as a constructor option`
  ]
];

const failures = [
  ...requiredAssertions
    .filter(([source, pattern]) => !pattern.test(source))
    .map(([, , message]) => message),
  ...forbiddenAssertions
    .filter(([source, pattern]) => pattern.test(source))
    .map(([, , message]) => message)
];

if (failures.length > 0) {
  console.error('[check:admin-editor-emoji-boundary] Admin editor emoji boundary violations:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[check:admin-editor-emoji-boundary] OK');
