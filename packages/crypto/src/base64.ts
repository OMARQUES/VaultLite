export function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

export function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
