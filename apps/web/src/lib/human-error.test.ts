import { describe, expect, test } from 'vitest';

import { toHumanErrorMessage } from './human-error';

describe('toHumanErrorMessage', () => {
  test('maps proxy misconfiguration error code', () => {
    expect(toHumanErrorMessage(new Error('Request failed with status 500 (api_proxy_misconfigured)'))).toBe(
      'The site could not reach the server configuration. Try again in a moment.',
    );
  });

  test('maps proxy upstream timeout error code', () => {
    expect(toHumanErrorMessage(new Error('Request failed with status 504 (api_proxy_upstream_timeout)'))).toBe(
      'The site could not reach the server. Try again in a moment.',
    );
  });

  test('maps missing Account Kit username to local validation message', () => {
    expect(toHumanErrorMessage(new Error('Account Kit username missing'))).toBe(
      'This Account Kit file is incomplete or invalid.',
    );
  });
});
