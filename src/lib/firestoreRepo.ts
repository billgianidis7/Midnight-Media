import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  clearAllLocalMediaStores,
  deleteLocalAudioBlob,
  deleteLocalImageBlob,
} from './localAudioStore';
import {
  Album,
  AlbumComment,
  clampPeaks,
  clampString,
  clampTags,
  CloudBackupRecord,
  sanitizeId,
  Track,
  TrackComment,
  Visibility,
} from '../types/music';

export function subscribePublicAlbums(
  userUid: string | null,
  onData: (albums: Album[]) => void
) {
  const q = query(
    collection(db, 'albums'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Album);
      onData(items);
    },
    (err) => {
      if (userUid) {
        handleFirestoreError(err, OperationType.LIST, 'albums');
      } else {
        console.warn('Public albums listener notice:', err.message);
      }
    }
  );
}

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

export function subscribeUserOwnedAlbums(
  userUid: string,
  onData: (albums: Album[]) => void
) {
  const q = query(
    collection(db, 'albums'),
    where('authorUid', '==', userUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as Album)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'albums');
    }
  );
}

export function subscribePublicTracks(
  userUid: string | null,
  onData: (tracks: Track[]) => void
) {
  const q = query(
    collection(db, 'tracks'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Track);
      onData(items);
    },
    (err) => {
      if (userUid) {
        handleFirestoreError(err, OperationType.LIST, 'tracks');
      } else {
        console.warn('Public tracks listener notice:', err.message);
      }
    }
  );
}

export function subscribeUserOwnedTracks(
  userUid: string,
  onData: (tracks: Track[]) => void
) {
  const q = query(
    collection(db, 'tracks'),
    where('authorUid', '==', userUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as Track)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'tracks');
    }
  );
}

export function subscribeAlbumComments(
  albumId: string,
  onData: (comments: AlbumComment[]) => void
) {
  const path = `albums/${albumId}/comments`;
  const q = query(
    collection(db, 'albums', albumId, 'comments'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as AlbumComment));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeTrackComments(
  trackId: string,
  onData: (comments: TrackComment[]) => void
) {
  const path = `tracks/${trackId}/comments`;
  const q = query(
    collection(db, 'tracks', trackId, 'comments'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as TrackComment));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeUserBackups(
  userId: string,
  onData: (records: CloudBackupRecord[]) => void
) {
  const path = `users/${userId}/backups`;
  const q = query(
    collection(db, 'users', userId, 'backups'),
    where('ownerUid', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as CloudBackupRecord));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function createAlbumInFirestore(
  user: User,
  input: {
    id?: string;
    title: string;
    artist: string;
    releaseType: Album['releaseType'];
    year: string;
    commentary: string;
    coverUrl: string;
    tags: string[];
    trackCount?: number;
  }
): Promise<Album> {
  const albumId = sanitizeId(input.id || `alb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const year = /^\d{4}$/.test(input.year) ? input.year : String(new Date().getFullYear());
  const payload = {
    id: albumId,
    title: clampString(input.title, 120) || 'Untitled Album',
    artist: clampString(input.artist || user.displayName || 'Artist', 80),
    releaseType: input.releaseType,
    year,
    commentary: clampString(input.commentary, 2000),
    coverUrl: clampString(input.coverUrl, 500),
    tags: clampTags(input.tags),
    visibility: 'public' as const,
    authorUid: user.uid,
    authorName: clampString(user.displayName || user.email?.split('@')[0] || 'Creator', 80),
    trackCount: Math.max(0, Math.min(500, Math.round(input.trackCount ?? 0))),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const path = `albums/${albumId}`;
  try {
    await setDoc(doc(db, 'albums', albumId), payload);
    return { ...payload, createdAt: new Date(), updatedAt: new Date() };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateAlbumInFirestore(
  album: Album,
  updates: {
    title: string;
    artist: string;
    releaseType: Album['releaseType'];
    year: string;
    commentary: string;
    coverUrl: string;
    tags: string[];
    visibility: Visibility;
  },
  childTracks: Track[] = []
): Promise<void> {
  const path = `albums/${album.id}`;
  const cleanTitle = clampString(updates.title, 120) || album.title;
  const cleanArtist = clampString(updates.artist, 80) || album.artist;
  const cleanYear = /^\d{4}$/.test(updates.year) ? updates.year : album.year;
  const cleanCover = clampString(updates.coverUrl, 500);

  try {
    await updateDoc(doc(db, 'albums', album.id), {
      title: cleanTitle,
      artist: cleanArtist,
      releaseType: updates.releaseType,
      year: cleanYear,
      commentary: clampString(updates.commentary, 2000),
      coverUrl: cleanCover,
      tags: clampTags(updates.tags),
      visibility: updates.visibility,
      updatedAt: serverTimestamp(),
    });

    if (cleanTitle !== album.title && childTracks.length > 0) {
      for (const trk of childTracks) {
        await updateDoc(doc(db, 'tracks', trk.id), {
          albumTitle: cleanTitle,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteAlbumAndTracksInFirestore(
  album: Album,
  childTracks: Track[]
): Promise<void> {
  try {
    for (const trk of childTracks) {
      await deleteDoc(doc(db, 'tracks', trk.id));
      if (trk.localFileId) {
        await deleteLocalAudioBlob(trk.localFileId).catch(() => {});
      }
      if (trk.coverUrl && trk.coverUrl !== album.coverUrl) {
        await deleteLocalImageBlob(trk.coverUrl).catch(() => {});
      }
    }
    await deleteDoc(doc(db, 'albums', album.id));
    if (album.coverUrl) {
      await deleteLocalImageBlob(album.coverUrl).catch(() => {});
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `albums/${album.id}`);
  }
}

export async function createTrackInFirestore(
  user: User,
  album: Album,
  input: {
    id?: string;
    title: string;
    artist: string;
    releaseType: Track['releaseType'];
    year: string;
    commentary: string;
    coverUrl: string;
    durationSec: number;
    snippetStartSec: number;
    snippetEndSec: number;
    waveformPeaks: number[];
    audioSourceType: Track['audioSourceType'];
    synthPreset: string;
    localFileId: string;
    driveFileId?: string;
    driveWebViewLink?: string;
  }
): Promise<Track> {
  const trackId = sanitizeId(input.id || `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const durationSec = Math.max(1, Math.min(3600, Number(input.durationSec.toFixed(2))));
  const snippetStartSec = Math.max(0, Math.min(durationSec - 0.5, Number(input.snippetStartSec.toFixed(2))));
  const snippetEndSec = Math.max(snippetStartSec, Math.min(durationSec, Number(input.snippetEndSec.toFixed(2))));
  const year = /^\d{4}$/.test(input.year) ? input.year : album.year;

  const payload = {
    id: trackId,
    albumId: album.id,
    albumTitle: clampString(album.title, 120),
    title: clampString(input.title, 120) || 'Untitled Track',
    artist: clampString(input.artist || album.artist, 80),
    releaseType: input.releaseType,
    year,
    commentary: clampString(input.commentary, 2000),
    coverUrl: clampString(input.coverUrl || album.coverUrl, 500),
    durationSec,
    snippetStartSec,
    snippetEndSec,
    waveformPeaks: clampPeaks(input.waveformPeaks),
    audioSourceType: input.audioSourceType,
    synthPreset: clampString(input.synthPreset, 64),
    localFileId: clampString(input.localFileId, 128),
    driveFileId: clampString(input.driveFileId ?? '', 256),
    driveWebViewLink: clampString(input.driveWebViewLink ?? '', 512),
    likeCount: 0,
    visibility: 'public' as const,
    authorUid: user.uid,
    authorName: clampString(user.displayName || user.email?.split('@')[0] || 'Creator', 80),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const path = `tracks/${trackId}`;
  try {
    await setDoc(doc(db, 'tracks', trackId), payload);
    if (album.authorUid === user.uid) {
      await updateDoc(doc(db, 'albums', album.id), {
        trackCount: Math.min(500, (album.trackCount || 0) + 1),
        updatedAt: serverTimestamp(),
      });
    }
    return { ...payload, createdAt: new Date(), updatedAt: new Date() };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateTrackInFirestore(
  track: Track,
  updates: {
    title: string;
    artist: string;
    releaseType: Track['releaseType'];
    year: string;
    commentary: string;
    coverUrl: string;
    visibility: Visibility;
  }
): Promise<void> {
  const path = `tracks/${track.id}`;
  const cleanYear = /^\d{4}$/.test(updates.year) ? updates.year : track.year;
  try {
    await updateDoc(doc(db, 'tracks', track.id), {
      title: clampString(updates.title, 120) || track.title,
      artist: clampString(updates.artist, 80) || track.artist,
      releaseType: updates.releaseType,
      year: cleanYear,
      commentary: clampString(updates.commentary, 2000),
      coverUrl: clampString(updates.coverUrl, 500),
      visibility: updates.visibility,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteTrackInFirestore(
  track: Track,
  parentAlbum?: Album
): Promise<void> {
  const path = `tracks/${track.id}`;
  try {
    await deleteDoc(doc(db, 'tracks', track.id));
    if (track.localFileId) {
      await deleteLocalAudioBlob(track.localFileId).catch(() => {});
    }
    if (parentAlbum && parentAlbum.authorUid === track.authorUid) {
      await updateDoc(doc(db, 'albums', parentAlbum.id), {
        trackCount: Math.max(0, (parentAlbum.trackCount || 1) - 1),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllUserUploadsInFirestore(
  ownedAlbums: Album[],
  ownedTracks: Track[]
): Promise<void> {
  try {
    for (const trk of ownedTracks) {
      await deleteDoc(doc(db, 'tracks', trk.id));
    }
    for (const alb of ownedAlbums) {
      await deleteDoc(doc(db, 'albums', alb.id));
    }
    await clearAllLocalMediaStores().catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'tracks');
  }
}

export async function updateTrackSnippetBounds(
  trackId: string,
  snippetStartSec: number,
  snippetEndSec: number
): Promise<void> {
  const path = `tracks/${trackId}`;
  try {
    await updateDoc(doc(db, 'tracks', trackId), {
      snippetStartSec: Number(snippetStartSec.toFixed(2)),
      snippetEndSec: Number(snippetEndSec.toFixed(2)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateTrackDriveBackupInfo(
  trackId: string,
  driveFileId: string,
  driveWebViewLink: string
): Promise<void> {
  const path = `tracks/${trackId}`;
  try {
    await updateDoc(doc(db, 'tracks', trackId), {
      driveFileId: clampString(driveFileId, 256),
      driveWebViewLink: clampString(driveWebViewLink, 512),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchUserLikedTrackIds(
  userId: string,
  trackIds: string[]
): Promise<Set<string>> {
  const liked = new Set<string>();
  await Promise.all(
    trackIds.map(async (tid) => {
      try {
        const snap = await getDoc(doc(db, 'tracks', tid, 'likes', userId));
        if (snap.exists()) liked.add(tid);
      } catch {
        // ignore read error for individual check
      }
    })
  );
  return liked;
}

export async function toggleTrackLikeInFirestore(
  user: User,
  track: Track,
  currentlyLiked: boolean
): Promise<void> {
  const path = `tracks/${track.id}/likes/${user.uid}`;
  const currentCount = Math.max(0, Math.round(track.likeCount ?? 0));
  const nextCount = currentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1;

  const batch = writeBatch(db);
  const likeRef = doc(db, 'tracks', track.id, 'likes', user.uid);
  const trackRef = doc(db, 'tracks', track.id);

  if (currentlyLiked) {
    batch.delete(likeRef);
  } else {
    batch.set(likeRef, {
      trackId: track.id,
      userId: user.uid,
      createdAt: serverTimestamp(),
    });
  }

  batch.update(trackRef, {
    likeCount: nextCount,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function postAlbumComment(
  user: User,
  albumId: string,
  body: string
): Promise<void> {
  const commentId = sanitizeId(`ac_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `albums/${albumId}/comments/${commentId}`;
  try {
    await setDoc(doc(db, 'albums', albumId, 'comments', commentId), {
      id: commentId,
      albumId,
      body: clampString(body, 1000),
      visibility: 'public',
      authorUid: user.uid,
      authorName: clampString(user.displayName || user.email?.split('@')[0] || 'Listener', 80),
      authorPhotoUrl: clampString(user.photoURL || '', 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function postTrackComment(
  user: User,
  trackId: string,
  body: string,
  timestampLabel = ''
): Promise<void> {
  const commentId = sanitizeId(`tc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `tracks/${trackId}/comments/${commentId}`;
  try {
    await setDoc(doc(db, 'tracks', trackId, 'comments', commentId), {
      id: commentId,
      trackId,
      timestampLabel: clampString(timestampLabel, 16),
      body: clampString(body, 1000),
      visibility: 'public',
      authorUid: user.uid,
      authorName: clampString(user.displayName || user.email?.split('@')[0] || 'Listener', 80),
      authorPhotoUrl: clampString(user.photoURL || '', 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteAlbumComment(albumId: string, commentId: string): Promise<void> {
  const path = `albums/${albumId}/comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'albums', albumId, 'comments', commentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteTrackComment(trackId: string, commentId: string): Promise<void> {
  const path = `tracks/${trackId}/comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'tracks', trackId, 'comments', commentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveUserPrivateProfile(
  user: User,
  driveFolderId: string
): Promise<void> {
  const path = `users/${user.uid}/private/profile`;
  try {
    await setDoc(doc(db, 'users', user.uid, 'private', 'profile'), {
      uid: user.uid,
      email: clampString(user.email || 'user@example.com', 254),
      driveFolderId: clampString(driveFolderId, 256),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveBackupRecord(
  user: User,
  record: Omit<CloudBackupRecord, 'id' | 'ownerUid' | 'createdAt'>
): Promise<CloudBackupRecord> {
  const backupId = sanitizeId(`bak_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `users/${user.uid}/backups/${backupId}`;
  const payload = {
    id: backupId,
    ownerUid: user.uid,
    trackId: clampString(record.trackId, 128),
    albumId: clampString(record.albumId, 128),
    fileName: clampString(record.fileName, 200),
    mimeType: clampString(record.mimeType, 100),
    sizeBytes: Math.max(0, Math.round(record.sizeBytes)),
    kind: record.kind,
    driveFileId: clampString(record.driveFileId, 256),
    driveWebViewLink: clampString(record.driveWebViewLink, 512),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', user.uid, 'backups', backupId), payload);
    return { ...payload, createdAt: new Date() };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteBackupRecord(userId: string, backupId: string): Promise<void> {
  const path = `users/${userId}/backups/${backupId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'backups', backupId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
