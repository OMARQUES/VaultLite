import { createProxyHandler } from '../_utils/proxy.js';

export const onRequest = createProxyHandler({ prefix: '/api' });
