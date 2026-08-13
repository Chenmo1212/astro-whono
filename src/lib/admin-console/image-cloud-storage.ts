import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  paginateListObjectsV2,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import {
  AdminImageUploadError,
  createAdminImageCloudError,
  type AdminImageCloudErrorCode,
  type AdminImageCloudErrorOutcome
} from './image-upload-error';

type AdminImageCloudUploadInput = {
  collection: 'essay' | 'bits' | 'memo';
  entryId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string | null;
};

type AdminImageCloudStorageConfig = {
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | undefined;
  forcePathStyle: boolean;
  publicBaseUrl: URL;
  prefix: string;
};

type AdminImageCloudUploadResult = {
  url: string;
  key: string;
};

export type AdminImageCloudListItem = {
  url: string;
  fileName: string;
  size: number | null;
  mimeType: string | null;
  lastModified: string | null;
};

const MIME_BY_EXT: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const ADMIN_IMAGE_CLOUD_MAX_ATTEMPTS = 2;
const ADMIN_IMAGE_CLOUD_UPLOAD_DEADLINE_MS = 60_000;
const ADMIN_IMAGE_CLOUD_LIST_DEADLINE_MS = 15_000;

class AdminImageCloudDeadlineError extends Error {
  constructor(deadlineMs: number) {
    super(`Cloud image operation exceeded ${deadlineMs}ms deadline`);
    this.name = 'AdminImageCloudDeadlineError';
  }
}

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, '');

const normalizeCloudPrefix = (value: string | undefined): string => trimSlashes(value?.trim() ?? '');

const encodeS3PathSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );

const encodeS3Path = (value: string): string =>
  value.split('/').map(encodeS3PathSegment).join('/');

const toSafeKeyPart = (value: string): string =>
  value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('/');

const readImportMetaEnv = (key: string): string => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.[key]?.trim() ?? '';
};

const readEnv = (key: string): string => readImportMetaEnv(key) || process.env[key]?.trim() || '';

export const isAdminImageCloudStorageEnabled = (): boolean =>
  readEnv('ASTRO_WHONO_IMAGE_STORAGE').toLowerCase() === 's3';

const parsePublicBaseUrl = (value: string): URL => {
  try {
    const normalizedValue = value.trim();
    const url = new URL(normalizedValue);
    const authority = normalizedValue.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1] ?? '';
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || authority.includes('@')
      || url.href.includes('?')
      || url.href.includes('#')
    ) {
      throw new Error('publicBaseUrl 包含不允许的 URL 部分');
    }

    const pathname = url.pathname.replace(/\/+$/, '');
    url.pathname = pathname || '/';
    return url;
  } catch {
    throw createAdminImageCloudError('cloud_config_invalid', 'failed_known');
  }
};

const getAdminImageCloudStorageConfig = (): AdminImageCloudStorageConfig => {
  const endpoint = readEnv('ASTRO_WHONO_S3_ENDPOINT') || undefined;
  const forcePathStyleEnv = readEnv('ASTRO_WHONO_S3_FORCE_PATH_STYLE').toLowerCase();
  const config = {
    endpoint,
    region: readEnv('ASTRO_WHONO_S3_REGION') || (endpoint ? 'auto' : ''),
    bucket: readEnv('ASTRO_WHONO_S3_BUCKET'),
    accessKeyId: readEnv('ASTRO_WHONO_S3_ACCESS_KEY_ID'),
    secretAccessKey: readEnv('ASTRO_WHONO_S3_SECRET_ACCESS_KEY'),
    sessionToken: readEnv('ASTRO_WHONO_S3_SESSION_TOKEN') || undefined,
    forcePathStyle: forcePathStyleEnv
      ? forcePathStyleEnv === 'true'
      : endpoint !== undefined,
    publicBaseUrl: readEnv('ASTRO_WHONO_S3_PUBLIC_BASE_URL'),
    prefix: normalizeCloudPrefix(readEnv('ASTRO_WHONO_S3_PREFIX'))
  };

  const missing = [
    ['region', config.region],
    ['bucket', config.bucket],
    ['accessKeyId', config.accessKeyId],
    ['secretAccessKey', config.secretAccessKey],
    ['publicBaseUrl', config.publicBaseUrl]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw createAdminImageCloudError('cloud_config_invalid', 'failed_known');
  }

  if (!config.endpoint && config.region.toLowerCase() === 'auto') {
    throw createAdminImageCloudError('cloud_config_invalid', 'failed_known');
  }

  return {
    ...config,
    publicBaseUrl: parsePublicBaseUrl(config.publicBaseUrl)
  };
};

const createS3Client = (config: AdminImageCloudStorageConfig): S3Client =>
  new S3Client({
    region: config.region,
    maxAttempts: ADMIN_IMAGE_CLOUD_MAX_ATTEMPTS,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      ...(config.sessionToken ? { sessionToken: config.sessionToken } : {})
    }
  });

const readErrorRecord = (error: unknown): Record<string, unknown> | null =>
  typeof error === 'object' && error !== null ? error as Record<string, unknown> : null;

const getErrorCode = (error: unknown): string => {
  const record = readErrorRecord(error);
  const value = typeof record?.code === 'string' ? record.code : record?.name;
  return typeof value === 'string' ? value : '';
};

const getProviderHttpStatus = (error: unknown): number | null => {
  const metadata = readErrorRecord(readErrorRecord(error)?.$metadata);
  return typeof metadata?.httpStatusCode === 'number' ? metadata.httpStatusCode : null;
};

const isRateLimitedError = (error: unknown): boolean => {
  const record = readErrorRecord(error);
  const retryable = readErrorRecord(record?.$retryable);
  const code = getErrorCode(error);
  return getProviderHttpStatus(error) === 429
    || retryable?.throttling === true
    || ['SlowDown', 'TooManyRequests', 'TooManyRequestsException', 'Throttling', 'ThrottlingException']
      .includes(code);
};

const isTimeoutError = (error: unknown): boolean => [
  'AbortError',
  'AdminImageCloudDeadlineError',
  'RequestTimeout',
  'RequestTimeoutException',
  'TimeoutError',
  'ETIMEDOUT'
].includes(getErrorCode(error));

const isNetworkError = (error: unknown): boolean => [
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE'
].includes(getErrorCode(error));

const toCloudStorageOperationError = (
  operation: 'upload' | 'list',
  error: unknown
): AdminImageUploadError => {
  let code: AdminImageCloudErrorCode;
  if (isRateLimitedError(error)) {
    code = 'cloud_rate_limited';
  } else if (isTimeoutError(error)) {
    code = 'cloud_timeout';
  } else if (isNetworkError(error) || getProviderHttpStatus(error) !== null) {
    code = 'cloud_provider_unavailable';
  } else {
    code = 'cloud_unknown';
  }

  const outcome: AdminImageCloudErrorOutcome = operation === 'upload'
    && (code === 'cloud_timeout' || isNetworkError(error))
    ? 'unknown_may_have_succeeded'
    : 'failed_known';
  return createAdminImageCloudError(code, outcome, error);
};

const withCloudOperationDeadline = async <T>(
  deadlineMs: number,
  run: (abortSignal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new AdminImageCloudDeadlineError(deadlineMs));
    }, deadlineMs);
  });

  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

const getMimeTypeFromFileName = (fileName: string): string | null =>
  MIME_BY_EXT[path.extname(fileName).toLowerCase()] ?? null;

const createCloudObjectKey = ({
  collection,
  entryId,
  fileName
}: Pick<AdminImageCloudUploadInput, 'collection' | 'entryId' | 'fileName'>): string => {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, extension);
  const entryPart = toSafeKeyPart(entryId) || 'entry';
  const uniqueName = `${baseName}-${randomUUID()}${extension}`;
  return [collection, entryPart, uniqueName].map(trimSlashes).filter(Boolean).join('/');
};

const createPublicUrl = (publicBaseUrl: URL, key: string): string => {
  const url = new URL(publicBaseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/${encodeS3Path(key)}`;
  return url.toString();
};

const toAdminImageCloudListItem = (
  object: {
    Key?: string | undefined;
    LastModified?: Date | undefined;
    Size?: number | undefined;
  },
  publicBaseUrl: URL
): AdminImageCloudListItem | null => {
  const key = object.Key ?? '';
  if (!key || key.endsWith('/')) return null;
  const fileName = path.posix.basename(key);
  const mimeType = getMimeTypeFromFileName(fileName);
  if (!mimeType) return null;

  return {
    url: createPublicUrl(publicBaseUrl, key),
    fileName,
    size: typeof object.Size === 'number' && Number.isFinite(object.Size) && object.Size >= 0
      ? object.Size
      : null,
    mimeType,
    lastModified: object.LastModified?.toISOString() ?? null
  };
};

export const uploadAdminImageToCloudStorage = async (
  input: AdminImageCloudUploadInput
): Promise<AdminImageCloudUploadResult> => {
  const config = getAdminImageCloudStorageConfig();
  const objectKey = [config.prefix, createCloudObjectKey(input)].filter(Boolean).join('/');
  const contentType = input.mimeType || 'application/octet-stream';

  try {
    await withCloudOperationDeadline(ADMIN_IMAGE_CLOUD_UPLOAD_DEADLINE_MS, (abortSignal) =>
      createS3Client(config).send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: input.buffer,
        ContentType: contentType
      }), { abortSignal })
    );
  } catch (error) {
    throw toCloudStorageOperationError('upload', error);
  }

  return {
    key: objectKey,
    url: createPublicUrl(config.publicBaseUrl, objectKey)
  };
};

export const listAdminCloudStorageImages = async (): Promise<AdminImageCloudListItem[]> => {
  if (!isAdminImageCloudStorageEnabled()) return [];

  const config = getAdminImageCloudStorageConfig();
  const items: AdminImageCloudListItem[] = [];

  try {
    await withCloudOperationDeadline(ADMIN_IMAGE_CLOUD_LIST_DEADLINE_MS, async (abortSignal) => {
      const paginator = paginateListObjectsV2(
        { client: createS3Client(config) },
        {
          Bucket: config.bucket,
          ...(config.prefix ? { Prefix: `${config.prefix}/` } : {})
        },
        { abortSignal }
      );

      for await (const page of paginator) {
        for (const object of page.Contents ?? []) {
          if (!isManagedAdminImageKey(object.Key ?? '', config.prefix)) continue;
          const item = toAdminImageCloudListItem(object, config.publicBaseUrl);
          if (item) items.push(item);
        }
      }
    });
  } catch (error) {
    throw toCloudStorageOperationError('list', error);
  }

  return items;
};

const isManagedAdminImageKey = (key: string, prefix: string): boolean => {
  const namespace = prefix ? `${prefix}/` : '';
  if (!key.startsWith(namespace)) return false;

  const parts = key.slice(namespace.length).split('/');
  return parts.length >= 3
    && (parts[0] === 'essay' || parts[0] === 'bits' || parts[0] === 'memo')
    && parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
};
