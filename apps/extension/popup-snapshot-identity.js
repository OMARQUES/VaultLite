function normalizeSignaturePart(value, options = {}) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (options.lowercase === true) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

const DEPLOYMENT_FINGERPRINT_LEGACY_FALLBACK = '__legacy_deployment_fingerprint__';

function parseTrustedIdentitySignature(signature) {
  if (typeof signature !== 'string') {
    return null;
  }
  const parts = signature.split('|');
  if (parts.length !== 4) {
    return null;
  }
  const [serverOrigin, deploymentFingerprint, username, deviceId] = parts;
  if (!serverOrigin || !deploymentFingerprint || !username || !deviceId) {
    return null;
  }
  return {
    serverOrigin,
    deploymentFingerprint,
    username,
    deviceId,
  };
}

export function buildTrustedIdentitySignature(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const serverOrigin = normalizeSignaturePart(input.serverOrigin, { lowercase: true });
  const deploymentFingerprint =
    normalizeSignaturePart(input.deploymentFingerprint) ?? DEPLOYMENT_FINGERPRINT_LEGACY_FALLBACK;
  const username = normalizeSignaturePart(input.username);
  const deviceId = normalizeSignaturePart(input.deviceId);
  if (!serverOrigin || !username || !deviceId) {
    return null;
  }
  return `${serverOrigin}|${deploymentFingerprint}|${username}|${deviceId}`;
}

export function resolveTrustedIdentitySignatureFromState(state) {
  if (!state || typeof state !== 'object' || state.hasTrustedState !== true) {
    return null;
  }
  return buildTrustedIdentitySignature({
    serverOrigin: state.serverOrigin,
    deploymentFingerprint: state.deploymentFingerprint,
    username: state.username,
    deviceId: state.deviceId,
  });
}

export function resolveTrustedIdentitySignatureFromTrustedRecord(trustedRecord) {
  if (!trustedRecord || typeof trustedRecord !== 'object') {
    return null;
  }
  return buildTrustedIdentitySignature({
    serverOrigin: trustedRecord.serverOrigin,
    deploymentFingerprint: trustedRecord.deploymentFingerprint,
    username: trustedRecord.username,
    deviceId: trustedRecord.deviceId,
  });
}

export function resolveTrustedIdentitySignatureFromPersistedPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const explicitSignature = normalizeSignaturePart(payload.trustedIdentitySignature);
  if (explicitSignature) {
    return explicitSignature;
  }
  return buildTrustedIdentitySignature({
    serverOrigin: payload.serverOrigin,
    deploymentFingerprint: payload.deploymentFingerprint,
    username: payload.username,
    deviceId: payload.deviceId,
  });
}

export function isTrustedIdentitySoftMatch(leftSignature, rightSignature) {
  const left = parseTrustedIdentitySignature(leftSignature);
  const right = parseTrustedIdentitySignature(rightSignature);
  if (!left || !right) {
    return false;
  }
  if (
    left.serverOrigin !== right.serverOrigin ||
    left.username !== right.username ||
    left.deviceId !== right.deviceId
  ) {
    return false;
  }
  if (left.deploymentFingerprint === right.deploymentFingerprint) {
    return true;
  }
  return (
    left.deploymentFingerprint === DEPLOYMENT_FINGERPRINT_LEGACY_FALLBACK ||
    right.deploymentFingerprint === DEPLOYMENT_FINGERPRINT_LEGACY_FALLBACK
  );
}
