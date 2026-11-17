import { useEffect, useState } from 'react';
import {
  Disc3,
  Edit3,
  ImagePlus,
  Music,
  Plus,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import { saveLocalImageBlob } from '../lib/localAudioStore';
import { Album, formatDuration, ReleaseType, Track, Visibility } from '../types/music';
import { ConfirmDialog } from './ConfirmDialog';
import { CoverImage } from './CoverImage';

interface CreatorUploadsManagerProps {
  albums: Album[];
  tracks: Track[];
  onOpenUpload: () => void;
  onOpenWaveform: (track: Track) => void;
  onUpdateAlbum: (
    album: Album,
    updates: {
      title: string;
      artist: string;
      releaseType: ReleaseType;
      year: string;
      commentary: string;
      coverUrl: string;
      tags: string[];
      visibility: Visibility;
    }
  ) => Promise<void>;
  onDeleteAlbum: (album: Album) => Promise<void>;
  onUpdateTrack: (
    track: Track,
    updates: {
      title: string;
      artist: string;
      releaseType: ReleaseType;
      year: string;
      commentary: string;
      coverUrl: string;
      visibility: Visibility;
    }
  ) => Promise<void>;
  onDeleteTrack: (track: Track) => Promise<void>;
  onClearAllUploads: () => Promise<void>;
}

export function CreatorUploadsManager({
  albums,
  tracks,
  onOpenUpload,
  onOpenWaveform,
  onUpdateAlbum,
  onDeleteAlbum,
  onUpdateTrack,
  onDeleteTrack,
  onClearAllUploads,
}: CreatorUploadsManagerProps) {
  const [viewTab, setViewTab] = useState<'tracks' | 'albums'>('tracks');

  // Edit Track modal state
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [trkTitle, setTrkTitle] = useState('');
  const [trkArtist, setTrkArtist] = useState('');
  const [trkType, setTrkType] = useState<ReleaseType>('Album');
  const [trkYear, setTrkYear] = useState('');
  const [trkCommentary, setTrkCommentary] = useState('');
  const [trkVisibility, setTrkVisibility] = useState<Visibility>('public');
  const [trkCoverUrl, setTrkCoverUrl] = useState('');
  const [trkImageFile, setTrkImageFile] = useState<File | null>(null);
  const [trkImagePreview, setTrkImagePreview] = useState<string | null>(null);

  // Edit Album modal state
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [albTitle, setAlbTitle] = useState('');
  const [albArtist, setAlbArtist] = useState('');
  const [albType, setAlbType] = useState<ReleaseType>('Album');
  const [albYear, setAlbYear] = useState('');
  const [albTags, setAlbTags] = useState('');
  const [albCommentary, setAlbCommentary] = useState('');
  const [albVisibility, setAlbVisibility] = useState<Visibility>('public');
  const [albCoverUrl, setAlbCoverUrl] = useState('');
  const [albImageFile, setAlbImageFile] = useState<File | null>(null);
  const [albImagePreview, setAlbImagePreview] = useState<string | null>(null);

  const [savingEdit, setSavingEdit] = useState(false);

  // Confirm delete state
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'track'; track: Track }
    | { type: 'album'; album: Album }
    | { type: 'clear_all' }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    return () => {
      if (trkImagePreview) URL.revokeObjectURL(trkImagePreview);
    };
  }, [trkImagePreview]);

  useEffect(() => {
    return () => {
      if (albImagePreview) URL.revokeObjectURL(albImagePreview);
    };
  }, [albImagePreview]);

  const openTrackEditor = (trk: Track) => {
    setEditingTrack(trk);
    setTrkTitle(trk.title);
    setTrkArtist(trk.artist);
    setTrkType(trk.releaseType);
    setTrkYear(trk.year);
    setTrkCommentary(trk.commentary);
    setTrkVisibility(trk.visibility);
    setTrkCoverUrl(trk.coverUrl);
    setTrkImageFile(null);
    setTrkImagePreview(null);
  };

  const openAlbumEditor = (alb: Album) => {
    setEditingAlbum(alb);
    setAlbTitle(alb.title);
    setAlbArtist(alb.artist);
    setAlbType(alb.releaseType);
    setAlbYear(alb.year);
    setAlbTags(alb.tags.join(', '));
    setAlbCommentary(alb.commentary);
    setAlbVisibility(alb.visibility);
    setAlbCoverUrl(alb.coverUrl);
    setAlbImageFile(null);
    setAlbImagePreview(null);
  };

  const handleSaveTrackEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack) return;
    setSavingEdit(true);
    try {
      let nextCover = trkCoverUrl;
      if (trkImageFile) {
        const localImgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        nextCover = await saveLocalImageBlob(localImgId, trkImageFile);
      }
      await onUpdateTrack(editingTrack, {
        title: trkTitle,
        artist: trkArtist,
        releaseType: trkType,
        year: trkYear,
        commentary: trkCommentary,
        coverUrl: nextCover,
        visibility: trkVisibility,
      });
      setEditingTrack(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveAlbumEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlbum) return;
    setSavingEdit(true);
    try {
      let nextCover = albCoverUrl;
      if (albImageFile) {
        const localImgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        nextCover = await saveLocalImageBlob(localImgId, albImageFile);
      }
      await onUpdateAlbum(editingAlbum, {
        title: albTitle,
        artist: albArtist,
        releaseType: albType,
        year: albYear,
        commentary: albCommentary,
        coverUrl: nextCover,
        tags: albTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        visibility: albVisibility,
      });
      setEditingAlbum(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === 'track') {
        await onDeleteTrack(confirmDelete.track);
      } else if (confirmDelete.type === 'album') {
        await onDeleteAlbum(confirmDelete.album);
      } else {
        await onClearAllUploads();
      }
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section
      id="manage-uploads-section"
      className="border border-white/10 bg-[#0b0b0f] p-6 md:p-8 space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
            Account Library Management
          </p>
          <h2 className="font-display text-2xl font-bold text-white">
            Manage Past Uploads
          </h2>
          <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Edit titles, liner notes, cover artwork, visibility, or permanently remove past tracks and albums from your feed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex border border-white/15">
            <button
              type="button"
              onClick={() => setViewTab('tracks')}
              className={`px-3 py-2 text-[11px] uppercase tracking-wider cursor-pointer ${
                viewTab === 'tracks'
                  ? 'bg-white text-black font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Tracks ({tracks.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('albums')}
              className={`px-3 py-2 text-[11px] uppercase tracking-wider cursor-pointer ${
                viewTab === 'albums'
                  ? 'bg-white text-black font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Albums ({albums.length})
            </button>
          </div>

          {(tracks.length > 0 || albums.length > 0) && (
            <button
              type="button"
              onClick={() => setConfirmDelete({ type: 'clear_all' })}
              className="px-3.5 py-2 text-xs font-medium uppercase tracking-wider border border-red-500/40 text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          )}

          <button
            type="button"
            onClick={onOpenUpload}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Release
          </button>
        </div>
      </div>

      {viewTab === 'tracks' ? (
        tracks.length === 0 ? (
          <div className="border border-white/10 bg-[#08080b] p-6 text-xs text-zinc-400 flex flex-wrap items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2">
              <Music className="w-4 h-4 text-zinc-500" />
              Your track library is currently a blank canvas.
            </span>
            <button
              type="button"
              onClick={onOpenUpload}
              className="text-xs uppercase tracking-wider text-white hover:text-red-400 cursor-pointer"
            >
              Post your first track
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/10 border-t border-b border-white/10">
            {tracks.map((trk) => (
              <div
                key={trk.id}
                className="py-3.5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <CoverImage
                    src={trk.coverUrl}
                    alt={trk.title}
                    className="w-12 h-12 object-cover border border-white/15 shrink-0"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-display text-sm font-semibold text-white truncate">
                        {trk.title}
                      </p>
                      <span className="text-[11px] uppercase tracking-wider text-zinc-500 shrink-0">
                        {trk.visibility}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      {trk.albumTitle} · {trk.releaseType} · {trk.year} ·{' '}
                      <span className="font-mono tabular-nums">{formatDuration(trk.durationSec)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenWaveform(trk)}
                    className="px-3 py-1.5 text-[11px] uppercase tracking-wider border border-white/15 hover:border-red-500/60 text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Scissors className="w-3 h-3 text-red-400" />
                    Trim
                  </button>
                  <button
                    type="button"
                    onClick={() => openTrackEditor(trk)}
                    className="px-3 py-1.5 text-[11px] uppercase tracking-wider border border-white/15 hover:border-white/45 text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ type: 'track', track: trk })}
                    className="p-1.5 border border-white/15 hover:border-red-500/60 text-zinc-400 hover:text-red-400 cursor-pointer"
                    aria-label={`Delete ${trk.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : albums.length === 0 ? (
        <div className="border border-white/10 bg-[#08080b] p-6 text-xs text-zinc-400 flex flex-wrap items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2">
            <Disc3 className="w-4 h-4 text-zinc-500" />
            No albums created yet.
          </span>
          <button
            type="button"
            onClick={onOpenUpload}
            className="text-xs uppercase tracking-wider text-white hover:text-red-400 cursor-pointer"
          >
            Create an album
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/10 border-t border-b border-white/10">
          {albums.map((alb) => (
            <div
              key={alb.id}
              className="py-3.5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <CoverImage
                  src={alb.coverUrl}
                  alt={alb.title}
                  className="w-12 h-12 object-cover border border-white/15 shrink-0"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-display text-sm font-semibold text-white truncate">
                      {alb.title}
                    </p>
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500 shrink-0">
                      {alb.visibility}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate">
                    {alb.artist} · {alb.releaseType} · {alb.year} ·{' '}
                    <span className="font-mono tabular-nums">{alb.trackCount}</span>{' '}
                    {alb.trackCount === 1 ? 'track' : 'tracks'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openAlbumEditor(alb)}
                  className="px-3 py-1.5 text-[11px] uppercase tracking-wider border border-white/15 hover:border-white/45 text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ type: 'album', album: alb })}
                  className="p-1.5 border border-white/15 hover:border-red-500/60 text-zinc-400 hover:text-red-400 cursor-pointer"
                  aria-label={`Delete album ${alb.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Track Modal */}
      {editingTrack && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-track-title"
        >
          <div className="w-full max-w-lg border border-white/15 bg-[#0b0b0f] p-6 space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 id="edit-track-title" className="font-display text-lg font-bold text-white">
                Edit Track Upload
              </h3>
              <button
                type="button"
                onClick={() => setEditingTrack(null)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTrackEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Track Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={trkTitle}
                    onChange={(e) => setTrkTitle(e.target.value)}
                    className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Artist
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={trkArtist}
                    onChange={(e) => setTrkArtist(e.target.value)}
                    className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Format
                  </label>
                  <select
                    value={trkType}
                    onChange={(e) => setTrkType(e.target.value as ReleaseType)}
                    className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  >
                    <option value="Album">Album</option>
                    <option value="Single">Single</option>
                    <option value="EP">EP</option>
                    <option value="Remix">Remix</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                      Year
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      pattern="\d{4}"
                      value={trkYear}
                      onChange={(e) => setTrkYear(e.target.value)}
                      className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                      Visibility
                    </label>
                    <select
                      value={trkVisibility}
                      onChange={(e) => setTrkVisibility(e.target.value as Visibility)}
                      className="w-full bg-[#08080b] border border-white/15 px-2 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
                  Replace Cover Image
                </label>
                <div className="flex items-center gap-3 border border-white/15 bg-[#08080b] p-2.5">
                  {trkImagePreview ? (
                    <img
                      src={trkImagePreview}
                      alt="New track cover"
                      className="w-12 h-12 object-cover border border-white/15 shrink-0"
                    />
                  ) : (
                    <CoverImage
                      src={trkCoverUrl}
                      alt={trkTitle}
                      className="w-12 h-12 object-cover border border-white/15 shrink-0"
                    />
                  )}
                  <label className="px-3 py-1.5 border border-white/20 hover:border-white/45 text-[11px] uppercase tracking-wider text-white inline-flex items-center gap-1.5 cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload New Image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (trkImagePreview) URL.revokeObjectURL(trkImagePreview);
                        setTrkImageFile(f);
                        setTrkImagePreview(URL.createObjectURL(f));
                      }}
                    />
                  </label>
                  {(trkCoverUrl || trkImageFile) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (trkImagePreview) URL.revokeObjectURL(trkImagePreview);
                        setTrkImageFile(null);
                        setTrkImagePreview(null);
                        setTrkCoverUrl('');
                      }}
                      className="text-[11px] uppercase tracking-wider text-zinc-400 hover:text-red-400 cursor-pointer"
                    >
                      Clear Image
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                  Written Commentary
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={trkCommentary}
                  onChange={(e) => setTrkCommentary(e.target.value)}
                  className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingTrack(null)}
                  className="px-4 py-2 text-xs uppercase tracking-wider text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Album Modal */}
      {editingAlbum && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-album-title"
        >
          <div className="w-full max-w-lg border border-white/15 bg-[#0b0b0f] p-6 space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 id="edit-album-title" className="font-display text-lg font-bold text-white">
                Edit Album Release
              </h3>
              <button
                type="button"
                onClick={() => setEditingAlbum(null)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAlbumEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Album Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={albTitle}
                    onChange={(e) => setAlbTitle(e.target.value)}
                    className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Artist
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={albArtist}
                    onChange={(e) => setAlbArtist(e.target.value)}
                    className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Format
                  </label>
                  <select
                    value={albType}
                    onChange={(e) => setAlbType(e.target.value as ReleaseType)}
                    className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  >
                    <option value="Album">Album</option>
                    <option value="Single">Single</option>
                    <option value="EP">EP</option>
                    <option value="Remix">Remix</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                      Year
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      pattern="\d{4}"
                      value={albYear}
                      onChange={(e) => setAlbYear(e.target.value)}
                      className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                      Visibility
                    </label>
                    <select
                      value={albVisibility}
                      onChange={(e) => setAlbVisibility(e.target.value as Visibility)}
                      className="w-full bg-[#08080b] border border-white/15 px-2 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={albTags}
                    onChange={(e) => setAlbTags(e.target.value)}
                    className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
                  Replace Album Cover Image
                </label>
                <div className="flex items-center gap-3 border border-white/15 bg-[#08080b] p-2.5">
                  {albImagePreview ? (
                    <img
                      src={albImagePreview}
                      alt="New album cover"
                      className="w-12 h-12 object-cover border border-white/15 shrink-0"
                    />
                  ) : (
                    <CoverImage
                      src={albCoverUrl}
                      alt={albTitle}
                      className="w-12 h-12 object-cover border border-white/15 shrink-0"
                    />
                  )}
                  <label className="px-3 py-1.5 border border-white/20 hover:border-white/45 text-[11px] uppercase tracking-wider text-white inline-flex items-center gap-1.5 cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload New Image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (albImagePreview) URL.revokeObjectURL(albImagePreview);
                        setAlbImageFile(f);
                        setAlbImagePreview(URL.createObjectURL(f));
                      }}
                    />
                  </label>
                  {(albCoverUrl || albImageFile) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (albImagePreview) URL.revokeObjectURL(albImagePreview);
                        setAlbImageFile(null);
                        setAlbImagePreview(null);
                        setAlbCoverUrl('');
                      }}
                      className="text-[11px] uppercase tracking-wider text-zinc-400 hover:text-red-400 cursor-pointer"
                    >
                      Clear Image
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                  Album Liner Notes
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={albCommentary}
                  onChange={(e) => setAlbCommentary(e.target.value)}
                  className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingAlbum(null)}
                  className="px-4 py-2 text-xs uppercase tracking-wider text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Album'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.type === 'album'
            ? 'Delete Album & Tracks'
            : confirmDelete?.type === 'track'
            ? 'Delete Track'
            : 'Clear All Uploaded Releases'
        }
        description={
          confirmDelete?.type === 'album'
            ? `Permanently delete "${confirmDelete.album.title}" and all tracks inside this album from the feed? This action cannot be undone.`
            : confirmDelete?.type === 'track'
            ? `Permanently delete "${confirmDelete.track.title}" from the feed? This action cannot be undone.`
            : `Permanently delete all ${albums.length} album(s), ${tracks.length} track(s), and local audio/image files to reset to a blank canvas? This action cannot be undone.`
        }
        confirmLabel={
          confirmDelete?.type === 'clear_all' ? 'Clear Everything' : 'Delete Permanently'
        }
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  );
}
