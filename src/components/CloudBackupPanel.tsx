import { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Cloud,
  CloudUpload,
  Download,
  ExternalLink,
  FolderCheck,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { CloudBackupRecord } from '../types/music';
import { ConfirmDialog } from './ConfirmDialog';
import { GoogleSignInButton } from './GoogleSignInButton';

interface CloudBackupPanelProps {
  user: User | null;
  hasDriveToken: boolean;
  driveFolderId: string | null;
  backups: CloudBackupRecord[];
  isSyncing: boolean;
  onSignIn: () => Promise<void>;
  onBackupFullCatalog: () => Promise<void>;
  onRefreshDriveFiles: () => Promise<void>;
  onDownloadBackup: (record: CloudBackupRecord) => Promise<void>;
  onDeleteBackup: (record: CloudBackupRecord) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const KIND_LABELS: Record<CloudBackupRecord['kind'], string> = {
  audio_master: 'Audio Master',
  reel_snippet: 'WAV Snippet',
  reel_video: 'Reel Video',
  album_archive: 'Catalog Archive',
};

export function CloudBackupPanel({
  user,
  hasDriveToken,
  driveFolderId,
  backups,
  isSyncing,
  onSignIn,
  onBackupFullCatalog,
  onRefreshDriveFiles,
  onDownloadBackup,
  onDeleteBackup,
}: CloudBackupPanelProps) {
  const [confirmTarget, setConfirmTarget] = useState<CloudBackupRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      await onDeleteBackup(confirmTarget);
      setConfirmTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section
      id="cloud-backup-section"
      className="border border-white/10 bg-[#0b0b0f] p-6 md:p-8 space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
            Google Drive Cloud Storage
          </p>
          <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2.5">
            <Cloud className="w-5 h-5 text-red-500" />
            Cloud File Backup &amp; Archive
          </h2>
          <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Back up master audio uploads, trimmed lossless WAV snippets, rendered social Reel videos, and album commentary archives to a dedicated <span className="text-zinc-200">00:00 Studio Backups</span> folder in your Google Drive.
          </p>
        </div>

        {!user || !hasDriveToken ? (
          <GoogleSignInButton
            onClick={onSignIn}
            label={user ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onRefreshDriveFiles}
              disabled={isSyncing}
              className="px-3.5 py-2 text-xs font-medium uppercase tracking-wider border border-white/15 hover:border-white/40 text-zinc-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Drive
            </button>
            <button
              type="button"
              onClick={onBackupFullCatalog}
              disabled={isSyncing}
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              Back Up Catalog Archive
            </button>
          </div>
        )}
      </div>

      {user && hasDriveToken && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-[#08080b] px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5 text-zinc-300">
            <FolderCheck className="w-4 h-4 text-zinc-400" />
            <span>
              Drive Folder: <strong className="text-white">00:00 Studio Backups</strong>
              {driveFolderId ? ` · ID ${driveFolderId.slice(0, 10)}...` : ''}
            </span>
          </div>
          <span className="font-mono text-zinc-400 tabular-nums">
            {backups.length} {backups.length === 1 ? 'File' : 'Files'} Backed Up
          </span>
        </div>
      )}

      {!user ? (
        <div className="border border-white/10 bg-[#08080b] p-6 text-xs text-zinc-400">
          Connect your Google account above to inspect and manage your cloud audio backups in Google Drive.
        </div>
      ) : backups.length === 0 ? (
        <div className="border border-white/10 bg-[#08080b] p-6 text-xs text-zinc-400">
          No cloud backups indexed yet. Click &ldquo;Back Up Catalog Archive&rdquo; above or back up any track or WAV/Reel export directly from the feed or Waveform Studio.
        </div>
      ) : (
        <div className="divide-y divide-white/10 border-t border-b border-white/10">
          {backups.map((rec) => (
            <div
              key={rec.id}
              className="py-3.5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-display text-sm font-semibold text-white truncate">
                  {rec.fileName}
                </p>
                <p className="text-xs text-zinc-400 font-mono tabular-nums">
                  {KIND_LABELS[rec.kind]} · {formatBytes(rec.sizeBytes)} · {rec.mimeType}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onDownloadBackup(rec)}
                  disabled={!hasDriveToken}
                  className="px-3 py-1.5 text-[11px] uppercase tracking-wider border border-white/15 hover:border-white/45 text-zinc-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                {rec.driveWebViewLink && (
                  <a
                    href={rec.driveWebViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-[11px] uppercase tracking-wider border border-white/15 hover:border-white/45 text-zinc-200 flex items-center gap-1"
                  >
                    Drive <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmTarget(rec)}
                  disabled={!hasDriveToken}
                  className="p-1.5 border border-white/15 hover:border-red-500/60 text-zinc-400 hover:text-red-400 cursor-pointer disabled:opacity-40"
                  aria-label={`Delete ${rec.fileName} from Google Drive`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Delete Backup from Google Drive"
        description={
          confirmTarget
            ? `Delete "${confirmTarget.fileName}" from your 00:00 Studio Backups folder in Google Drive and remove its backup index? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete from Drive"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </section>
  );
}
