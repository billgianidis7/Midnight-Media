import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CloudUpload,
  Clock,
  Heart,
  MessageSquare,
  Pause,
  Play,
  Scissors,
  Send,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteAlbumComment,
  deleteTrackComment,
  postAlbumComment,
  postTrackComment,
  subscribeAlbumComments,
  subscribeTrackComments,
} from '../lib/firestoreRepo';
import {
  Album,
  AlbumComment,
  formatDuration,
  Track,
  TrackComment,
} from '../types/music';
import { ConfirmDialog } from './ConfirmDialog';
import { CoverImage } from './CoverImage';

interface AlbumDetailDrawerProps {
  album: Album | null;
  tracks: Track[];
  initialTrackId?: string | null;
  user: User | null;
  playingTrackId: string | null;
  isPlaying: boolean;
  currentTimeSec: number;
  likedTrackIds: Set<string>;
  getLikeCount: (track: Track) => number;
  onToggleLike: (track: Track) => void;
  onClose: () => void;
  onPlayTrack: (track: Track) => void;
  onOpenWaveform: (track: Track) => void;
  onOpenShare: (album: Album, track?: Track) => void;
  onBackupTrackToDrive: (track: Track) => Promise<void>;
  onBackupAlbumArchive: (album: Album, tracks: Track[]) => Promise<void>;
}

export function AlbumDetailDrawer({
  album,
  tracks,
  initialTrackId,
  user,
  playingTrackId,
  isPlaying,
  currentTimeSec,
  likedTrackIds,
  getLikeCount,
  onToggleLike,
  onClose,
  onPlayTrack,
  onOpenWaveform,
  onOpenShare,
  onBackupTrackToDrive,
  onBackupAlbumArchive,
}: AlbumDetailDrawerProps) {
  const [commentScope, setCommentScope] = useState<'album' | 'track'>(
    initialTrackId ? 'track' : 'album'
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    initialTrackId || tracks[0]?.id || ''
  );

  const [albumComments, setAlbumComments] = useState<AlbumComment[]>([]);
  const [trackComments, setTrackComments] = useState<TrackComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [pinTimestamp, setPinTimestamp] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    scope: 'album' | 'track';
    commentId: string;
  } | null>(null);

  const albumId = album?.id ?? '';
  const firstTrackId = tracks[0]?.id ?? '';

  useEffect(() => {
    if (!albumId) return;
    if (initialTrackId) {
      setCommentScope('track');
      setSelectedTrackId(initialTrackId);
    } else {
      setCommentScope('album');
      setSelectedTrackId(firstTrackId);
    }
  }, [albumId, initialTrackId, firstTrackId]);

  useEffect(() => {
    if (!albumId) return;
    const unsub = subscribeAlbumComments(albumId, setAlbumComments);
    return () => unsub();
  }, [albumId]);

  useEffect(() => {
    if (!selectedTrackId) {
      setTrackComments((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const unsub = subscribeTrackComments(selectedTrackId, setTrackComments);
    return () => unsub();
  }, [selectedTrackId]);

  if (!album) return null;

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  const isAuthenticated = Boolean(user);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || !user) return;

    setPostingComment(true);
    try {
      if (commentScope === 'album') {
        await postAlbumComment(user, album.id, trimmed);
      } else if (selectedTrack) {
        const tsLabel =
          pinTimestamp && playingTrackId === selectedTrack.id
            ? formatDuration(currentTimeSec)
            : '';
        await postTrackComment(user, selectedTrack.id, trimmed, tsLabel);
      }
      setCommentText('');
      setPinTimestamp(false);
    } finally {
      setPostingComment(false);
    }
  };

  const handleConfirmDeleteComment = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.scope === 'album') {
      await deleteAlbumComment(album.id, deleteTarget.commentId);
    } else if (selectedTrack) {
      await deleteTrackComment(selectedTrack.id, deleteTarget.commentId);
    }
    setDeleteTarget(null);
  };

  const activeComments = commentScope === 'album' ? albumComments : trackComments;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-drawer-title"
    >
      <div className="w-full max-w-3xl h-full bg-[#0a0a0e] border-l border-white/15 overflow-y-auto p-6 md:p-8 space-y-8">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
            Album Release &amp; Listener Discussion
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 cursor-pointer"
            aria-label="Close Album Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Album Header Split */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
          <div className="sm:col-span-5 aspect-square bg-[#121217] border border-white/15 overflow-hidden">
            <CoverImage
              src={album.coverUrl}
              alt={album.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="sm:col-span-7 space-y-4">
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                {album.releaseType} · {album.year} · {tracks.length}{' '}
                {tracks.length === 1 ? 'Track' : 'Tracks'}
              </p>
              <h2
                id="album-drawer-title"
                className="font-display text-3xl font-bold text-white tracking-tight"
              >
                {album.title}
              </h2>
              <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">
                {album.artist}
              </p>
            </div>

            {album.commentary && (
              <p className="text-sm text-zinc-300 leading-relaxed">{album.commentary}</p>
            )}

            {album.tags && album.tags.length > 0 && (
              <p className="text-xs text-zinc-500">{album.tags.join(' · ')}</p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {tracks[0] && (
                <button
                  type="button"
                  onClick={() => onPlayTrack(tracks[0])}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 flex items-center gap-2 cursor-pointer"
                >
                  {playingTrackId === tracks[0].id && isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {playingTrackId === tracks[0].id && isPlaying ? 'Pause' : 'Play Album'}
                </button>
              )}

              {tracks[0] && (
                <button
                  type="button"
                  onClick={() => onToggleLike(tracks[0])}
                  className={`px-3.5 py-2 text-xs font-medium uppercase tracking-wider border flex items-center gap-1.5 cursor-pointer transition-colors ${
                    likedTrackIds.has(tracks[0].id)
                      ? 'border-red-500/70 bg-red-500/15 text-red-400'
                      : 'border-white/20 hover:border-white/50 text-zinc-200'
                  }`}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      likedTrackIds.has(tracks[0].id) ? 'fill-red-500 text-red-500' : ''
                    }`}
                  />
                  <span className="font-mono tabular-nums">{getLikeCount(tracks[0])}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenShare(album)}
                className="px-3.5 py-2 text-xs font-medium uppercase tracking-wider border border-white/20 hover:border-white/50 text-zinc-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share Album
              </button>

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => onBackupAlbumArchive(album, tracks)}
                  className="px-3.5 py-2 text-xs font-medium uppercase tracking-wider border border-white/20 hover:border-white/50 text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  Drive Backup
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tracklist Feed */}
        <div className="space-y-3 border-t border-white/10 pt-6">
          <h3 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
            Tracks &amp; Artist Notes
          </h3>
          <div className="divide-y divide-white/10 border-t border-b border-white/10">
            {tracks.map((trk, idx) => {
              const active = playingTrackId === trk.id;
              const isLiked = likedTrackIds.has(trk.id);
              const likeTotal = getLikeCount(trk);

              return (
                <div key={trk.id} className="py-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => onPlayTrack(trk)}
                        className={`w-8 h-8 flex items-center justify-center border shrink-0 cursor-pointer transition-colors ${
                          active && isPlaying
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'border-white/20 text-white hover:border-white'
                        }`}
                        aria-label={active && isPlaying ? `Pause ${trk.title}` : `Play ${trk.title}`}
                      >
                        {active && isPlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <span className="font-mono text-xs text-zinc-500 tabular-nums w-6">
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      <div className="min-w-0">
                        <p className="font-display text-sm font-semibold text-white truncate">
                          {trk.title}
                        </p>
                        <p className="font-mono text-[11px] text-zinc-500 tabular-nums">
                          {formatDuration(trk.durationSec)} · Reel {formatDuration(trk.snippetStartSec)}–
                          {formatDuration(trk.snippetEndSec)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleLike(trk)}
                        className={`px-2.5 py-1.5 text-[11px] font-mono tabular-nums border flex items-center gap-1.5 cursor-pointer transition-colors ${
                          isLiked
                            ? 'border-red-500/60 bg-red-500/15 text-red-400'
                            : 'border-white/15 hover:border-white/45 text-zinc-300'
                        }`}
                        aria-label={`Like ${trk.title}`}
                      >
                        <Heart className={`w-3 h-3 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                        {likeTotal}
                      </button>

                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => onOpenWaveform(trk)}
                          className="px-2.5 py-1.5 text-[11px] uppercase tracking-wider border border-white/15 hover:border-white/45 text-zinc-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title="Open Waveform Reel Studio"
                        >
                          <Scissors className="w-3 h-3 text-red-400" />
                          Trim Reel
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setCommentScope('track');
                          setSelectedTrackId(trk.id);
                        }}
                        className={`px-2.5 py-1.5 text-[11px] uppercase tracking-wider border flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                          commentScope === 'track' && selectedTrackId === trk.id
                            ? 'border-white bg-white text-black font-semibold'
                            : 'border-white/15 hover:border-white/45 text-zinc-200'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        Comments
                      </button>

                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => onBackupTrackToDrive(trk)}
                          className="p-1.5 border border-white/15 hover:border-white/45 text-zinc-300 hover:text-white cursor-pointer"
                          title="Back up track audio to Google Drive"
                          aria-label={`Back up ${trk.title} to Drive`}
                        >
                          <CloudUpload className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenShare(album, trk)}
                        className="p-1.5 border border-white/15 hover:border-white/45 text-zinc-300 hover:text-white cursor-pointer"
                        title="Share track"
                        aria-label={`Share ${trk.title}`}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {trk.commentary && (
                    <p className="text-xs text-zinc-400 leading-relaxed pl-11">
                      {trk.commentary}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Listener Comments Section (Album or Individual Track) */}
        <div className="space-y-4 pt-2 pb-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
              Listener Comments
            </h3>

            <div className="flex items-center border border-white/15">
              <button
                type="button"
                onClick={() => setCommentScope('album')}
                className={`px-3 py-1.5 text-[11px] uppercase tracking-wider cursor-pointer ${
                  commentScope === 'album'
                    ? 'bg-white text-black font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Entire Album ({albumComments.length})
              </button>
              <button
                type="button"
                onClick={() => setCommentScope('track')}
                className={`px-3 py-1.5 text-[11px] uppercase tracking-wider cursor-pointer ${
                  commentScope === 'track'
                    ? 'bg-white text-black font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Individual Track ({trackComments.length})
              </button>
            </div>
          </div>

          {commentScope === 'track' && tracks.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 shrink-0">
                Track:
              </label>
              <select
                value={selectedTrack?.id || ''}
                onChange={(e) => setSelectedTrackId(e.target.value)}
                className="flex-1 bg-[#0e0e13] border border-white/15 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
              >
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({formatDuration(t.durationSec)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {user ? (
            <form onSubmit={handlePostComment} className="space-y-2.5">
              <textarea
                rows={2}
                maxLength={1000}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={
                  commentScope === 'album'
                    ? `Leave a comment on "${album.title}"...`
                    : `Leave a comment on "${selectedTrack?.title || 'this track'}"...`
                }
                className="w-full bg-[#08080b] border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {commentScope === 'track' && selectedTrack && playingTrackId === selectedTrack.id ? (
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pinTimestamp}
                      onChange={(e) => setPinTimestamp(e.target.checked)}
                      className="accent-red-500"
                    />
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-mono tabular-nums">
                      Tag @{formatDuration(currentTimeSec)}
                    </span>
                  </label>
                ) : (
                  <span className="text-[11px] text-zinc-500">
                    Posting as {user.displayName || user.email}
                  </span>
                )}

                <button
                  type="submit"
                  disabled={postingComment || !commentText.trim()}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {postingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-zinc-500 border border-white/10 bg-[#08080b] p-4">
              Public listener view — press the Like button on any track above, or share this release.
            </p>
          )}

          {/* Comments List */}
          <div className="space-y-3 pt-2">
            {activeComments.length === 0 ? (
              <p className="text-xs text-zinc-500 border border-white/10 bg-[#08080b] p-4">
                No comments yet on {commentScope === 'album' ? 'this album' : 'this track'}.
              </p>
            ) : (
              activeComments.map((c) => {
                const tsLabel = 'timestampLabel' in c ? c.timestampLabel : '';
                const canDelete =
                  user && (c.authorUid === user.uid || album.authorUid === user.uid);

                return (
                  <div
                    key={c.id}
                    className="border border-white/10 bg-[#08080b] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-white">{c.authorName}</span>
                        {tsLabel && (
                          <span className="font-mono text-[11px] text-red-400 tabular-nums">
                            @{tsLabel}
                          </span>
                        )}
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ scope: commentScope, commentId: c.id })
                          }
                          className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{c.body}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Comment"
        description="Are you sure you want to permanently remove this comment? This action cannot be undone."
        confirmLabel="Delete Comment"
        onConfirm={handleConfirmDeleteComment}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
