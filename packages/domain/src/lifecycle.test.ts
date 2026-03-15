import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_LIFECYCLE_STATES,
  USER_LIFECYCLE_STATES,
  canTransitionAttachmentLifecycle,
  canTransitionUserLifecycle,
  isCanonicalAuthState,
} from './index';

describe('domain lifecycle rules', () => {
  it('exposes canonical user lifecycle states', () => {
    expect(USER_LIFECYCLE_STATES).toEqual(['active', 'suspended', 'deprovisioned']);
  });

  it('allows only approved user lifecycle transitions', () => {
    expect(canTransitionUserLifecycle('active', 'suspended')).toBe(true);
    expect(canTransitionUserLifecycle('suspended', 'active')).toBe(true);
    expect(canTransitionUserLifecycle('active', 'deprovisioned')).toBe(true);
    expect(canTransitionUserLifecycle('deprovisioned', 'active')).toBe(false);
  });

  it('exposes canonical attachment lifecycle states', () => {
    expect(ATTACHMENT_LIFECYCLE_STATES).toEqual(['pending', 'uploaded', 'attached', 'deleted', 'orphaned']);
  });

  it('enforces attachment lifecycle ordering', () => {
    expect(canTransitionAttachmentLifecycle('pending', 'uploaded')).toBe(true);
    expect(canTransitionAttachmentLifecycle('uploaded', 'attached')).toBe(true);
    expect(canTransitionAttachmentLifecycle('pending', 'attached')).toBe(false);
    expect(canTransitionAttachmentLifecycle('deleted', 'attached')).toBe(false);
  });

  it('recognizes only canonical auth-state names', () => {
    expect(isCanonicalAuthState('remote authentication')).toBe(true);
    expect(isCanonicalAuthState('local unlock')).toBe(true);
    expect(isCanonicalAuthState('session restoration')).toBe(true);
    expect(isCanonicalAuthState('login')).toBe(false);
  });
});
