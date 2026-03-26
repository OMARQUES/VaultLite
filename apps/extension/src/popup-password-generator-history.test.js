import { describe, expect, test } from 'vitest';

import {
  addGeneratorHistoryEntry,
  filterGeneratorHistoryEntries,
  groupGeneratorHistoryByDay,
} from '../popup-password-generator-history.js';

describe('popup password generator history', () => {
  test('adds entries in reverse chronological order with size limit', () => {
    const initial = [
      { id: 'old', createdAt: 1, password: 'a', pageUrl: 'https://a.test', pageHost: 'a.test' },
      { id: 'newer', createdAt: 2, password: 'b', pageUrl: 'https://b.test', pageHost: 'b.test' },
    ];
    const next = addGeneratorHistoryEntry(
      initial,
      { id: 'newest', createdAt: 3, password: 'c', pageUrl: 'https://c.test', pageHost: 'c.test' },
      2,
    );
    expect(next.map((entry) => entry.id)).toEqual(['newest', 'newer']);
  });

  test('filters by host and full url', () => {
    const entries = [
      { id: '1', createdAt: 1, password: 'a', pageUrl: 'https://web.whatsapp.com/chat', pageHost: 'web.whatsapp.com' },
      { id: '2', createdAt: 2, password: 'b', pageUrl: 'https://mail.google.com', pageHost: 'mail.google.com' },
    ];
    expect(filterGeneratorHistoryEntries(entries, 'whatsapp').map((entry) => entry.id)).toEqual(['1']);
    expect(filterGeneratorHistoryEntries(entries, 'google.com').map((entry) => entry.id)).toEqual(['2']);
  });

  test('groups entries by local day key while preserving order', () => {
    const entries = [
      { id: '3', createdAt: new Date('2026-03-25T18:20:00.000Z').getTime(), password: 'a', pageUrl: '', pageHost: '' },
      { id: '2', createdAt: new Date('2026-03-25T12:20:00.000Z').getTime(), password: 'b', pageUrl: '', pageHost: '' },
      { id: '1', createdAt: new Date('2026-03-24T12:20:00.000Z').getTime(), password: 'c', pageUrl: '', pageHost: '' },
    ];
    const grouped = groupGeneratorHistoryByDay(entries);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].entries.map((entry) => entry.id)).toEqual(['3', '2']);
    expect(grouped[1].entries.map((entry) => entry.id)).toEqual(['1']);
  });
});

