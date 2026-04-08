export function sameLocalUnlockKdfProfile(leftProfile, rightProfile) {
  if (!leftProfile || !rightProfile) {
    return false;
  }
  const leftTagLength = Number.isFinite(leftProfile.tagLength)
    ? Math.trunc(Number(leftProfile.tagLength))
    : Number.isFinite(leftProfile.dkLen)
      ? Math.trunc(Number(leftProfile.dkLen))
      : 32;
  const rightTagLength = Number.isFinite(rightProfile.tagLength)
    ? Math.trunc(Number(rightProfile.tagLength))
    : Number.isFinite(rightProfile.dkLen)
      ? Math.trunc(Number(rightProfile.dkLen))
      : 32;
  return (
    Math.trunc(Number(leftProfile.memory)) === Math.trunc(Number(rightProfile.memory)) &&
    Math.trunc(Number(leftProfile.passes)) === Math.trunc(Number(rightProfile.passes)) &&
    Math.trunc(Number(leftProfile.parallelism)) === Math.trunc(Number(rightProfile.parallelism)) &&
    leftTagLength === rightTagLength
  );
}

export function shouldRewriteLocalUnlockEnvelope({
  currentProfile,
  nextProfile,
  envelopeHasProfile,
}) {
  if (!envelopeHasProfile) {
    return true;
  }
  if (!currentProfile || !nextProfile) {
    return false;
  }
  return !sameLocalUnlockKdfProfile(currentProfile, nextProfile);
}

export function shouldScheduleLocalUnlockEnvelopeMaintenance({ trustedState, password }) {
  return Boolean(
    trustedState?.localUnlockEnvelope &&
      typeof password === 'string' &&
      password.length > 0,
  );
}
