import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

const enabled = process.env.ASTRO_WHONO_CLOUD_SMOKE === '1';
if (!enabled) {
  console.log('[cloud-smoke] skipped (set ASTRO_WHONO_CLOUD_SMOKE=1 to opt in)');
  process.exit(0);
}

const endpoint = process.env.ASTRO_WHONO_S3_ENDPOINT?.trim() || undefined;
const region = process.env.ASTRO_WHONO_S3_REGION?.trim() || (endpoint ? 'auto' : '');
const bucket = process.env.ASTRO_WHONO_S3_BUCKET?.trim() || '';
const accessKeyId = process.env.ASTRO_WHONO_S3_ACCESS_KEY_ID?.trim() || '';
const secretAccessKey = process.env.ASTRO_WHONO_S3_SECRET_ACCESS_KEY?.trim() || '';
const publicBaseUrl = process.env.ASTRO_WHONO_S3_PUBLIC_BASE_URL?.trim() || '';
const prefix = (process.env.ASTRO_WHONO_S3_PREFIX?.trim() || '').replace(/^\/+|\/+$/g, '');
const forcePathStyle = process.env.ASTRO_WHONO_S3_FORCE_PATH_STYLE
  ? process.env.ASTRO_WHONO_S3_FORCE_PATH_STYLE.toLowerCase() === 'true'
  : Boolean(endpoint);

if (!region || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
  throw new Error('[cloud-smoke] missing S3 smoke configuration');
}
if (!endpoint && region.toLowerCase() === 'auto') {
  throw new Error('[cloud-smoke] native AWS S3 requires an explicit region (not auto)');
}

const baseUrl = new URL(publicBaseUrl);
if (
  baseUrl.protocol !== 'https:'
  || baseUrl.username
  || baseUrl.password
  || baseUrl.search
  || baseUrl.hash
) {
  throw new Error('[cloud-smoke] ASTRO_WHONO_S3_PUBLIC_BASE_URL must be an HTTPS URL without credentials, query, or hash');
}

const formatSmokeError = (error) => {
  if (!error || typeof error !== 'object') return 'unknown error';
  const code = typeof error.code === 'string' ? error.code : '';
  const name = typeof error.name === 'string' ? error.name : '';
  const status = error.$metadata && typeof error.$metadata.httpStatusCode === 'number'
    ? `HTTP ${error.$metadata.httpStatusCode}`
    : '';
  return [code || name || 'provider error', status].filter(Boolean).join(' ');
};

const deadlineMs = 15_000;
const withDeadline = async (run) => {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`cloud smoke deadline exceeded (${deadlineMs}ms)`));
    }, deadlineMs);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
};

const client = new S3Client({
  region,
  ...(endpoint ? { endpoint } : {}),
  forcePathStyle,
  maxAttempts: 2,
  credentials: {
    accessKeyId,
    secretAccessKey,
    ...(process.env.ASTRO_WHONO_S3_SESSION_TOKEN?.trim()
      ? { sessionToken: process.env.ASTRO_WHONO_S3_SESSION_TOKEN.trim() }
      : {})
  }
});
const key = [prefix, 'essay', 'smoke', `astro-whono-${randomUUID()}.png`]
  .filter(Boolean)
  .join('/');
const publicUrl = new URL(`${baseUrl.toString().replace(/\/+$/, '')}/${key
  .split('/')
  .map((part) => encodeURIComponent(part))
  .join('/')}`);

let uploadAttempted = false;
try {
  uploadAttempted = true;
  await withDeadline((abortSignal) => client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from('iVBORw0KGgo=', 'base64'),
    ContentType: 'image/png'
  }), { abortSignal }));
  const decodedPath = decodeURIComponent(publicUrl.pathname.replace(/^\/+/, ''));
  if (!decodedPath.endsWith(key)) {
    throw new Error('[cloud-smoke] public URL/key round-trip failed');
  }

  const listedKeys = [];
  let continuationToken;
  do {
    const page = await withDeadline((abortSignal) => client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ...(prefix ? { Prefix: `${prefix}/` } : {}),
      ...(continuationToken ? { ContinuationToken: continuationToken } : {})
    }), { abortSignal }));
    for (const object of page.Contents ?? []) {
      if (typeof object.Key === 'string' && object.Key.startsWith(`${prefix ? `${prefix}/` : ''}essay/`)) {
        listedKeys.push(object.Key);
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  if (!listedKeys.includes(key)) {
    throw new Error('[cloud-smoke] uploaded object was not returned by paginated list');
  }

  console.log(JSON.stringify({ ok: true, provider: endpoint ? 's3-compatible-endpoint' : 'aws-s3', key, publicUrl: publicUrl.toString() }));
} finally {
  if (uploadAttempted) {
    await withDeadline((abortSignal) => client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    }), { abortSignal })).catch((error) => {
      console.error('[cloud-smoke] cleanup failed:', formatSmokeError(error));
      process.exitCode = 1;
    });
  }
  client.destroy();
}
