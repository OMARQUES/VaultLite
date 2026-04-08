import { describe, expect, test } from 'vitest';

import {
  applyQueriedFormMetadataRecords,
  buildFormMetadataCacheIdentity,
  createEmptyFormMetadataCache,
  findCachedFormMetadataRecord,
  getCachedFormMetadataRecords,
  getStaleFormMetadataOrigins,
  markCachedFormMetadataRecordSuspect,
  shouldUpsertFormMetadataRecord,
  upsertFormMetadataRecordInCache,
} from '../form-metadata-cache.js';

function makeRecord(overrides = {}) {
  return {
    metadataId: 'meta_1',
    ownerUserId: 'user_1',
    itemId: null,
    origin: 'https://accounts.example.com',
    formFingerprint: 'form_fp_1',
    fieldFingerprint: 'field_fp_1',
    frameScope: 'top',
    fieldRole: 'username',
    selectorCss: '#email',
    selectorFallbacks: ['input[name="email"]'],
    autocompleteToken: 'username',
    inputType: 'email',
    fieldName: 'email',
    fieldId: 'email',
    labelTextNormalized: 'email',
    placeholderNormalized: null,
    confidence: 'heuristic',
    selectorStatus: 'active',
    sourceDeviceId: 'device_1',
    createdAt: '2026-04-01T12:00:00.000Z',
    updatedAt: '2026-04-01T12:00:00.000Z',
    lastConfirmedAt: null,
    ...overrides,
  };
}

describe('form metadata cache helpers', () => {
  test('replaces queried origins, filters retired records, and sorts by usefulness', () => {
    const cache = createEmptyFormMetadataCache();
    const next = applyQueriedFormMetadataRecords(cache, {
      identityKey: 'deployment:user_1:device_1',
      origins: ['https://accounts.example.com'],
      records: [
        makeRecord({
          metadataId: 'meta_shared_filled',
          ownerUserId: null,
          confidence: 'filled',
        }),
        makeRecord({
          metadataId: 'meta_user_confirmed',
          ownerUserId: 'user_1',
          itemId: 'item_1',
          fieldFingerprint: 'field_fp_2',
          fieldRole: 'password_current',
          confidence: 'submitted_confirmed',
          updatedAt: '2026-04-01T12:10:00.000Z',
          lastConfirmedAt: '2026-04-01T12:10:00.000Z',
        }),
        makeRecord({
          metadataId: 'meta_retired',
          fieldFingerprint: 'field_fp_3',
          selectorStatus: 'retired',
        }),
      ],
      syncedAt: 123,
    });

    expect(next.identityKey).toBe('deployment:user_1:device_1');
    expect(next.origins['https://accounts.example.com'].syncedAt).toBe(123);
    expect(
      getCachedFormMetadataRecords(next, {
        origins: ['https://accounts.example.com/login'],
        itemId: 'item_1',
        currentUserId: 'user_1',
      }).map((record) => record.metadataId),
    ).toEqual(['meta_user_confirmed', 'meta_shared_filled']);
  });

  test('upserts records by structural key and keeps the newest version', () => {
    let cache = createEmptyFormMetadataCache();
    cache = upsertFormMetadataRecordInCache(cache, makeRecord(), {
      identityKey: 'deployment:user_1:device_1',
      syncedAt: 100,
    });
    cache = upsertFormMetadataRecordInCache(
      cache,
      makeRecord({
        metadataId: 'meta_1',
        selectorCss: 'input[name="email"]',
        updatedAt: '2026-04-01T12:05:00.000Z',
      }),
      {
        identityKey: 'deployment:user_1:device_1',
        syncedAt: 120,
      },
    );

    const records = getCachedFormMetadataRecords(cache, {
      origins: ['https://accounts.example.com'],
      currentUserId: 'user_1',
    });
    expect(records).toHaveLength(1);
    expect(records[0].selectorCss).toBe('input[name="email"]');
    expect(cache.origins['https://accounts.example.com'].syncedAt).toBe(120);
  });

  test('marks a cached selector as suspect without losing its other fields', () => {
    const cache = upsertFormMetadataRecordInCache(createEmptyFormMetadataCache(), makeRecord(), {
      identityKey: 'deployment:user_1:device_1',
      syncedAt: 100,
    });

    const next = markCachedFormMetadataRecordSuspect(cache, {
      identityKey: 'deployment:user_1:device_1',
      origin: 'https://accounts.example.com/login',
      formFingerprint: 'form_fp_1',
      fieldFingerprint: 'field_fp_1',
      fieldRole: 'username',
      itemId: null,
      updatedAt: '2026-04-01T12:06:00.000Z',
      sourceDeviceId: 'device_1',
    });

    expect(next.found).toBe(true);
    expect(next.record?.selectorStatus).toBe('suspect');
    expect(next.record?.selectorCss).toBe('#email');
  });

  test('tracks stale origins independently and scopes cache identity', () => {
    let cache = createEmptyFormMetadataCache();
    cache = applyQueriedFormMetadataRecords(cache, {
      identityKey: 'deployment:user_1:device_1',
      origins: ['https://accounts.example.com'],
      records: [makeRecord()],
      syncedAt: 1_000,
    });

    expect(
      getStaleFormMetadataOrigins(cache, {
        origins: ['https://accounts.example.com', 'https://portal.example.com/login'],
        now: 20_000,
        maxAgeMs: 5_000,
      }),
    ).toEqual(['https://accounts.example.com', 'https://portal.example.com']);

    expect(
      buildFormMetadataCacheIdentity({
        deploymentFingerprint: 'deployment',
        userId: 'user_1',
        username: 'alice',
        deviceId: 'device_1',
      }),
    ).toBe('deployment::user_1::alice::device_1');
  });

  test('skips identical candidates and lower-confidence regressions', () => {
    const cache = upsertFormMetadataRecordInCache(
      createEmptyFormMetadataCache(),
      makeRecord({
        itemId: 'item_1',
        confidence: 'submitted_confirmed',
        lastConfirmedAt: '2026-04-01T12:10:00.000Z',
      }),
      {
        identityKey: 'deployment:user_1:device_1',
        syncedAt: 100,
      },
    );

    expect(
      shouldUpsertFormMetadataRecord(
        cache,
        makeRecord({
          itemId: 'item_1',
          confidence: 'submitted_confirmed',
          lastConfirmedAt: '2026-04-01T12:10:00.000Z',
        }),
      ),
    ).toBe(false);

    expect(
      shouldUpsertFormMetadataRecord(
        cache,
        makeRecord({
          itemId: 'item_1',
          confidence: 'filled',
        }),
      ),
    ).toBe(false);
  });

  test('still allows same-confidence selector changes and selector status transitions', () => {
    const cache = upsertFormMetadataRecordInCache(
      createEmptyFormMetadataCache(),
      makeRecord({
        itemId: 'item_1',
        confidence: 'filled',
      }),
      {
        identityKey: 'deployment:user_1:device_1',
        syncedAt: 100,
      },
    );

    expect(
      shouldUpsertFormMetadataRecord(
        cache,
        makeRecord({
          itemId: 'item_1',
          confidence: 'filled',
          selectorCss: 'input[name="email"]',
        }),
      ),
    ).toBe(true);

    expect(
      shouldUpsertFormMetadataRecord(
        cache,
        makeRecord({
          itemId: 'item_1',
          confidence: 'filled',
          selectorStatus: 'suspect',
        }),
      ),
    ).toBe(true);

    expect(
      findCachedFormMetadataRecord(cache, {
        origin: 'https://accounts.example.com/login',
        formFingerprint: 'form_fp_1',
        fieldFingerprint: 'field_fp_1',
        fieldRole: 'username',
        itemId: 'item_1',
      })?.selectorCss,
    ).toBe('#email');
  });
});
