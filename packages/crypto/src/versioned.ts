export function assertSupportedVersion(version: string, supportedVersions: readonly string[]): void {
  if (!supportedVersions.includes(version)) {
    throw new Error(`Unsupported version: ${version}`);
  }
}
