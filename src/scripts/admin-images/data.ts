import {
  fetchAdminImageJson,
  getAdminImageResponseErrors,
  isNullableNumber,
  isNullableString,
  isRecord,
  parseAdminImageMetaResponse,
  type AdminImageClientMeta
} from '../admin-shared/image-client';
import {
  isAdminImageBrowseGroup,
  isAdminImageOrigin,
  isAdminImageScopeKey
} from '../../lib/admin-console/image-contract';
import {
  normalizeAdminImageBrowseGroup
} from '../../lib/admin-console/image-browse';
import {
  DEFAULT_GROUP,
  DEFAULT_SCOPE,
  type AdminImageBootstrap,
  type AdminImageBrowseItem,
  type AdminImageFilterOption,
  type AdminImageListItem,
  type AdminImageListResponse,
  type AdminImageScope,
  type AdminImageState
} from './types';

const parsePositiveInteger = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export const toBrowseItem = (item: AdminImageListItem): AdminImageBrowseItem => ({
  path: item.path,
  origin: item.origin,
  fileName: item.fileName,
  owner: item.owner,
  ownerLabel: item.ownerLabel,
  browseGroup: item.browseGroup,
  browseGroupLabel: item.browseGroupLabel,
  browseSubgroup: item.browseSubgroup,
  browseSubgroupLabel: item.browseSubgroupLabel,
  preferredValue: item.preferredValue,
  previewSrc: item.previewSrc
});

export const toCachedMeta = (item: AdminImageListItem): AdminImageClientMeta => ({
  kind: 'local',
  path: item.path,
  value: item.value,
  origin: item.origin,
  width: item.width,
  height: item.height,
  size: item.size,
  mimeType: item.mimeType,
  previewSrc: item.previewSrc,
  providerStatus: item.providerStatus,
  ...(item.providerUrl !== undefined && { providerUrl: item.providerUrl }),
  ...(item.providerUploadedAt !== undefined && { providerUploadedAt: item.providerUploadedAt })
});

const LIST_RESPONSE_FORMAT_ERROR = '图片列表响应格式无效';

const isFilterOption = (item: unknown): item is AdminImageFilterOption =>
  isRecord(item)
  && typeof item.value === 'string'
  && typeof item.label === 'string'
  && typeof item.count === 'number';

const parseFilterOptions = (payload: unknown): AdminImageFilterOption[] => {
  if (!Array.isArray(payload)) {
    throw new Error(LIST_RESPONSE_FORMAT_ERROR);
  }

  return payload.map((item) => {
    if (!isFilterOption(item)) {
      throw new Error(LIST_RESPONSE_FORMAT_ERROR);
    }

    return item;
  });
};

const isBrowseItem = (item: unknown): item is AdminImageBrowseItem =>
  isRecord(item)
  && typeof item.path === 'string'
  && isAdminImageOrigin(item.origin)
  && typeof item.fileName === 'string'
  && isNullableString(item.owner)
  && isNullableString(item.ownerLabel)
  && isAdminImageBrowseGroup(item.browseGroup)
  && item.browseGroup !== DEFAULT_GROUP
  && typeof item.browseGroupLabel === 'string'
  && typeof item.browseSubgroup === 'string'
  && isNullableString(item.browseSubgroupLabel)
  && isNullableString(item.preferredValue)
  && isNullableString(item.previewSrc);

const isListItem = (item: unknown): item is AdminImageListItem =>
  isRecord(item)
  && typeof item.path === 'string'
  && isAdminImageOrigin(item.origin)
  && typeof item.fileName === 'string'
  && isNullableString(item.owner)
  && isNullableString(item.ownerLabel)
  && isAdminImageBrowseGroup(item.browseGroup)
  && item.browseGroup !== DEFAULT_GROUP
  && typeof item.browseGroupLabel === 'string'
  && typeof item.browseSubgroup === 'string'
  && isNullableString(item.browseSubgroupLabel)
  && isNullableString(item.preferredValue)
  && isNullableString(item.previewSrc)
  && typeof item.value === 'string'
  && isNullableNumber(item.width)
  && isNullableNumber(item.height)
  && isNullableNumber(item.size)
  && isNullableString(item.mimeType);

const parseListItem = (item: unknown): AdminImageListItem => {
  if (!isListItem(item)) {
    throw new Error(LIST_RESPONSE_FORMAT_ERROR);
  }

  return item;
};

const parseScope = (value: unknown): AdminImageScope => {
  if (value === '' || isAdminImageScopeKey(value)) return value;
  throw new Error(LIST_RESPONSE_FORMAT_ERROR);
};

const parseGroup = (value: unknown): string => {
  if (value === '' || isAdminImageBrowseGroup(value)) return value;
  throw new Error(LIST_RESPONSE_FORMAT_ERROR);
};

const parseSubgroup = (value: unknown): string => {
  if (typeof value === 'string') return value;
  throw new Error(LIST_RESPONSE_FORMAT_ERROR);
};

const parseListResult = (result: unknown): AdminImageListResponse => {
  if (!isRecord(result) || !Array.isArray(result.items)) {
    throw new Error(LIST_RESPONSE_FORMAT_ERROR);
  }

  if (
    !isPositiveInteger(result.page)
    || !isPositiveInteger(result.totalPages)
    || !isNonNegativeInteger(result.totalCount)
  ) {
    throw new Error(LIST_RESPONSE_FORMAT_ERROR);
  }

  return {
    scope: parseScope(result.scope),
    group: parseGroup(result.group),
    subgroup: parseSubgroup(result.subgroup),
    groupOptions: parseFilterOptions(result.groupOptions),
    subgroupOptions: parseFilterOptions(result.subgroupOptions),
    items: result.items.map(parseListItem),
    page: result.page,
    totalPages: result.totalPages,
    totalCount: result.totalCount
  };
};

const parseBrowseIndex = (payload: unknown): AdminImageBrowseItem[] | null => {
  if (payload == null) return null;
  if (!Array.isArray(payload)) return null;
  return payload.filter(isBrowseItem);
};

export const parseBootstrap = (text: string): AdminImageBootstrap | null => {
  try {
    const payload = JSON.parse(text) as unknown;
    if (
      !isRecord(payload)
      || typeof payload.listEndpoint !== 'string'
      || typeof payload.metaEndpoint !== 'string'
      || typeof payload.getTokenEndpoint !== 'string'
      || !isRecord(payload.initialState)
    ) {
      return null;
    }

    const browseIndex = parseBrowseIndex(payload.browseIndex);
    if (payload.browseIndex != null && browseIndex === null) {
      return null;
    }
    const normalizedScope = typeof payload.initialState.scope === 'string'
      ? payload.initialState.scope.trim().toLowerCase()
      : '';
    const normalizedGroup = typeof payload.initialState.group === 'string'
      ? normalizeAdminImageBrowseGroup(payload.initialState.group)
      : '';
    const initialScope = isAdminImageScopeKey(normalizedScope) ? normalizedScope : DEFAULT_SCOPE;

    return {
      listEndpoint: payload.listEndpoint,
      metaEndpoint: payload.metaEndpoint,
      getTokenEndpoint: payload.getTokenEndpoint,
      initialState: {
        scope: initialScope,
        group: isAdminImageBrowseGroup(normalizedGroup) ? normalizedGroup : DEFAULT_GROUP,
        subgroup: typeof payload.initialState.subgroup === 'string' ? payload.initialState.subgroup.trim() : '',
        query: typeof payload.initialState.query === 'string' ? payload.initialState.query : '',
        page: parsePositiveInteger(payload.initialState.page, 1)
      },
      browseIndex,
      didRefresh: payload.didRefresh === true
    };
  } catch {
    return null;
  }
};

const parseListResponse = (payload: unknown): AdminImageListResponse => {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.result) || !Array.isArray(payload.result.items)) {
    throw new Error('图片列表响应格式无效');
  }

  return parseListResult(payload.result);
};

export const fetchList = async (
  endpoint: string,
  state: AdminImageState,
  limit: number
): Promise<AdminImageListResponse> => {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(limit)
  });

  if (state.scope) {
    params.set('scope', state.scope);
  } else {
    params.set('group', state.group || DEFAULT_GROUP);
  }

  if (!state.scope && state.group !== DEFAULT_GROUP && state.subgroup.trim()) {
    params.set('sub', state.subgroup.trim());
  }
  if (state.query.trim()) {
    params.set('q', state.query.trim());
  }

  const payload = await fetchAdminImageJson(`${endpoint}?${params.toString()}`, '图片列表请求失败');
  return parseListResponse(payload);
};

export const fetchMetaByPath = async (endpoint: string, assetPath: string): Promise<AdminImageClientMeta> => {
  const payload = await fetchAdminImageJson(
    `${endpoint}?${new URLSearchParams({ path: assetPath }).toString()}`,
    '图片元数据请求失败'
  );
  const meta = parseAdminImageMetaResponse(payload);
  
  // Merge with localStorage Provider status
  const providerStatus = getProviderStatus(assetPath);
  if (providerStatus) {
    return {
      ...meta,
      providerStatus: providerStatus.providerStatus,
      providerUrl: providerStatus.providerUrl,
      providerUploadedAt: providerStatus.providerUploadedAt
    };
  }
  
  return meta;
};

export const updateUrl = (state: AdminImageState) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('refresh');

  if (state.scope) {
    url.searchParams.set('scope', state.scope);
  } else {
    url.searchParams.delete('scope');
  }

  if (!state.scope && state.group !== DEFAULT_GROUP && state.group.trim()) {
    url.searchParams.set('group', state.group.trim());
  } else {
    url.searchParams.delete('group');
  }

  if (!state.scope && state.group !== DEFAULT_GROUP && state.subgroup.trim()) {
    url.searchParams.set('sub', state.subgroup.trim());
  } else {
    url.searchParams.delete('sub');
  }

  if (state.query.trim()) {
    url.searchParams.set('q', state.query.trim());
  } else {
    url.searchParams.delete('q');
  }

  if (state.page > 1) {
    url.searchParams.set('page', String(state.page));
  } else {
    url.searchParams.delete('page');
  }

  history.replaceState(null, '', `${url.pathname}${url.search}`);
};

export const navigateToRefresh = ({ resetState = false }: { resetState?: boolean } = {}) => {
  const url = new URL(window.location.href);
  if (resetState) {
    url.searchParams.delete('scope');
    url.searchParams.delete('group');
    url.searchParams.delete('sub');
    url.searchParams.delete('q');
    url.searchParams.delete('page');
  }
  url.searchParams.set('refresh', '1');
  window.location.assign(`${url.pathname}${url.search}`);
};

export const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.append(textarea);
  textarea.select();
  const execCommand = Reflect.get(document as object, 'execCommand') as
    | ((commandId: string, showUI?: boolean, input?: string) => boolean)
    | undefined;
  const copied = execCommand?.call(document, 'copy') ?? false;
  textarea.remove();

  if (!copied) {
    throw new Error('浏览器阻止了复制动作');
  }
};

// LocalStorage key for Provider upload status
const PROVIDER_STATUS_STORAGE_KEY = 'admin-images-provider-status';

// Type for stored Provider status
type ProviderStatusRecord = {
  providerStatus: 'uploaded' | 'failed';
  providerUrl: string | null;
  providerUploadedAt: number | null;
};

// Load Provider status from localStorage
const loadProviderStatusFromStorage = (): Map<string, ProviderStatusRecord> => {
  try {
    const stored = localStorage.getItem(PROVIDER_STATUS_STORAGE_KEY);
    if (!stored) return new Map();
    
    const parsed = JSON.parse(stored) as Record<string, ProviderStatusRecord>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
};

// Save Provider status to localStorage
const saveProviderStatusToStorage = (statusMap: Map<string, ProviderStatusRecord>): void => {
  try {
    const obj = Object.fromEntries(statusMap);
    localStorage.setItem(PROVIDER_STATUS_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Silently fail if localStorage is not available
  }
};

// Save single image Provider status
export const saveProviderStatus = (
  imagePath: string,
  status: 'uploaded' | 'failed',
  providerUrl: string | null = null,
  providerUploadedAt: number | null = null
): void => {
  const statusMap = loadProviderStatusFromStorage();
  statusMap.set(imagePath, { providerStatus: status, providerUrl, providerUploadedAt });
  saveProviderStatusToStorage(statusMap);
};

// Get Provider status for an image
export const getProviderStatus = (imagePath: string): ProviderStatusRecord | null => {
  const statusMap = loadProviderStatusFromStorage();
  return statusMap.get(imagePath) || null;
};

export const uploadImageToProvider = async (
  uploadEndpoint: string,
  imagePath: string,
  file: File
): Promise<{ providerUrl: string; uploadedAt: number }> => {
  // Dynamically import qiniu-js
  const qiniu = await import('qiniu-js');
  const fileName = imagePath.split('/').pop() || file.name;
  const tokenResponse = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ fileName }),
    cache: 'no-store'
  });

  const tokenPayload = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !isRecord(tokenPayload) || tokenPayload.ok !== true || !isRecord(tokenPayload.result)) {
    const errors = getAdminImageResponseErrors(tokenPayload);
    throw new Error(errors[0] ?? `Failed to get upload credentials (HTTP ${tokenResponse.status})`);
  }

  const { uploadToken, domain, key } = tokenPayload.result as { uploadToken: string; domain: string; key: string };

  // 使用 qiniu-js 直接上传到七牛云
  return new Promise((resolve, reject) => {
    const observable = qiniu.upload(file, key, uploadToken, {}, {});
    
    observable.subscribe({
      error: (err: unknown) => {
        const message = err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : '上传失败';
        reject(new Error(`上传失败: ${message}`));
      },
      complete: () => {
        // domain already includes protocol (https://) from config
        const providerUrl = domain.startsWith('http://') || domain.startsWith('https://')
          ? `${domain}/${key}`
          : `https://${domain}/${key}`;
        const uploadedAt = Date.now();
        resolve({ providerUrl, uploadedAt });
      }
    });
  });
};
