import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { CloudUpload, Disc3, ImagePlus, Trash2, Upload, X } from 'lucide-react';
import { decodeAudioBlob, renderSynthBuffer, setCachedTrackBuffer } from '../lib/audioEngine';
import { saveLocalAudioBlob, saveLocalImageBlob } from '../lib/localAudioStore';
import { Album, formatDuration, ReleaseType, Track } from '../types/music';

interface UploadPostModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  hasDriveToken: boolean;
  userAlbums: Album[];
  onCreateAlbumAndTrack: (params: {
    mode: 'existing' | 'new';
    existingAlbum?: Album;
    newAlbum?: {
      title: string;
      artist: string;
      releaseType: ReleaseType;
      year: string;
      commentary: string;
      coverUrl: string;
      tags: string[];
    };
    trackInput: {
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
      audioSourceType: Track['audioSourceType'];
      synthPreset: string;
      localFileId: string;
    };
    audioBlob?: Blob;
    audioFileName?: string;
    imageBlob?: Blob;
    imageFileName?: string;
    backupToDrive: boolean;
  }) => Promise<void>;
}

const SYNTH_OPTIONS = [
  { id: 'last_flame', label: 'Warm Analog Ember Pad' },
  { id: 'quieter_sky', label: 'Alpine Storm Resonance' },
  { id: 'between_worlds', label: 'Brutalist Corridor Sweep' },
  { id: 'still_here', label: 'Obsidian Monolith Drone' },
  { id: 'echoes_beyond', label: 'Horizon Chime Soundscape' },
];

export function UploadPostModal({
  open,
  onClose,
  user,
  hasDriveToken,
  userAlbums,
  onCreateAlbumAndTrack,
}: UploadPostModalProps) {
  const [albumMode, setAlbumMode] = useState<'existing' | 'new'>(
    userAlbums.length > 0 ? 'existing' : 'new'
  );
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(
    userAlbums[0]?.id || ''
  );

  // New album fields
  const [albumTitle, setAlbumTitle] = useState('');
  const [albumArtist, setAlbumArtist] = useState(user?.displayName || '00:00');
  const [albumType, setAlbumType] = useState<ReleaseType>('Album');
  const [albumYear, setAlbumYear] = useState(String(new Date().getFullYear()));
  const [albumCommentary, setAlbumCommentary] = useState('');
  const [albumTags, setAlbumTags] = useState('Ambient, Electronic');

  // Track & Artwork fields
  const [trackTitle, setTrackTitle] = useState('');
  const [trackCommentary, setTrackCommentary] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [decodedDuration, setDecodedDuration] = useState<number>(42);
  const [decodedPeaks, setDecodedPeaks] = useState<number[]>([]);
  const [synthPreset, setSynthPreset] = useState('last_flame');
  const [snippetStart, setSnippetStart] = useState(6);
  const [snippetEnd, setSnippetEnd] = useState(21);
  const [backupToDrive, setBackupToDrive] = useState(true);

  const [decoding, setDecoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  if (!open || !user) return null;

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    setDecoding(true);
    try {
      const { durationSec, peaks } = await decodeAudioBlob(file);
      setAudioFile(file);
      setDecodedDuration(durationSec);
      setDecodedPeaks(peaks);
      if (!trackTitle) {
        setTrackTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      }
      setSnippetStart(0);
      setSnippetEnd(Math.min(15, Math.max(2, durationSec)));
    } catch {
      setErrorMsg('Could not decode audio file. Please select a valid MP3, WAV, OGG, or M4A.');
    } finally {
      setDecoding(false);
    }
  };

  const handleImageFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WebP, GIF, or AVIF).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Image file must be 15 MB or smaller.');
      return;
    }
    setErrorMsg(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleClearCustomImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);

    if (!trackTitle.trim()) {
      setErrorMsg('Please enter a track title.');
      return;
    }

    if (albumMode === 'new' && !albumTitle.trim()) {
      setErrorMsg('Please enter an album title.');
      return;
    }

    const existingAlbum = userAlbums.find((a) => a.id === selectedAlbumId) || userAlbums[0];
    if (albumMode === 'existing' && !existingAlbum) {
      setErrorMsg('Please create a new album or select an existing one.');
      return;
    }

    setSubmitting(true);
    try {
      let localFileId = '';
      let finalPeaks = decodedPeaks;
      let finalDuration = decodedDuration;
      let audioSourceType: Track['audioSourceType'] = 'synth';
      let blobToBackup: Blob | undefined;

      if (audioFile) {
        localFileId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await saveLocalAudioBlob(localFileId, audioFile);
        audioSourceType = 'local_idb';
        blobToBackup = audioFile;
      } else {
        const synthBuf = await renderSynthBuffer(synthPreset, 36);
        finalDuration = synthBuf.duration;
        const ch = synthBuf.getChannelData(0);
        const bars = 64;
        const step = Math.floor(ch.length / bars);
        const peaks: number[] = [];
        let maxV = 0.0001;
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j++) {
            sum += ch[j] * ch[j];
          }
          const rms = Math.sqrt(sum / Math.max(1, step));
          peaks.push(rms);
          if (rms > maxV) maxV = rms;
        }
        finalPeaks = peaks.map((v) => Math.max(12, Math.round((v / maxV) * 95)));
        const tempId = `pre_${Date.now()}`;
        setCachedTrackBuffer(tempId, synthBuf);
      }

      let resolvedCoverUrl = albumMode === 'existing' ? existingAlbum!.coverUrl : '';
      if (imageFile) {
        const localImgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        resolvedCoverUrl = await saveLocalImageBlob(localImgId, imageFile);
      }

      const activeCover = resolvedCoverUrl;
      const activeArtist =
        albumMode === 'new'
          ? albumArtist.trim() || user.displayName || '00:00'
          : existingAlbum!.artist;
      const activeType = albumMode === 'new' ? albumType : existingAlbum!.releaseType;
      const activeYear = albumMode === 'new' ? albumYear : existingAlbum!.year;

      await onCreateAlbumAndTrack({
        mode: albumMode,
        existingAlbum: albumMode === 'existing' ? existingAlbum : undefined,
        newAlbum:
          albumMode === 'new'
            ? {
                title: albumTitle.trim(),
                artist: activeArtist,
                releaseType: albumType,
                year: activeYear,
                commentary: albumCommentary.trim() || trackCommentary.trim(),
                coverUrl: activeCover,
                tags: albumTags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              }
            : undefined,
        trackInput: {
          title: trackTitle.trim(),
          artist: activeArtist,
          releaseType: activeType,
          year: activeYear,
          commentary: trackCommentary.trim(),
          coverUrl: activeCover,
          durationSec: finalDuration,
          snippetStartSec: Math.min(snippetStart, finalDuration - 1),
          snippetEndSec: Math.min(finalDuration, Math.max(snippetStart + 1, snippetEnd)),
          waveformPeaks: finalPeaks,
          audioSourceType,
          synthPreset,
          localFileId,
        },
        audioBlob: blobToBackup,
        audioFileName: audioFile?.name,
        imageBlob: imageFile ?? undefined,
        imageFileName: imageFile?.name,
        backupToDrive: backupToDrive && Boolean(blobToBackup || imageFile),
      });

      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to post track.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-post-title"
    >
      <div className="w-full max-w-2xl border border-white/15 bg-[#0b0b0f] p-6 md:p-8 space-y-6 my-auto">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
              Release Feed Studio
            </p>
            <h2 id="upload-post-title" className="font-display text-2xl font-bold text-white mt-1">
              Post Song &amp; Commentary
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 cursor-pointer"
            aria-label="Close Post Track modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Album Selection or Creation */}
          <div className="space-y-3 border border-white/10 bg-[#08080b] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wider font-semibold text-zinc-300 flex items-center gap-2">
                <Disc3 className="w-4 h-4 text-red-500" />
                Target Album
              </span>
              <div className="flex border border-white/15">
                {userAlbums.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAlbumMode('existing')}
                    className={`px-3 py-1 text-[11px] uppercase tracking-wider cursor-pointer ${
                      albumMode === 'existing'
                        ? 'bg-white text-black font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Existing Album
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAlbumMode('new')}
                  className={`px-3 py-1 text-[11px] uppercase tracking-wider cursor-pointer ${
                    albumMode === 'new'
                      ? 'bg-white text-black font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  New Album
                </button>
              </div>
            </div>

            {albumMode === 'existing' && userAlbums.length > 0 ? (
              <select
                value={selectedAlbumId || userAlbums[0].id}
                onChange={(e) => setSelectedAlbumId(e.target.value)}
                className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
              >
                {userAlbums.map((alb) => (
                  <option key={alb.id} value={alb.id}>
                    {alb.title} ({alb.releaseType} · {alb.year})
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Album Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={albumTitle}
                    onChange={(e) => setAlbumTitle(e.target.value)}
                    placeholder="e.g. Obsidian Echoes"
                    className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Artist / Project
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={albumArtist}
                    onChange={(e) => setAlbumArtist(e.target.value)}
                    className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Release Format
                  </label>
                  <select
                    value={albumType}
                    onChange={(e) => setAlbumType(e.target.value as ReleaseType)}
                    className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  >
                    <option value="Album">Album</option>
                    <option value="Single">Single</option>
                    <option value="EP">EP</option>
                    <option value="Remix">Remix</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Year &amp; Tags
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={4}
                      pattern="\d{4}"
                      value={albumYear}
                      onChange={(e) => setAlbumYear(e.target.value)}
                      className="w-20 bg-[#0e0e13] border border-white/15 px-2.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-white/40"
                    />
                    <input
                      type="text"
                      value={albumTags}
                      onChange={(e) => setAlbumTags(e.target.value)}
                      placeholder="Ambient, Synth"
                      className="flex-1 bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                    Album Liner Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={albumCommentary}
                    onChange={(e) => setAlbumCommentary(e.target.value)}
                    placeholder="Describe the story or atmosphere of this album..."
                    className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Audio Source & Artwork Upload */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Song Audio Upload */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
                  Song File (MP3, WAV, OGG, FLAC)
                </label>
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFileChange(e.dataTransfer.files?.[0] || null);
                  }}
                  className="flex items-center justify-between gap-3 border border-dashed border-white/20 hover:border-white/45 bg-[#08080b] px-3.5 py-3 cursor-pointer transition-colors min-h-[68px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Upload className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-xs text-zinc-300 truncate">
                      {decoding
                        ? 'Decoding audio...'
                        : audioFile
                        ? `${audioFile.name} (${formatDuration(decodedDuration)})`
                        : 'Upload song file or drop here'}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 border border-white/20 text-[10px] uppercase tracking-wider font-semibold text-white shrink-0">
                    Upload Audio
                  </span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {/* Release Cover Image Upload */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
                  Cover Image (PNG, JPG, WebP)
                </label>
                {imageFile && imagePreviewUrl ? (
                  <div className="flex items-center justify-between gap-3 border border-white/25 bg-[#08080b] px-3 py-2 min-h-[68px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={imagePreviewUrl}
                        alt={imageFile.name}
                        className="w-12 h-12 object-cover border border-white/15 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-white font-medium truncate">
                          {imageFile.name}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400 tabular-nums">
                          {(imageFile.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="px-2.5 py-1 border border-white/20 hover:border-white/45 text-[10px] uppercase tracking-wider font-semibold text-white cursor-pointer">
                        Change
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => handleImageFileChange(e.target.files?.[0] || null)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleClearCustomImage}
                        className="p-1.5 border border-white/15 hover:border-red-500/60 text-zinc-400 hover:text-red-400 cursor-pointer"
                        title="Remove uploaded image"
                        aria-label="Remove uploaded image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleImageFileChange(e.dataTransfer.files?.[0] || null);
                    }}
                    className="flex items-center justify-between gap-3 border border-dashed border-white/20 hover:border-white/45 bg-[#08080b] px-3.5 py-3 cursor-pointer transition-colors min-h-[68px]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ImagePlus className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="text-xs text-zinc-300 truncate">
                        Upload artwork from device or drop here
                      </span>
                    </div>
                    <span className="px-2.5 py-1 border border-white/20 text-[10px] uppercase tracking-wider font-semibold text-white shrink-0">
                      Upload Image
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => handleImageFileChange(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>

            {!audioFile && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                  Ambient Soundscape Sketch (if no file uploaded)
                </label>
                <select
                  value={synthPreset}
                  onChange={(e) => setSynthPreset(e.target.value)}
                  className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                >
                  {SYNTH_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                Track Title
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value)}
                placeholder="e.g. Horizon Signal"
                className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                Written Commentary Alongside Upload
              </label>
              <textarea
                rows={3}
                maxLength={2000}
                value={trackCommentary}
                onChange={(e) => setTrackCommentary(e.target.value)}
                placeholder="Share production notes, inspiration, or thoughts for listeners..."
                className="w-full bg-[#0e0e13] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
              />
            </div>

            {(audioFile || imageFile) && (
              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupToDrive}
                  onChange={(e) => setBackupToDrive(e.target.checked)}
                  className="accent-red-500"
                />
                <CloudUpload className="w-4 h-4 text-zinc-400" />
                <span>
                  Automatically back up uploaded{' '}
                  {audioFile && imageFile
                    ? 'song & artwork'
                    : audioFile
                    ? 'audio file'
                    : 'cover image'}{' '}
                  to Google Drive
                  {!hasDriveToken ? ' (will prompt Drive authorization if needed)' : ''}
                </span>
              </label>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs uppercase tracking-wider text-zinc-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || decoding}
              className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Publishing...' : 'Publish to Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
