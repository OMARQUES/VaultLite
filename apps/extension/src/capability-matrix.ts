export type ExtensionContext = 'background' | 'popup' | 'options' | 'full_page_auth' | 'content_script';

export const CAPABILITY_MATRIX: Record<ExtensionContext, readonly string[]> = {
  background: [
    'session:read',
    'session:write',
    'vault:decrypt-ephemeral',
    'fill:authorize',
    'fill:dispatch',
    'api:request',
  ],
  popup: ['session:read-derived', 'fill:request', 'search:query'],
  options: ['config:server-url', 'config:reset-trusted-state'],
  full_page_auth: ['pairing:lts', 'unlock:local', 'auth:remote'],
  content_script: ['fill:execute-once', 'form_metadata:signal'],
};

export function contextHasCapability(context: ExtensionContext, capability: string): boolean {
  return CAPABILITY_MATRIX[context].includes(capability);
}
