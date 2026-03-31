function normalizeFolderLookup(folders) {
  const entries = Array.isArray(folders) ? folders : [];
  return new Map(
    entries
      .filter((entry) => entry && typeof entry.folderId === 'string' && typeof entry.name === 'string')
      .map((entry) => [entry.folderId, entry.name]),
  );
}

function assignedFolderIdForItem(itemId, assignments) {
  if (typeof itemId !== 'string' || itemId.length === 0 || !Array.isArray(assignments)) {
    return '';
  }
  const entry = assignments.find((candidate) => candidate?.itemId === itemId) ?? null;
  return typeof entry?.folderId === 'string' ? entry.folderId : '';
}

function formatAttachmentSize(bytes) {
  const size = Number.isFinite(Number(bytes)) ? Number(bytes) : 0;
  if (size < 1024) {
    return `${size} B`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function attachmentStateLabel(state) {
  if (state === 'attached') {
    return 'Attached';
  }
  if (state === 'uploaded') {
    return 'Uploaded';
  }
  if (state === 'pending') {
    return 'Pending upload';
  }
  if (state === 'deleted') {
    return 'Deleted';
  }
  if (state === 'orphaned') {
    return 'Orphaned';
  }
  return 'Attachment';
}

export function resolveFolderSectionState(input = {}) {
  const mode = typeof input.detailPanelMode === 'string' ? input.detailPanelMode : 'view';
  const itemId = typeof input.itemId === 'string' ? input.itemId : '';
  const editable = mode === 'create' || mode === 'edit';
  const visible = mode !== 'history' && (editable || itemId.length > 0);
  const folderNamesById = normalizeFolderLookup(input.folders);
  const assignedFolderId = assignedFolderIdForItem(itemId, input.assignments);
  const selectedFolderId =
    editable && typeof input.draftFolderId === 'string' ? input.draftFolderId : assignedFolderId;
  return {
    visible,
    editable,
    canCreateFolder: editable,
    selectedFolderId,
    selectedFolderName: folderNamesById.get(selectedFolderId) ?? 'No folder',
  };
}

export function resolveAttachmentSectionState(input = {}) {
  const mode = typeof input.detailPanelMode === 'string' ? input.detailPanelMode : 'view';
  const editable = mode === 'create' || mode === 'edit';
  const existingRows = (Array.isArray(input.existingAttachments) ? input.existingAttachments : []).map((entry) => ({
    id: typeof entry?.uploadId === 'string' ? entry.uploadId : '',
    kind: 'existing',
    fileName:
      typeof entry?.fileName === 'string' && entry.fileName.trim().length > 0 ? entry.fileName.trim() : 'Attachment',
    subtitle: `${typeof entry?.contentType === 'string' ? entry.contentType : 'application/octet-stream'} · ${formatAttachmentSize(entry?.size)} · ${attachmentStateLabel(entry?.lifecycleState)}`,
    removable: false,
  }));
  const pendingRows = (Array.isArray(input.pendingAttachments) ? input.pendingAttachments : []).map((entry) => ({
    id: typeof entry?.id === 'string' ? entry.id : '',
    kind: 'pending',
    fileName:
      typeof entry?.fileName === 'string' && entry.fileName.trim().length > 0 ? entry.fileName.trim() : 'Attachment',
    subtitle: `${typeof entry?.contentType === 'string' ? entry.contentType : 'application/octet-stream'} · ${formatAttachmentSize(entry?.size)} · Queued`,
    removable: true,
  }));
  const rows = [...existingRows, ...pendingRows].filter((entry) => entry.id.length > 0);
  return {
    visible: mode !== 'history',
    editable,
    canAddAttachments: editable,
    rows,
  };
}
