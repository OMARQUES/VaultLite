import { describe, expect, test } from 'vitest';

import { domainsForRealtimeTopic } from './realtime-client';

describe('domainsForRealtimeTopic', () => {
  test('maps icons.manual.* to manual and state domains', () => {
    expect(domainsForRealtimeTopic('icons.manual.upserted')).toEqual(['icons_manual', 'icons_state']);
  });

  test('maps icons.state.* to icons_state only', () => {
    expect(domainsForRealtimeTopic('icons.state.updated')).toEqual(['icons_state']);
  });

  test('maps password history and attachment topics to their own domains', () => {
    expect(domainsForRealtimeTopic('password_history.upserted')).toEqual(['password_history']);
    expect(domainsForRealtimeTopic('vault.attachment.created')).toEqual(['attachments']);
  });

  test('returns null for unrelated topics', () => {
    expect(domainsForRealtimeTopic('vault.item.updated')).toBeNull();
  });
});
