function getApiOrigin(env) {
  const raw = env?.VAULTLITE_API_ORIGIN?.trim();
  if (!raw) {
    throw new Error('missing_api_origin');
  }

  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') {
    throw new Error('invalid_api_origin_protocol');
  }

  return parsed;
}

const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

function jsonError(status, code, reasonCode, message) {
  return Response.json(
    {
      code,
      reasonCode,
      message,
    },
    { status },
  );
}

function isRecursiveApiOrigin(apiOrigin, requestUrl) {
  return apiOrigin.origin === requestUrl.origin;
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort('upstream_timeout');
  }, timeoutMs);

  const upstreamRequest = new Request(request, {
    signal: controller.signal,
  });

  try {
    return await fetch(upstreamRequest);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizePath(path) {
  if (Array.isArray(path)) {
    return path.filter((segment) => segment.length > 0).join('/');
  }
  return typeof path === 'string' ? path : '';
}

export function createProxyHandler(input) {
  const prefix = typeof input?.prefix === 'string' ? input.prefix.trim() : '';
  const timeoutMs =
    Number.isFinite(Number(input?.timeoutMs)) && Number(input.timeoutMs) > 0
      ? Math.trunc(Number(input.timeoutMs))
      : DEFAULT_UPSTREAM_TIMEOUT_MS;
  if (!prefix.startsWith('/')) {
    throw new Error('invalid_proxy_prefix');
  }

  return async function onRequest(context) {
    let apiOrigin;
    const incomingUrl = new URL(context.request.url);

    try {
      apiOrigin = getApiOrigin(context.env);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid_api_origin';
      return jsonError(500, 'api_proxy_misconfigured', reason, 'API proxy is not configured.');
    }

    if (isRecursiveApiOrigin(apiOrigin, incomingUrl)) {
      return jsonError(
        500,
        'api_proxy_misconfigured',
        'recursive_api_origin',
        'API proxy points back to Pages origin.',
      );
    }

    const normalizedPath = normalizePath(context.params.path);
    const upstreamUrl = new URL(`${prefix}/${normalizedPath}`.replace(/\/+$/u, ''), apiOrigin);
    upstreamUrl.search = incomingUrl.search;

    const outgoingHeaders = new Headers(context.request.headers);
    outgoingHeaders.delete('host');

    const upstreamRequest = new Request(upstreamUrl.toString(), {
      method: context.request.method,
      headers: outgoingHeaders,
      body:
        context.request.method === 'GET' || context.request.method === 'HEAD'
          ? undefined
          : context.request.body,
      redirect: 'follow',
    });

    try {
      return await fetchWithTimeout(upstreamRequest, timeoutMs);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return jsonError(
          504,
          'api_proxy_upstream_timeout',
          'upstream_timeout',
          'API upstream timed out.',
        );
      }

      return jsonError(
        502,
        'api_proxy_upstream_failed',
        'upstream_request_failed',
        'API upstream request failed.',
      );
    }
  };
}
