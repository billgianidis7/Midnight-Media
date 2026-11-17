export type ReleaseType = 'Album' | 'Single' | 'EP' | 'Remix';
export type Visibility = 'public' | 'private';
export type AudioSourceType = 'synth' | 'local_idb' | 'drive';
export type BackupKind = 'audio_master' | 'reel_snippet' | 'reel_video' | 'album_archive';

export interface Album {
  id: string;
  title: string;
  artist: string;
  releaseType: ReleaseType;
  year: string;
  commentary: string;
  coverUrl: string;
  tags: string[];
  visibility: Visibility;
  authorUid: string;
  authorName: string;
  trackCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  isSeed?: boolean;
}

export interface Track {
  id: string;
  albumId: string;
  albumTitle: string;
  title: string;
  artist: string;
  releaseType: ReleaseType;
  year: string;
  commentary: string;
  coverUrl: string;
  durationSec: number;
  snippetStartSec: number;
  snippetEndSec: number;
  waveformPeaks: number[];
  audioSourceType: AudioSourceType;
  synthPreset: string;
  localFileId: string;
  driveFileId: string;
  driveWebViewLink: string;
  likeCount?: number;
  visibility: Visibility;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  isSeed?: boolean;
}

export interface AlbumComment {
  id: string;
  albumId: string;
  body: string;
  visibility: 'public';
  authorUid: string;
  authorName: string;
  authorPhotoUrl: string;
  createdAt?: unknown;
  createdAtMs?: number;
}

export interface TrackComment {
  id: string;
  trackId: string;
  timestampLabel: string;
  body: string;
  visibility: 'public';
  authorUid: string;
  authorName: string;
  authorPhotoUrl: string;
  createdAt?: unknown;
  createdAtMs?: number;
}

export interface CloudBackupRecord {
  id: string;
  ownerUid: string;
  trackId: string;
  albumId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: BackupKind;
  driveFileId: string;
  driveWebViewLink: string;
  createdAt?: unknown;
  createdAtMs?: number;
}

export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const YEAR_PATTERN = /^\d{4}$/;

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export function clampString(val: string, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

export function clampPeaks(peaks: number[]): number[] {
  return peaks
    .slice(0, 128)
    .map((p) => Math.max(2, Math.min(100, Math.round(Number.isFinite(p) ? p : 20))));
}

export function clampTags(tags: string[]): string[] {
  return tags
    .map((t) => clampString(t, 32))
    .filter(Boolean)
    .slice(0, 5);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatPreciseTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}
