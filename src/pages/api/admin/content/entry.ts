import type { APIRoute } from 'astro';
import {
  ADMIN_JSON_HEADERS,
  isAdminDryRunRequest,
  persistAdminFileTransaction,
  readAdminJsonRequestBody,
  validateAdminJsonWriteRequest
} from '../../../../lib/admin-console/admin-api';
import {
  ADMIN_CONTENT_COLLECTION_KEYS,
  isAdminContentCollectionKey,
  isAdminContentEntryWriteCollectionKey,
  type AdminContentEntryWriteCollectionKey
} from '../../../../lib/admin-console/content-collections';
import type { AdminContentValidationIssue } from '../../../../lib/admin-console/content-entry-contract';
import {
  AdminContentEntryResolutionError,
  getAdminContentReadOnlyReason,
  loadAdminContentSourceState
} from '../../../../lib/admin-console/content-entry-source';
import {
  buildAdminContentEntryEditorPayloadFromState,
  readAdminContentEntryEditorPayload
} from '../../../../lib/admin-console/content-editor-payload';
import {
  applyAdminContentWritePlan,
  buildAdminContentWritePlanFromState
} from '../../../../lib/admin-console/content-write-plan';
import { withAdminContentWriteLock } from '../../../../lib/admin-console/content-write-lock';

type WriteInput = {
  collection?: AdminContentEntryWriteCollectionKey;
  entryId?: string;
  revision?: string;
  frontmatterInput?: unknown;
  bodyInput?: string;
  errors: string[];
  issues: AdminContentValidationIssue[];
};

const JSON_HEADERS = ADMIN_JSON_HEADERS;

const createJsonErrorResponse = (
  status: number,
  errors: readonly string[],
  issues: readonly AdminContentValidationIssue[] = []
): Response =>
  new Response(
    JSON.stringify(
      {
        ok: false,
        errors,
        ...(issues.length > 0 ? { issues } : {})
      },
      null,
      2
    ),
    {
      status,
      headers: JSON_HEADERS
    }
  );

const DEV_ONLY_NOT_FOUND_RESPONSE = new Response('Not Found', { status: 404 });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isFrontmatterWriteCollection = (collection: string): collection is 'essay' | 'bits' =>
  collection === 'essay' || collection === 'bits';

const extractWriteInput = (body: unknown): WriteInput => {
  if (!isRecord(body)) {
    return {
      errors: ['请求体必须是 JSON 对象'],
      issues: [{ path: 'body', message: '请求体必须是 JSON 对象' }]
    };
  }

  const errors: string[] = [];
  const issues: AdminContentValidationIssue[] = [];
  let collection: AdminContentEntryWriteCollectionKey | undefined;
  const rawCollection = typeof body.collection === 'string' ? body.collection.trim() : '';
  const entryId = typeof body.entryId === 'string' ? body.entryId.trim() : undefined;
  const revision = typeof body.revision === 'string' ? body.revision.trim() : undefined;
  const hasFrontmatter = hasOwn(body, 'frontmatter');
  const hasBody = hasOwn(body, 'body');

  if (!rawCollection) {
    const message = '请求体缺少 collection';
    errors.push(message);
    issues.push({ path: 'collection', message });
  } else if (!isAdminContentCollectionKey(rawCollection)) {
    const message = `不支持的 content collection：${rawCollection}；仅支持 ${ADMIN_CONTENT_COLLECTION_KEYS.join(' / ')}`;
    errors.push(message);
    issues.push({ path: 'collection', message });
  } else if (!isAdminContentEntryWriteCollectionKey(rawCollection)) {
    const message = getAdminContentReadOnlyReason(rawCollection) ?? `当前 collection 暂不支持写盘：${rawCollection}`;
    errors.push(message);
    issues.push({ path: 'collection', message });
  } else {
    collection = rawCollection;
  }

  if (!entryId) {
    const message = '请求体缺少 entryId';
    errors.push(message);
    issues.push({ path: 'entryId', message });
  }

  if (!revision) {
    const message = '请求体缺少 revision';
    errors.push(message);
    issues.push({ path: 'revision', message });
  }

  if (rawCollection === 'about' && !hasBody) {
    const message = 'about 保存请求缺少 body 字段';
    errors.push(message);
    issues.push({ path: 'body', message });
  }

  if (rawCollection === 'memo' && !hasBody) {
    const message = 'memo 保存请求缺少 body 字段';
    errors.push(message);
    issues.push({ path: 'body', message });
  }

  if (isFrontmatterWriteCollection(rawCollection) && !hasFrontmatter) {
    const message = '请求体缺少 frontmatter 字段';
    errors.push(message);
    issues.push({ path: 'frontmatter', message });
  } else if (isFrontmatterWriteCollection(rawCollection) && !isRecord(body.frontmatter)) {
    const message = 'frontmatter 必须是对象';
    errors.push(message);
    issues.push({ path: 'frontmatter', message });
  }

  if (hasBody && typeof body.body !== 'string') {
    const message = 'body 必须是 Markdown 字符串';
    errors.push(message);
    issues.push({ path: 'body', message });
  }

  return {
    ...(collection ? { collection } : {}),
    ...(entryId ? { entryId } : {}),
    ...(revision ? { revision } : {}),
    ...(hasFrontmatter ? { frontmatterInput: body.frontmatter } : {}),
    ...(hasBody && typeof body.body === 'string' ? { bodyInput: body.body } : {}),
    errors,
    issues
  };
};

const createEntryResolutionErrorResponse = (error: unknown): Response | null => {
  if (!(error instanceof AdminContentEntryResolutionError)) return null;

  return createJsonErrorResponse(
    error.code === 'source-not-found' ? 404 : 400,
    [error.message],
    [{ path: 'entryId', message: error.message }]
  );
};

class AdminContentRevisionConflictError extends Error {
  latestPayload: Awaited<ReturnType<typeof readAdminContentEntryEditorPayload>>;

  constructor(latestPayload: Awaited<ReturnType<typeof readAdminContentEntryEditorPayload>>) {
    super('Admin content entry revision conflict');
    this.latestPayload = latestPayload;
  }
}

const createRevisionConflictResponse = (
  payload: Awaited<ReturnType<typeof readAdminContentEntryEditorPayload>>
): Response =>
  new Response(
    JSON.stringify(
      {
        ok: false,
        errors: ['检测到内容文件已在外部更新，已拒绝覆盖，请刷新当前条目后再保存'],
        payload
      },
      null,
      2
    ),
    { status: 409, headers: JSON_HEADERS }
  );

export const GET: APIRoute = async ({ url }) => {
  if (!import.meta.env.DEV && !process.env.VITEST) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  const collection = url.searchParams.get('collection')?.trim() ?? '';
  const entryId = url.searchParams.get('entryId')?.trim() ?? '';

  if (!collection) {
    return createJsonErrorResponse(400, ['查询参数缺少 collection'], [{ path: 'collection', message: '查询参数缺少 collection' }]);
  }

  if (!isAdminContentCollectionKey(collection)) {
    return createJsonErrorResponse(
      400,
      [`不支持的 content collection：${collection}；仅支持 ${ADMIN_CONTENT_COLLECTION_KEYS.join(' / ')}`],
      [{ path: 'collection', message: `不支持的 content collection：${collection}` }]
    );
  }

  if (!isAdminContentEntryWriteCollectionKey(collection)) {
    const message = getAdminContentReadOnlyReason(collection) ?? `当前 collection 暂不支持写盘：${collection}`;
    return createJsonErrorResponse(
      400,
      [message],
      [{ path: 'collection', message }]
    );
  }

  if (!entryId) {
    return createJsonErrorResponse(400, ['查询参数缺少 entryId'], [{ path: 'entryId', message: '查询参数缺少 entryId' }]);
  }

  try {
    const payload = await readAdminContentEntryEditorPayload(collection, entryId);
    return new Response(JSON.stringify({ ok: true, payload }, null, 2), {
      headers: JSON_HEADERS
    });
  } catch (error) {
    const errorResponse = createEntryResolutionErrorResponse(error);
    if (errorResponse) return errorResponse;
    throw error;
  }
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!import.meta.env.DEV && !process.env.VITEST) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  const requestError = validateAdminJsonWriteRequest(request, url, 'Content Console entry');
  if (requestError) {
    return createJsonErrorResponse(requestError.status, [requestError.error]);
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 JSON 字符串'
  });
  if (!bodyResult.ok) {
    return createJsonErrorResponse(bodyResult.status, [bodyResult.error]);
  }

  const { collection, entryId, revision, frontmatterInput, bodyInput, errors, issues } = extractWriteInput(bodyResult.body);
  if (errors.length > 0 || !collection || !entryId || !revision) {
    return createJsonErrorResponse(400, errors, issues);
  }

  const isDryRun = isAdminDryRunRequest(url);

  return withAdminContentWriteLock(async () => {
    let currentPayload: Awaited<ReturnType<typeof readAdminContentEntryEditorPayload>>;
    let currentState: Awaited<ReturnType<typeof loadAdminContentSourceState>>;
    try {
      currentState = await loadAdminContentSourceState(collection, entryId);
      currentPayload = buildAdminContentEntryEditorPayloadFromState(currentState);
    } catch (error) {
      const errorResponse = createEntryResolutionErrorResponse(error);
      if (errorResponse) return errorResponse;
      throw error;
    }

    if (currentPayload.revision !== revision) {
      return createRevisionConflictResponse(currentPayload);
    }

    let plan: Awaited<ReturnType<typeof buildAdminContentWritePlanFromState>>;
    try {
      plan = await buildAdminContentWritePlanFromState(currentState, frontmatterInput, bodyInput);
    } catch (error) {
      const errorResponse = createEntryResolutionErrorResponse(error);
      if (errorResponse) return errorResponse;
      throw error;
    }

    if (plan.issues.length > 0) {
      return createJsonErrorResponse(400, Array.from(new Set(plan.issues.map((issue) => issue.message))), plan.issues);
    }

    const result = {
      changed: plan.changedFields.length > 0,
      written: false,
      changedFields: plan.changedFields,
      relativePath: currentPayload.relativePath
    };

    if (isDryRun) {
      return new Response(JSON.stringify({ ok: true, dryRun: true, result }, null, 2), {
        headers: JSON_HEADERS
      });
    }

    if (plan.changedFields.length === 0) {
      return new Response(JSON.stringify({ ok: true, result, payload: currentPayload }, null, 2), {
        headers: JSON_HEADERS
      });
    }

    try {
      const nextSourceText = applyAdminContentWritePlan(plan.state, plan.patches, plan.bodyText);
      await persistAdminFileTransaction([
        {
          id: 'entry',
          filePath: plan.state.sourcePath,
          content: nextSourceText
        }
      ], {
        beforeWrite: async () => {
          const latestPayloadBeforeWrite = await readAdminContentEntryEditorPayload(collection, entryId);
          if (latestPayloadBeforeWrite.revision !== revision) {
            throw new AdminContentRevisionConflictError(latestPayloadBeforeWrite);
          }
        }
      });
      const latestPayload = await readAdminContentEntryEditorPayload(collection, entryId);

      return new Response(
        JSON.stringify(
          {
            ok: true,
            result: {
              ...result,
              written: true
            },
            payload: latestPayload
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      if (error instanceof AdminContentRevisionConflictError) {
        return createRevisionConflictResponse(error.latestPayload);
      }

      console.error('[astro-whono] Failed to persist admin content entry:', error);
      return new Response(
        JSON.stringify(
          {
            ok: false,
            errors: ['写入内容文件失败，请检查本地文件权限或日志'],
            result
          },
          null,
          2
        ),
        { status: 500, headers: JSON_HEADERS }
      );
    }
  });
};
