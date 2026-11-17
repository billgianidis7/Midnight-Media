const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const BACKUP_FOLDER_NAME = '00:00 Studio Backups';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
}

export async function ensureBackupFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(
    `${DRIVE_FILES_API}?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!searchRes.ok) {
    throw new Error(`Drive folder lookup failed (${searchRes.status})`);
  }
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id as string;
  }

  const createRes = await fetch(DRIVE_FILES_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Drive folder creation failed (${createRes.status})`);
  }
  const folder = await createRes.json();
  return folder.id as string;
}

export async function uploadBlobToDrive(
  accessToken: string,
  folderId: string,
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<DriveFileItem> {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType,
  };

  const boundary = `zeromedia_boundary_${Date.now()}`;
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}\r\n`;
  const mediaHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const endBoundary = `\r\n--${boundary}--`;

  const bodyBlob = new Blob([metadataPart, mediaHeader, blob, endBoundary], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBlob,
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive upload failed (${res.status}): ${text.slice(0, 160)}`);
  }
  return (await res.json()) as DriveFileItem;
}

export async function listDriveBackupFiles(
  accessToken: string,
  folderId: string
): Promise<DriveFileItem[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `${DRIVE_FILES_API}?q=${q}&orderBy=createdTime desc&fields=files(id,name,mimeType,size,createdTime,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to list Drive backups (${res.status})`);
  }
  const data = await res.json();
  return (data.files ?? []) as DriveFileItem[];
}

export async function downloadDriveFileBlob(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const res = await fetch(`${DRIVE_FILES_API}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download from Drive (${res.status})`);
  }
  return await res.blob();
}

export async function deleteDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(`${DRIVE_FILES_API}/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete Drive file (${res.status})`);
  }
}
