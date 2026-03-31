import { describe, expect, test } from 'vitest';

import {
  resolveAttachmentSectionState,
  resolveFolderSectionState,
} from '../popup-detail-sections.js';

describe('popup detail supplementary sections', () => {
  test('shows assigned folder name in view mode and keeps creation disabled', () => {
    expect(
      resolveFolderSectionState({
        detailPanelMode: 'view',
        itemId: 'item_1',
        folders: [{ folderId: 'folder_family', name: 'Family' }],
        assignments: [{ itemId: 'item_1', folderId: 'folder_family' }],
      }),
    ).toEqual({
      visible: true,
      editable: false,
      canCreateFolder: false,
      selectedFolderId: 'folder_family',
      selectedFolderName: 'Family',
    });
  });

  test('keeps editor folder selection editable and create-enabled in edit mode', () => {
    expect(
      resolveFolderSectionState({
        detailPanelMode: 'edit',
        itemId: 'item_1',
        draftFolderId: 'folder_finance',
        folders: [{ folderId: 'folder_finance', name: 'Finance' }],
        assignments: [{ itemId: 'item_1', folderId: 'folder_family' }],
      }),
    ).toEqual({
      visible: true,
      editable: true,
      canCreateFolder: true,
      selectedFolderId: 'folder_finance',
      selectedFolderName: 'Finance',
    });
  });

  test('merges existing and queued attachments in edit mode', () => {
    const state = resolveAttachmentSectionState({
      detailPanelMode: 'edit',
      existingAttachments: [
        {
          uploadId: 'upload_1',
          fileName: 'statement.pdf',
          lifecycleState: 'attached',
          contentType: 'application/pdf',
          size: 1024,
        },
      ],
      pendingAttachments: [
        {
          id: 'pending_1',
          fileName: 'photo.png',
          contentType: 'image/png',
          size: 2048,
        },
      ],
    });

    expect(state.visible).toBe(true);
    expect(state.editable).toBe(true);
    expect(state.canAddAttachments).toBe(true);
    expect(state.rows).toEqual([
      {
        id: 'upload_1',
        kind: 'existing',
        fileName: 'statement.pdf',
        subtitle: 'application/pdf · 1 KB · Attached',
        removable: false,
      },
      {
        id: 'pending_1',
        kind: 'pending',
        fileName: 'photo.png',
        subtitle: 'image/png · 2 KB · Queued',
        removable: true,
      },
    ]);
  });

  test('keeps attachments visible in view mode without add action', () => {
    const state = resolveAttachmentSectionState({
      detailPanelMode: 'view',
      existingAttachments: [
        {
          uploadId: 'upload_1',
          fileName: 'statement.pdf',
          lifecycleState: 'attached',
          contentType: 'application/pdf',
          size: 1024,
        },
      ],
    });

    expect(state.visible).toBe(true);
    expect(state.editable).toBe(false);
    expect(state.canAddAttachments).toBe(false);
    expect(state.rows).toHaveLength(1);
  });
});
