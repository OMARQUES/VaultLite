const BRIDGE_REQUEST_TYPE = 'vaultlite.bridge.request';
const BRIDGE_RESPONSE_TYPE = 'vaultlite.bridge.response';
const BRIDGE_PROTOCOL_VERSION = 1;
const BRIDGE_WEB_SOURCE = 'vaultlite-webapp';
const BRIDGE_EXTENSION_SOURCE = 'vaultlite-extension-bridge';
const BRIDGE_READY_FLAG = '__vaultliteAutoPairBridgeInitialized';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeRequestId(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function parseBridgeRequest(value) {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type !== BRIDGE_REQUEST_TYPE || value.version !== BRIDGE_PROTOCOL_VERSION) {
    return null;
  }
  if (value.source !== BRIDGE_WEB_SOURCE) {
    return null;
  }
  if (!isSafeRequestId(value.requestId)) {
    return null;
  }
  if (
    value.action !== 'bridge.ping' &&
    value.action !== 'link.poll' &&
    value.action !== 'popup.open'
  ) {
    return null;
  }
  if (value.action === 'bridge.ping') {
    return {
      requestId: value.requestId,
      action: 'bridge.ping',
    };
  }
  if (value.action === 'link.poll') {
    const payload = value.payload;
    if (!isRecord(payload) || typeof payload.requestId !== 'string' || payload.requestId.length < 8) {
      return null;
    }
    return {
      requestId: value.requestId,
      action: 'link.poll',
      linkRequestId: payload.requestId,
    };
  }
  if (value.action === 'popup.open') {
    return {
      requestId: value.requestId,
      action: 'popup.open',
    };
  }
  return null;
}

function sendBridgeResponse(input) {
  const response = {
    type: BRIDGE_RESPONSE_TYPE,
    version: BRIDGE_PROTOCOL_VERSION,
    source: BRIDGE_EXTENSION_SOURCE,
    requestId: input.requestId,
    ok: input.ok === true,
    ...(typeof input.code === 'string' ? { code: input.code } : {}),
    ...(typeof input.message === 'string' ? { message: input.message } : {}),
  };
  window.postMessage(response, window.location.origin);
}

if (!globalThis[BRIDGE_READY_FLAG]) {
  globalThis[BRIDGE_READY_FLAG] = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }
    if (event.origin !== window.location.origin) {
      return;
    }
    const parsed = parseBridgeRequest(event.data);
    if (!parsed) {
      return;
    }
    const command =
      parsed.action === 'bridge.ping'
        ? {
            type: 'vaultlite.bridge_ping',
            requestId: parsed.requestId,
          }
        : parsed.action === 'link.poll'
          ? {
              type: 'vaultlite.bridge_poll_link_pairing',
              requestId: parsed.linkRequestId,
            }
          : {
              type: 'vaultlite.bridge_open_popup',
            };
    void chrome.runtime
      .sendMessage(command)
      .then((response) => {
        if (!response || typeof response.ok !== 'boolean') {
          sendBridgeResponse({
            requestId: parsed.requestId,
            ok: false,
            code: 'invalid_extension_response',
            message: 'Extension bridge failed.',
          });
          return;
        }
        sendBridgeResponse({
          requestId: parsed.requestId,
          ok: response.ok,
          code: typeof response.code === 'string' ? response.code : undefined,
          message: typeof response.message === 'string' ? response.message : undefined,
        });
      })
      .catch(() => {
        sendBridgeResponse({
          requestId: parsed.requestId,
          ok: false,
          code: 'background_unavailable',
          message: 'Extension background is unavailable.',
        });
      });
  });
}
