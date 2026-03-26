import { describe, expect, test } from 'vitest';

import {
  createDefaultGeneratorState,
  generatePassword,
  normalizeGeneratorState,
} from '../popup-password-generator.js';

describe('popup password generator', () => {
  test('uses smart password defaults', () => {
    expect(createDefaultGeneratorState()).toEqual({
      mode: 'smart',
      useAsDefaultSuggestion: false,
      randomLength: 20,
      randomIncludeNumbers: true,
      randomIncludeSymbols: true,
      pinLength: 5,
    });
  });

  test('normalizes out-of-range settings safely', () => {
    expect(
      normalizeGeneratorState({
        mode: 'invalid',
        useAsDefaultSuggestion: 'yes',
        randomLength: 999,
        randomIncludeNumbers: false,
        randomIncludeSymbols: false,
        pinLength: 0,
      }),
    ).toEqual({
      mode: 'smart',
      useAsDefaultSuggestion: false,
      randomLength: 64,
      randomIncludeNumbers: false,
      randomIncludeSymbols: false,
      pinLength: 4,
    });
  });

  test('generates smart password with required character groups', () => {
    const password = generatePassword({
      mode: 'smart',
      randomLength: 24,
      randomIncludeNumbers: true,
      randomIncludeSymbols: true,
      pinLength: 5,
      useAsDefaultSuggestion: false,
    });
    expect(password).toHaveLength(24);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()[\]{}\-_=+;:,.?]/.test(password)).toBe(true);
  });

  test('generates random password honoring toggles', () => {
    const password = generatePassword({
      mode: 'random',
      randomLength: 18,
      randomIncludeNumbers: false,
      randomIncludeSymbols: false,
      pinLength: 5,
      useAsDefaultSuggestion: false,
    });
    expect(password).toHaveLength(18);
    expect(/^[A-Za-z]+$/.test(password)).toBe(true);
  });

  test('generates pin code with digits only', () => {
    const password = generatePassword({
      mode: 'pin',
      randomLength: 20,
      randomIncludeNumbers: true,
      randomIncludeSymbols: true,
      pinLength: 6,
      useAsDefaultSuggestion: false,
    });
    expect(password).toHaveLength(6);
    expect(/^[0-9]+$/.test(password)).toBe(true);
  });
});

