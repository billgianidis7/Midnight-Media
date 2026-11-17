import { useEffect, useRef, useState } from 'react';
import {
  CloudUpload,
  Download,
  Film,
  Pause,
  Play,
  Repeat,
  Save,
  Scissors,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  exportSnippetToWavBlob,
  getAudioContext,
  getTrackAudioBuffer,
  renderSnippetReelVideoBlob,
} from '../lib/audioEngine';
import { formatPreciseTime, Track } from '../types/music';
import { CoverImage } from './CoverImage';

interface WaveformReelStudioProps {
  track: Track | null;
  onClose: () => void;
  onSaveBounds: (track: Track, startSec: number, endSec: number) => Promise<void>;
  onBackupBlobToDrive: (
    blob: Blob,
    fileName: string,
    mimeType: string,
    kind: 'reel_snippet' | 'reel_video',
    track: Track
  ) => Promise<void>;
  onOpenShare: (track: Track) => void;
  canSaveToCloud: boolean;
  hasDriveToken: boolean;
  onRequestSignIn: () => Promise<void>;
}

export function WaveformReelStudio({
  track,
  onClose,
  onSaveBounds,
  onBackupBlobToDrive,
  onOpenShare,
  canSaveToCloud,
  hasDriveToken,
  onRequestSignIn,
}: WaveformReelStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(15);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopSnippet, setLoopSnippet] = useState(true);
  const [zoom, setZoom] = useState<1 | 2 | 4>(1);
  const [viewOffsetRatio, setViewOffsetRatio] = useState(0);

  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | 'scrub' | null>(null);
  const [savingBounds, setSavingBounds] = useState(false);
  const [exportingWav, setExportingWav] = useState(false);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoAspect, setVideoAspect] = useState<'9:16' | '1:1'>('9:16');
  const [renderedVideoBlob, setRenderedVideoBlob] = useState<Blob | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderedWavBlob, setRenderedWavBlob] = useState<Blob | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const stopPlayback = () => {
    cancelAnimationFrame(animFrameRef.current);
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // already stopped
      }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    setLoadingAudio(true);
    setRenderedVideoBlob(null);
    setRenderedWavBlob(null);
    setStatusMessage(null);
    if (renderedVideoUrl) {
      URL.revokeObjectURL(renderedVideoUrl);
      setRenderedVideoUrl(null);
    }

    getTrackAudioBuffer(track)
      .then((buf) => {
        if (cancelled) return;
        setAudioBuffer(buf);
        const dur = buf.duration;
        const initStart = Math.max(0, Math.min(dur - 2, track.snippetStartSec || 0));
        const initEnd = Math.max(
          initStart + 2,
          Math.min(dur, track.snippetEndSec || Math.min(dur, initStart + 15))
        );
        setStartSec(initStart);
        setEndSec(initEnd);
        setPlayheadSec(initStart);

        // High-res 160-bar waveform extraction from the actual AudioBuffer
        const ch = buf.getChannelData(0);
        const barCount = 160;
        const block = Math.max(1, Math.floor(ch.length / barCount));
        const extracted: number[] = [];
        let maxV = 0.0001;
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          const s = i * block;
          const e = Math.min(ch.length, s + block);
          for (let j = s; j < e; j++) sum += ch[j] * ch[j];
          const rms = Math.sqrt(sum / Math.max(1, e - s));
          extracted.push(rms);
          if (rms > maxV) maxV = rms;
        }
        setPeaks(extracted.map((v) => Math.max(8, Math.min(100, Math.round((v / maxV) * 96)))));
      })
      .finally(() => {
        if (!cancelled) setLoadingAudio(false);
      });

    return () => {
      cancelled = true;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  // Cleanup video URL on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (renderedVideoUrl) URL.revokeObjectURL(renderedVideoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDuration = audioBuffer?.duration || track?.durationSec || 30;
  const visibleWindowSec = totalDuration / zoom;
  const windowStartSec = Math.max(
    0,
    Math.min(totalDuration - visibleWindowSec, viewOffsetRatio * (totalDuration - visibleWindowSec))
  );
  const windowEndSec = windowStartSec + visibleWindowSec;

  // Draw waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = '#08080b';
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal centerline
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const secToX = (sec: number) => ((sec - windowStartSec) / visibleWindowSec) * w;

    // Selection highlight band
    const selX1 = Math.max(0, secToX(startSec));
    const selX2 = Math.min(w, secToX(endSec));
    if (selX2 > selX1) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.14)';
      ctx.fillRect(selX1, 0, selX2 - selX1, h);
    }

    // Waveform bars
    const firstBar = Math.floor((windowStartSec / totalDuration) * peaks.length);
    const lastBar = Math.ceil((windowEndSec / totalDuration) * peaks.length);
    const barsInView = Math.max(1, lastBar - firstBar);
    const barSlot = w / barsInView;

    for (let i = firstBar; i < lastBar; i++) {
      if (i < 0 || i >= peaks.length) continue;
      const barTime = (i / peaks.length) * totalDuration;
      const x = secToX(barTime);
      const amp = (peaks[i] / 100) * (h * 0.78);
      const inSelection = barTime >= startSec && barTime <= endSec;
      const isPlayed = barTime <= playheadSec;

      if (inSelection) {
        ctx.fillStyle = isPlayed ? '#ef4444' : '#f4f4f5';
      } else {
        ctx.fillStyle = 'rgba(161, 161, 170, 0.25)';
      }

      const barWidth = Math.max(2, barSlot * 0.62);
      ctx.fillRect(x, (h - amp) / 2, barWidth, Math.max(3, amp));
    }

    // Trim Start & End handles
    const drawHandle = (sec: number, label: string) => {
      const x = secToX(sec);
      if (x < -10 || x > w + 10) return;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - 10, 0, 20, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, 13);
    };

    drawHandle(startSec, 'IN');
    drawHandle(endSec, 'OUT');

    // Playhead cursor
    const playX = secToX(playheadSec);
    if (playX >= 0 && playX <= w) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();
    }
  }, [peaks, startSec, endSec, playheadSec, windowStartSec, windowEndSec, visibleWindowSec, totalDuration]);

  if (!track) return null;

  const startPlaybackAt = (fromSec: number, playOnlySnippet: boolean) => {
    if (!audioBuffer) return;
    stopPlayback();

    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;

    const rangeEnd = playOnlySnippet ? endSec : totalDuration;
    const safeStart = Math.max(0, Math.min(rangeEnd - 0.1, fromSec));
    const playLen = Math.max(0.1, rangeEnd - safeStart);

    if (playOnlySnippet && loopSnippet) {
      src.loop = true;
      src.loopStart = startSec;
      src.loopEnd = endSec;
      src.connect(ctx.destination);
      src.start(0, safeStart);
    } else {
      src.connect(ctx.destination);
      src.start(0, safeStart, playLen);
    }

    sourceNodeRef.current = src;
    setIsPlaying(true);

    const startedWallTime = performance.now();
    const span = Math.max(0.1, endSec - startSec);

    const tick = () => {
      const elapsed = (performance.now() - startedWallTime) / 1000;
      if (playOnlySnippet && loopSnippet) {
        const pos = startSec + ((safeStart - startSec + elapsed) % span);
        setPlayheadSec(pos);
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        const pos = safeStart + elapsed;
        if (pos >= rangeEnd) {
          stopPlayback();
          setPlayheadSec(startSec);
        } else {
          setPlayheadSec(pos);
          animFrameRef.current = requestAnimationFrame(tick);
        }
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  };

  const xToSec = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return windowStartSec + ratio * visibleWindowSec;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const sec = xToSec(e.clientX);
    const rect = canvas.getBoundingClientRect();
    const pxPerSec = rect.width / visibleWindowSec;

    if (Math.abs((sec - startSec) * pxPerSec) < 16) {
      setDraggingHandle('start');
    } else if (Math.abs((sec - endSec) * pxPerSec) < 16) {
      setDraggingHandle('end');
    } else {
      setDraggingHandle('scrub');
      setPlayheadSec(sec);
      if (isPlaying) startPlaybackAt(sec, true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingHandle) return;
    const sec = xToSec(e.clientX);
    if (draggingHandle === 'start') {
      const next = Math.max(0, Math.min(endSec - 1, sec));
      setStartSec(next);
      setPlayheadSec(next);
    } else if (draggingHandle === 'end') {
      const next = Math.min(totalDuration, Math.max(startSec + 1, sec));
      setEndSec(next);
    } else if (draggingHandle === 'scrub') {
      setPlayheadSec(Math.max(0, Math.min(totalDuration, sec)));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingHandle) {
      canvasRef.current?.releasePointerCapture(e.pointerId);
      setDraggingHandle(null);
    }
  };

  const applyDurationPreset = (lenSec: number) => {
    const clampedLen = Math.min(lenSec, totalDuration);
    const nextEnd = Math.min(totalDuration, startSec + clampedLen);
    const nextStart = Math.max(0, nextEnd - clampedLen);
    setStartSec(nextStart);
    setEndSec(nextEnd);
    setPlayheadSec(nextStart);
  };

  const handleSaveSnippet = async () => {
    if (!canSaveToCloud) {
      setStatusMessage('Snippet bounds updated for this session. Sign in and post your own tracks to save bounds to Firestore.');
      return;
    }
    setSavingBounds(true);
    try {
      await onSaveBounds(track, startSec, endSec);
      setStatusMessage('Snippet trim points saved to cloud.');
    } finally {
      setSavingBounds(false);
    }
  };

  const handleExportWav = async () => {
    if (!audioBuffer) return;
    setExportingWav(true);
    setStatusMessage(null);
    try {
      const blob = await exportSnippetToWavBlob(audioBuffer, startSec, endSec, 0.25);
      setRenderedWavBlob(blob);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track.title.replace(/\s+/g, '_')}_snippet_${Math.round(startSec)}s-${Math.round(endSec)}s.wav`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage('Lossless 16-bit WAV snippet exported.');
    } finally {
      setExportingWav(false);
    }
  };

  const handleRenderVideoReel = async () => {
    if (!audioBuffer) return;
    stopPlayback();
    setRenderingVideo(true);
    setVideoProgress(0);
    setStatusMessage(null);
    try {
      const blob = await renderSnippetReelVideoBlob({
        track,
        sourceBuffer: audioBuffer,
        startSec,
        endSec,
        aspect: videoAspect,
        onProgress: setVideoProgress,
      });
      if (renderedVideoUrl) URL.revokeObjectURL(renderedVideoUrl);
      const url = URL.createObjectURL(blob);
      setRenderedVideoBlob(blob);
      setRenderedVideoUrl(url);
      setStatusMessage('Reel video post rendered and ready for download or Drive backup.');
    } finally {
      setRenderingVideo(false);
    }
  };

  const handleBackupWav = async () => {
    if (!audioBuffer) return;
    if (!hasDriveToken) {
      await onRequestSignIn();
      return;
    }
    const blob = renderedWavBlob || (await exportSnippetToWavBlob(audioBuffer, startSec, endSec, 0.25));
    setRenderedWavBlob(blob);
    const fileName = `${track.title.replace(/\s+/g, '_')}_snippet_${Math.round(startSec)}-${Math.round(endSec)}s.wav`;
    await onBackupBlobToDrive(blob, fileName, 'audio/wav', 'reel_snippet', track);
    setStatusMessage('WAV snippet backed up to Google Drive.');
  };

  const handleBackupReel = async () => {
    if (!renderedVideoBlob) return;
    if (!hasDriveToken) {
      await onRequestSignIn();
      return;
    }
    const fileName = `${track.title.replace(/\s+/g, '_')}_reel_${videoAspect.replace(':', 'x')}.webm`;
    await onBackupBlobToDrive(renderedVideoBlob, fileName, 'video/webm', 'reel_video', track);
    setStatusMessage('Reel video backed up to Google Drive.');
  };

  const clipLength = Math.max(0, endSec - startSec);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waveform-studio-title"
    >
      <div className="w-full max-w-4xl border border-white/15 bg-[#0b0b0f] p-6 md:p-8 space-y-6 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-4 min-w-0">
            <CoverImage
              src={track.coverUrl}
              alt={track.title}
              className="w-14 h-14 object-cover border border-white/15 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-red-400">
                Waveform Reel Studio
              </p>
              <h2
                id="waveform-studio-title"
                className="font-display text-xl md:text-2xl font-bold text-white truncate"
              >
                {track.title}
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                {track.artist} · {track.albumTitle} · {track.year}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopPlayback();
              onClose();
            }}
            className="text-zinc-400 hover:text-white p-2 transition-colors cursor-pointer shrink-0"
            aria-label="Close Waveform Studio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Waveform Canvas */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                Drag IN / OUT handles to select your Reel snippet
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applyDurationPreset(15)}
                className="px-2.5 py-1 text-[11px] font-mono border border-white/15 hover:border-white/40 text-zinc-300 cursor-pointer whitespace-nowrap"
              >
                15s Reel
              </button>
              <button
                type="button"
                onClick={() => applyDurationPreset(30)}
                className="px-2.5 py-1 text-[11px] font-mono border border-white/15 hover:border-white/40 text-zinc-300 cursor-pointer whitespace-nowrap"
              >
                30s Story
              </button>
              <div className="flex items-center border border-white/15 ml-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => (z === 4 ? 2 : 1))}
                  disabled={zoom === 1}
                  className="p-1.5 text-zinc-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  aria-label="Zoom out waveform"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-mono text-[11px] text-zinc-300 tabular-nums">
                  {zoom}x
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => (z === 1 ? 2 : 4))}
                  disabled={zoom === 4}
                  className="p-1.5 text-zinc-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  aria-label="Zoom in waveform"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="relative border border-white/15 bg-[#08080b]">
            {loadingAudio ? (
              <div className="h-44 flex items-center justify-center text-xs text-zinc-400">
                Decoding stereo waveform buffer...
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="w-full h-44 block cursor-crosshair touch-none"
              />
            )}
          </div>

          {zoom > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider shrink-0">
                Pan
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={viewOffsetRatio}
                onChange={(e) => setViewOffsetRatio(Number(e.target.value))}
                className="w-full accent-red-500"
              />
            </div>
          )}

          {/* Tabular timecode strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-white/10 bg-[#08080b] p-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">In Point</p>
              <p className="font-mono text-sm text-white tabular-nums">
                {formatPreciseTime(startSec)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Out Point</p>
              <p className="font-mono text-sm text-white tabular-nums">
                {formatPreciseTime(endSec)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Clip Length</p>
              <p className="font-mono text-sm text-red-400 tabular-nums">
                {clipLength.toFixed(1)}s
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Playhead</p>
              <p className="font-mono text-sm text-zinc-300 tabular-nums">
                {formatPreciseTime(playheadSec)}
              </p>
            </div>
          </div>
        </div>

        {/* Transport & Primary Export Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={loadingAudio || !audioBuffer}
              onClick={() => (isPlaying ? stopPlayback() : startPlaybackAt(startSec, true))}
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Stop Preview' : 'Play Snippet'}
            </button>

            <button
              type="button"
              onClick={() => setLoopSnippet((v) => !v)}
              className={`px-3 py-2 text-xs font-medium uppercase tracking-wider border flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                loopSnippet
                  ? 'border-red-500/70 text-red-400 bg-red-500/10'
                  : 'border-white/15 text-zinc-400 hover:text-white'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              Loop
            </button>

            <button
              type="button"
              onClick={handleSaveSnippet}
              disabled={savingBounds}
              className="px-3 py-2 text-xs font-medium uppercase tracking-wider border border-white/15 hover:border-white/40 text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {savingBounds ? 'Saving...' : 'Save Trim'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportWav}
              disabled={exportingWav || !audioBuffer}
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-white/25 hover:border-white text-white flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exportingWav ? 'Encoding...' : 'Export WAV'}
            </button>

            <button
              type="button"
              onClick={handleBackupWav}
              disabled={!audioBuffer}
              className="px-3 py-2 text-xs font-medium uppercase tracking-wider border border-white/15 hover:border-white/40 text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              Drive WAV
            </button>

            <button
              type="button"
              onClick={() => onOpenShare(track)}
              className="px-3 py-2 text-xs font-medium uppercase tracking-wider border border-white/15 hover:border-white/40 text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>

        {/* Social Reel Video Post Generator */}
        <div className="border-t border-white/10 pt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-red-500" />
                Social Reel Video Post Renderer
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Renders cover art, commentary quote, and reactive waveform synced with your lossless audio cut.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex border border-white/15">
                <button
                  type="button"
                  onClick={() => setVideoAspect('9:16')}
                  className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                    videoAspect === '9:16'
                      ? 'bg-white text-black font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  9:16 Reel
                </button>
                <button
                  type="button"
                  onClick={() => setVideoAspect('1:1')}
                  className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                    videoAspect === '1:1'
                      ? 'bg-white text-black font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  1:1 Square
                </button>
              </div>

              <button
                type="button"
                onClick={handleRenderVideoReel}
                disabled={renderingVideo || !audioBuffer}
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Scissors className="w-3.5 h-3.5" />
                {renderingVideo ? `Rendering ${videoProgress}%` : 'Render Reel Video'}
              </button>
            </div>
          </div>

          {renderedVideoUrl && renderedVideoBlob && (
            <div className="border border-white/15 bg-[#08080b] p-4 flex flex-col sm:flex-row items-center gap-5">
              <video
                src={renderedVideoUrl}
                controls
                className="max-h-56 border border-white/10 bg-black"
              />
              <div className="space-y-3 flex-1">
                <p className="text-xs uppercase tracking-wider text-zinc-400">
                  Reel Output Ready · {(renderedVideoBlob.size / (1024 * 1024)).toFixed(2)} MB WebM
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <a
                    href={renderedVideoUrl}
                    download={`${track.title.replace(/\s+/g, '_')}_reel.webm`}
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Reel
                  </a>
                  <button
                    type="button"
                    onClick={handleBackupReel}
                    className="px-4 py-2 text-xs font-medium uppercase tracking-wider border border-white/20 hover:border-white text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    Back Up Reel to Drive
                  </button>
                </div>
              </div>
            </div>
          )}

          {statusMessage && (
            <p className="text-xs text-zinc-300 border border-white/10 bg-white/5 px-3 py-2">
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
