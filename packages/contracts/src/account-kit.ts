import { z } from 'zod';

import {
  accountKeySchema,
  deploymentFingerprintSchema,
  isoDatetimeSchema,
  serverUrlSchema,
  usernameSchema,
} from './shared';

export const AccountKitPayloadSchema = z
  .object({
    version: z.literal('account-kit.v1'),
    serverUrl: serverUrlSchema,
    username: usernameSchema,
    accountKey: accountKeySchema,
    deploymentFingerprint: deploymentFingerprintSchema,
    issuedAt: isoDatetimeSchema,
  })
  .strict();

export type AccountKitPayload = z.infer<typeof AccountKitPayloadSchema>;
