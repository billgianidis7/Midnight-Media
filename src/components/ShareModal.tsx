import { useState } from 'react';
import { Check, Copy, ExternalLink, Share2, X } from 'lucide-react';
import { Album, formatDuration, Track } from '../types/music';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  album?: Album | null;
  track?: Track | null;
}

export function ShareModal({ open, onClose, album, track }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open || (!album && !track)) return null;

  const title = track ? `${track.title} — ${track.artist}` : `${album!.title} — ${album!.artist}`;
  const commentary = track?.commentary || album?.commentary || 'Listen on 00:00';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://zeromedia.info';
  const params = new URLSearchParams();
  if (album?.id) params.set('album', album.id);
  if (track?.id) params.set('track', track.id);
  const shareUrl = `${baseUrl}/?${params.toString()}`;

  const snippetNote = track
    ? ` (Reel Snippet ${formatDuration(track.snippetStartSec)}–${formatDuration(track.snippetEndSec)})`
    : '';
  const shareText = `${title}${snippetNote} — "${commentary.slice(0, 120)}${
    commentary.length > 120 ? '...' : ''
  }"`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // cancelled
      }
    }
  };

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(
    shareUrl
  )}`;
  const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(
    `${shareText}\n${shareUrl}`
  )}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="w-full max-w-lg border border-white/15 bg-[#0e0e12] p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
              Social Distribution
            </p>
            <h2
              id="share-modal-title"
              className="font-display text-xl font-bold text-white mt-1"
            >
              Share {track ? 'Track & Snippet' : 'Album Release'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 transition-colors cursor-pointer"
            aria-label="Close share dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="border border-white/10 bg-[#08080b] p-4 space-y-2">
          <p className="font-display text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
            {commentary}
          </p>
          {track && (
            <p className="font-mono text-[11px] text-red-400 tabular-nums">
              Selected Reel Window: {formatDuration(track.snippetStartSec)} –{' '}
              {formatDuration(track.snippetEndSec)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-zinc-400">
            Direct Release Link
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-[#08080b] border border-white/15 px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-white/40"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-white/15 hover:border-white/40 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
          >
            Post on X <ExternalLink className="w-3 h-3 text-zinc-400" />
          </a>
          <a
            href={threadsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-white/15 hover:border-white/40 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
          >
            Threads <ExternalLink className="w-3 h-3 text-zinc-400" />
          </a>
          <a
            href={fbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-white/15 hover:border-white/40 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
          >
            Facebook <ExternalLink className="w-3 h-3 text-zinc-400" />
          </a>
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-white/15 hover:border-white/40 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
          >
            LinkedIn <ExternalLink className="w-3 h-3 text-zinc-400" />
          </a>
        </div>

        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full py-2.5 border border-white/15 hover:border-white/40 text-xs uppercase tracking-wider font-medium text-zinc-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share via Device Sheet
          </button>
        )}
      </div>
    </div>
  );
}
