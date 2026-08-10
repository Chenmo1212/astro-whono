import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchList,
  parseBootstrap,
  toBrowseItem,
  toCachedMeta
} from '../src/scripts/admin-images/data';
import {
  formatAdminImageMetaSummary,
  getAdminImageOriginLabel,
  parseAdminImageListResponse,
  parseAdminImageMetaResponse
} from '../src/scripts/admin-shared/image-client';
import {
  DEFAULT_GROUP,
  type AdminImageListItem,
  type AdminImageState
} from '../src/scripts/admin-images/types';
import { renderDetail, renderItems } from '../src/scripts/admin-images/view';

const listItem: AdminImageListItem = {
  path: 'public/images/archive/cover.png',
  origin: 'public',
  fileName: 'cover.png',
  owner: null,
  ownerLabel: null,
  browseGroup: 'pages',
  browseGroupLabel: '页面插图',
  browseSubgroup: 'archive',
  browseSubgroupLabel: '归档',
  preferredValue: '/images/archive/cover.png',
  previewSrc: '/images/archive/cover.png',
  value: '/images/archive/cover.png',
  width: 1200,
  height: 800,
  size: 2048,
  mimeType: 'image/png'
};

const createState = (state: Partial<AdminImageState> = {}): AdminImageState => ({
  scope: '',
  group: DEFAULT_GROUP,
  subgroup: '',
  query: '',
  page: 1,
  ...state
});

const createListPayload = () => ({
  ok: true,
  result: {
    scope: 'recent',
    group: '',
    subgroup: '',
    groupOptions: [],
    subgroupOptions: [],
    items: [listItem] as unknown[],
    page: 1,
    totalPages: 1,
    totalCount: 1
  }
});

const mockListFetch = (payload: unknown) => {
  const requestedUrls: string[] = [];
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    requestedUrls.push(String(input));
    return Response.json(payload);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requestedUrls };
};

const createBrowseItem = (
  origin: AdminImageListItem['origin'],
  path: string
): AdminImageListItem => ({
  path,
  origin,
  fileName: path.split('/').pop() ?? path,
  owner: null,
  ownerLabel: null,
  browseGroup: origin === 'cloud' ? 'cloud' : 'pages',
  browseGroupLabel: origin === 'cloud' ? '云端图片' : '页面插图',
  browseSubgroup: '',
  browseSubgroupLabel: null,
  preferredValue: origin === 'cloud' ? path : `/${path.slice('public/'.length)}`,
  previewSrc: origin === 'cloud' ? path : `/${path.slice('public/'.length)}`,
  value: origin === 'cloud' ? path : path.slice('public/'.length),
  width: null,
  height: null,
  size: null,
  mimeType: 'image/png'
});

describe('admin-images/data', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends recent scope and accepts a matching response contract', async () => {
    const { fetchMock, requestedUrls } = mockListFetch(createListPayload());

    const result = await fetchList(
      '/api/admin/images/list',
      createState({ scope: 'recent', query: 'cover', page: 2 }),
      20
    );

    expect(result.scope).toBe('recent');
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(requestedUrls[0] ?? '', 'http://127.0.0.1');
    expect(requestUrl.searchParams.get('scope')).toBe('recent');
    expect(requestUrl.searchParams.get('group')).toBeNull();
    expect(requestUrl.searchParams.get('q')).toBe('cover');
    expect(requestUrl.searchParams.get('page')).toBe('2');
  });

  it('only groups mixed normal browse results and preserves recent API order', () => {
    const cloudItem = createBrowseItem('cloud', 'https://cdn.example.test/bits/cloud.png');
    const localItem = createBrowseItem('public', 'public/bits/local.png');
    const secondLocalItem = createBrowseItem('public', 'public/bits/second-local.png');
    const render = (
      scope: '' | 'recent',
      items: readonly AdminImageListItem[] = [cloudItem, localItem]
    ) => {
      const resultListEl = { dataset: { view: 'grid' }, innerHTML: '' } as unknown as HTMLUListElement;
      const emptyEl = { hidden: true } as unknown as HTMLElement;
      renderItems({
        resultListEl,
        emptyEl,
        items,
        selectedPath: null,
        detailMetaCache: new Map(),
        scope
      });
      return resultListEl.innerHTML;
    };

    const recentHtml = render('recent', [localItem, cloudItem, secondLocalItem]);
    expect(recentHtml.indexOf(localItem.path)).toBeLessThan(recentHtml.indexOf(cloudItem.path));
    expect(recentHtml.indexOf(cloudItem.path)).toBeLessThan(recentHtml.indexOf(secondLocalItem.path));
    expect(recentHtml).not.toContain('admin-images-browser__source-heading');

    const browseHtml = render('');
    expect(browseHtml.indexOf(localItem.path)).toBeLessThan(browseHtml.indexOf(cloudItem.path));
    expect(browseHtml).toContain('aria-label="本地图片"');
    expect(browseHtml).toContain('aria-label="云端图片"');

    const localOnlyHtml = render('', [localItem]);
    expect(localOnlyHtml).not.toContain('admin-images-browser__source-heading');
  });

  it('does not double-encode an already encoded cloud key in Markdown references', () => {
    const detailEl = { hidden: true, innerHTML: '' } as unknown as HTMLElement;
    const cloudItem = createBrowseItem(
      'cloud',
      'https://cdn.example.test/uploads/space%20%E9%9B%AA%23hash%3Fquery%25.png'
    );

    renderDetail({
      detailEl,
      item: cloudItem,
      detailMeta: {
        kind: 'remote',
        path: null,
        value: cloudItem.path,
        origin: 'cloud',
        width: null,
        height: null,
        size: 1024,
        mimeType: 'image/png',
        previewSrc: cloudItem.path
      },
      detailError: null,
      detailLoading: false,
      copyIcon: '',
      linkIcon: '',
      eyeIcon: '',
      trashIcon: '',
      largeFileThreshold: 500 * 1024
    });

    expect(detailEl.innerHTML).toContain(
      '![](https://cdn.example.test/uploads/space%20%E9%9B%AA%23hash%3Fquery%25.png)'
    );
    expect(detailEl.innerHTML).not.toContain('%2520');
    expect(detailEl.innerHTML).not.toContain('%25E9');
  });

  it('preserves cloud metadata from bootstrap using the remote meta contract', () => {
    const cloudListItem = {
      ...createBrowseItem(
        'cloud',
        'https://cdn.example.test/uploads/essay/guide/cloud-shot.webp'
      ),
      size: 2048,
      mimeType: 'image/webp'
    };
    const cloudBrowseItem = toBrowseItem(cloudListItem);
    const bootstrap = parseBootstrap(JSON.stringify({
      listEndpoint: '/api/admin/images/list/',
      metaEndpoint: '/api/admin/images/meta/',
      cloudDeleteEndpoint: '/api/admin/images/cloud/delete/',
      initialState: {
        scope: '',
        group: 'all',
        subgroup: '',
        query: '',
        page: 1
      },
      browseIndex: [cloudBrowseItem],
      didRefresh: false
    }));

    const parsedCloudItem = bootstrap?.browseIndex?.[0];
    expect(parsedCloudItem).toMatchObject({
      origin: 'cloud',
      size: 2048,
      mimeType: 'image/webp'
    });
    expect(parsedCloudItem && toCachedMeta(parsedCloudItem)).toEqual({
      kind: 'remote',
      path: null,
      value: cloudListItem.path,
      origin: 'cloud',
      width: null,
      height: null,
      size: 2048,
      mimeType: 'image/webp',
      previewSrc: cloudListItem.previewSrc
    });
  });

  it('accepts the shared field picker list and metadata contracts', () => {
    const listResult = parseAdminImageListResponse(createListPayload());
    const metaResult = parseAdminImageMetaResponse({
      ok: true,
      result: {
        kind: 'local',
        path: listItem.path,
        value: listItem.value,
        origin: listItem.origin,
        width: listItem.width,
        height: listItem.height,
        size: listItem.size,
        mimeType: listItem.mimeType,
        previewSrc: listItem.previewSrc
      }
    });

    expect(listResult.items).toHaveLength(1);
    expect(listResult.page).toBe(1);
    expect(metaResult.path).toBe(listItem.path);
  });

  it('labels cloud image metadata as a remote cloud resource', () => {
    expect(getAdminImageOriginLabel('cloud')).toBe('云端资源');
    expect(formatAdminImageMetaSummary({
      kind: 'remote',
      origin: 'cloud',
      width: null,
      height: null,
      size: 1024
    })).toBe('远程图片；不自动读取本地尺寸');
  });

  it('rejects malformed Images Console list items instead of hiding them', async () => {
    const payload = createListPayload();
    payload.result.items = [
      {
        ...listItem,
        value: 404
      }
    ];
    mockListFetch(payload);

    await expect(fetchList('/api/admin/images/list', createState({ scope: 'recent' }), 20))
      .rejects.toThrow('图片列表响应格式无效');
  });

  it('rejects missing pagination fields from Images Console list responses', async () => {
    const payload = createListPayload();
    delete (payload.result as Record<string, unknown>).totalPages;
    mockListFetch(payload);

    await expect(fetchList('/api/admin/images/list', createState({ scope: 'recent' }), 20))
      .rejects.toThrow('图片列表响应格式无效');
  });

  it('rejects malformed Images Console filter options', async () => {
    const payload = createListPayload();
    payload.result.groupOptions = [
      {
        value: DEFAULT_GROUP,
        label: '全部',
        count: '1'
      }
    ] as unknown as typeof payload.result.groupOptions;
    mockListFetch(payload);

    await expect(fetchList('/api/admin/images/list', createState({ scope: 'recent' }), 20))
      .rejects.toThrow('图片列表响应格式无效');
  });

  it('rejects malformed shared picker list and metadata responses', () => {
    expect(() => parseAdminImageListResponse({
      ...createListPayload(),
      result: {
        ...createListPayload().result,
        items: [
          {
            ...listItem,
            origin: 'remote'
          }
        ]
      }
    })).toThrow('图片列表响应格式无效');

    expect(() => parseAdminImageMetaResponse({
      ok: true,
      result: {
        kind: 'local',
        path: listItem.path,
        value: listItem.value,
        origin: listItem.origin,
        width: String(listItem.width),
        height: listItem.height,
        size: listItem.size,
        mimeType: listItem.mimeType,
        previewSrc: listItem.previewSrc
      }
    })).toThrow('图片元数据响应格式无效');
  });

  it('keeps cloud uploads out of the local Bits metadata path', async () => {
    const source = await readFile('src/components/admin/editor/bits/BitsImageRowsEditor.svelte', 'utf8');

    expect(source).toContain("const isCloudUpload = result.src.startsWith('https://');");
    expect(source).toContain("kind: isCloudUpload ? 'remote' : 'local'");
    expect(source).toContain("origin: isCloudUpload ? 'cloud' : 'public'");
  });

  it('invalidates the server browse snapshot after cloud deletion', async () => {
    const source = await readFile('src/scripts/admin-images/controller.ts', 'utf8');

    expect(source).toContain('let hasLocalBrowse = Array.isArray(bootstrap.browseIndex);');
    expect(source).toContain('if (!hasLocalBrowse || !bootstrap.browseIndex) return;');
    expect(source).toMatch(
      /await deleteCloudImage\(bootstrap\.cloudDeleteEndpoint, key\);[\s\S]*hasLocalBrowse = false;[\s\S]*await loadList\(\{ updateLocation: true \}\);/
    );
  });
});
