export function triggerBlobDownload(input: {
  blob: Blob;
  filename: string;
}) {
  const url = URL.createObjectURL(input.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

export function triggerJsonDownload(input: {
  filename: string;
  value: unknown;
}) {
  const content =
    typeof input.value === 'string' ? input.value : JSON.stringify(input.value, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  triggerBlobDownload({
    blob,
    filename: input.filename,
  });
}
