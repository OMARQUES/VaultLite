export const CANONICAL_AUTH_STATES = [
  'remote authentication',
  'local unlock',
  'session restoration',
] as const;

export type CanonicalAuthState = (typeof CANONICAL_AUTH_STATES)[number];

export function isCanonicalAuthState(value: string): value is CanonicalAuthState {
  return CANONICAL_AUTH_STATES.includes(value as CanonicalAuthState);
}
