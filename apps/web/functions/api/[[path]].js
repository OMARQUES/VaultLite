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

function normalizePath(path) {
  if (Array.isArray(path)) {
    return path.filter((segment) => segment.length > 0).join('/');
  }
  return typeof path === 'string' ? path : '';
}

export async function onRequest(context) {
  let apiOrigin;
  try {
    apiOrigin = getApiOrigin(context.env);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid_api_origin';
    return Response.json(
      {
        code: 'api_proxy_misconfigured',
        reasonCode: reason,
        message: 'API proxy is not configured.',
      },
      { status: 500 },
    );
  }

  const incomingUrl = new URL(context.request.url);
  const normalizedPath = normalizePath(context.params.path);
  const upstreamUrl = new URL(`/api/${normalizedPath}`, apiOrigin);
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

  return fetch(upstreamRequest);
}
