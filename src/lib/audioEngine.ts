import { Track } from '../types/music';
import { getLocalAudioBlob, resolveCoverUrl } from './localAudioStore';

let sharedAudioCtx: AudioContext | null = null;
const decodedBufferCache = new Map<string, AudioBuffer>();

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function extractWaveformPeaks(buffer: AudioBuffer, barCount = 96): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / barCount));
  const rawPeaks: number[] = [];
  let maxPeak = 0.0001;

  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    let sumSq = 0;
    for (let j = start; j < end; j++) {
      const sample = channel[j];
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    rawPeaks.push(rms);
    if (rms > maxPeak) maxPeak = rms;
  }

  return rawPeaks.map((v) => Math.max(8, Math.min(100, Math.round((v / maxPeak) * 96))));
}

export async function decodeAudioBlob(blob: Blob): Promise<{
  buffer: AudioBuffer;
  durationSec: number;
  peaks: number[];
}> {
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const peaks = extractWaveformPeaks(buffer, 96);
  return { buffer, durationSec: buffer.duration, peaks };
}

interface SynthPresetConfig {
  rootHz: number;
  intervals: number[];
  lfoHz: number;
  brightness: number;
  pulseInterval: number;
  noiseLevel: number;
}

const SYNTH_PRESETS: Record<string, SynthPresetConfig> = {
  last_flame: {
    rootHz: 55, // A1
    intervals: [1, 1.5, 2, 2.378, 3, 4],
    lfoHz: 0.11,
    brightness: 1150,
    pulseInterval: 1.8,
    noiseLevel: 0.04,
  },
  quieter_sky: {
    rootHz: 65.41, // C2
    intervals: [1, 1.5, 2, 2.5, 3, 4.5],
    lfoHz: 0.08,
    brightness: 950,
    pulseInterval: 2.4,
    noiseLevel: 0.055,
  },
  between_worlds: {
    rootHz: 49, // G1
    intervals: [1, 1.498, 2, 2.667, 3.5, 4],
    lfoHz: 0.14,
    brightness: 1350,
    pulseInterval: 1.5,
    noiseLevel: 0.035,
  },
  drifting_signals: {
    rootHz: 58.27, // Bb1
    intervals: [1, 1.334, 2, 2.5, 3, 4],
    lfoHz: 0.17,
    brightness: 1050,
    pulseInterval: 2.1,
    noiseLevel: 0.06,
  },
  still_here: {
    rootHz: 73.42, // D2
    intervals: [1, 1.5, 2, 2.25, 3, 4],
    lfoHz: 0.06,
    brightness: 820,
    pulseInterval: 2.8,
    noiseLevel: 0.03,
  },
  echoes_beyond: {
    rootHz: 61.74, // B1
    intervals: [1, 1.5, 2, 2.4, 3, 4.5],
    lfoHz: 0.12,
    brightness: 1450,
    pulseInterval: 1.65,
    noiseLevel: 0.045,
  },
};

export async function renderSynthBuffer(
  presetName: string,
  durationSec: number
): Promise<AudioBuffer> {
  const safeDuration = Math.max(8, Math.min(260, durationSec));
  const sampleRate = 44100;
  const offline = new OfflineAudioContext(2, Math.floor(safeDuration * sampleRate), sampleRate);
  const preset = SYNTH_PRESETS[presetName] ?? SYNTH_PRESETS.last_flame;

  // Master compressor + lowpass warmth
  const masterGain = offline.createGain();
  masterGain.gain.setValueAtTime(0.001, 0);
  masterGain.gain.linearRampToValueAtTime(0.65, 2.5);
  masterGain.gain.setValueAtTime(0.65, Math.max(2.6, safeDuration - 3.5));
  masterGain.gain.linearRampToValueAtTime(0.0001, safeDuration);

  const masterFilter = offline.createBiquadFilter();
  masterFilter.type = 'lowpass';
  masterFilter.frequency.setValueAtTime(preset.brightness, 0);
  masterFilter.Q.value = 1.4;

  // Subtle LFO sweep on master filter
  const lfo = offline.createOscillator();
  const lfoGain = offline.createGain();
  lfo.frequency.value = preset.lfoHz;
  lfoGain.gain.value = preset.brightness * 0.45;
  lfo.connect(lfoGain);
  lfoGain.connect(masterFilter.frequency);
  lfo.start(0);

  masterFilter.connect(masterGain);
  masterGain.connect(offline.destination);

  // Detuned warm analog pad voices
  preset.intervals.forEach((ratio, idx) => {
    const oscA = offline.createOscillator();
    const oscB = offline.createOscillator();
    const pan = offline.createStereoPanner();
    const voiceGain = offline.createGain();

    oscA.type = idx === 0 ? 'sine' : idx % 2 === 0 ? 'triangle' : 'sawtooth';
    oscB.type = idx === 0 ? 'sine' : 'triangle';

    const freq = preset.rootHz * ratio;
    oscA.frequency.value = freq;
    oscB.frequency.value = freq * 1.0045; // warm chorus detune

    pan.pan.value = idx === 0 ? 0 : idx % 2 === 0 ? -0.35 : 0.35;
    voiceGain.gain.value = idx === 0 ? 0.24 : 0.085 / (1 + idx * 0.25);

    oscA.connect(voiceGain);
    oscB.connect(voiceGain);
    voiceGain.connect(pan);
    pan.connect(masterFilter);

    oscA.start(0);
    oscB.start(0);
    oscA.stop(safeDuration);
    oscB.stop(safeDuration);
  });

  // Gentle crystalline melodic pulses across the arrangement
  const chimeNotes = [2, 3, 4, 4.5, 6, 3, 4, 5];
  let step = 0;
  for (let t = 1.2; t < safeDuration - 2.5; t += preset.pulseInterval) {
    const noteRatio = chimeNotes[step % chimeNotes.length];
    const chimeOsc = offline.createOscillator();
    const chimeGain = offline.createGain();
    const chimePan = offline.createStereoPanner();

    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(preset.rootHz * noteRatio * 2, t);
    chimePan.pan.value = Math.sin(step * 1.1) * 0.55;

    chimeGain.gain.setValueAtTime(0.0001, t);
    chimeGain.gain.exponentialRampToValueAtTime(0.095, t + 0.08);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(safeDuration, t + preset.pulseInterval * 1.6));

    chimeOsc.connect(chimeGain);
    chimeGain.connect(chimePan);
    chimePan.connect(masterGain);

    chimeOsc.start(t);
    chimeOsc.stop(Math.min(safeDuration, t + preset.pulseInterval * 1.7));
    step++;
  }

  // Subtle atmospheric tape/wind texture
  const noiseLen = Math.floor(safeDuration * sampleRate);
  const noiseBuf = offline.createBuffer(1, noiseLen, sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < noiseLen; i++) {
    const white = Math.random() * 2 - 1;
    noiseData[i] = (lastOut + 0.03 * white) / 1.03;
    lastOut = noiseData[i];
  }
  const noiseSrc = offline.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  const noiseFilter = offline.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 480;
  noiseFilter.Q.value = 0.8;
  const noiseGain = offline.createGain();
  noiseGain.gain.value = preset.noiseLevel;

  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSrc.start(0);

  return await offline.startRendering();
}

export async function getTrackAudioBuffer(track: Track): Promise<AudioBuffer> {
  const cached = decodedBufferCache.get(track.id);
  if (cached) return cached;

  if (track.audioSourceType === 'local_idb' && track.localFileId) {
    const blob = await getLocalAudioBlob(track.localFileId);
    if (blob) {
      const { buffer } = await decodeAudioBlob(blob);
      decodedBufferCache.set(track.id, buffer);
      return buffer;
    }
  }

  // Fallback or synth track: render deterministic atmospheric buffer
  const renderLen = Math.min(track.durationSec, 90);
  const synthBuf = await renderSynthBuffer(track.synthPreset || 'last_flame', renderLen);
  decodedBufferCache.set(track.id, synthBuf);
  return synthBuf;
}

export function setCachedTrackBuffer(trackId: string, buffer: AudioBuffer): void {
  decodedBufferCache.set(trackId, buffer);
}

/**
 * Lossless 16-bit Stereo PCM WAV Encoder for trimmed snippet export
 */
export async function exportSnippetToWavBlob(
  sourceBuffer: AudioBuffer,
  startSec: number,
  endSec: number,
  fadeSec = 0.25
): Promise<Blob> {
  const sampleRate = sourceBuffer.sampleRate;
  const clampedStart = Math.max(0, Math.min(sourceBuffer.duration - 0.1, startSec));
  const clampedEnd = Math.max(clampedStart + 0.2, Math.min(sourceBuffer.duration, endSec));
  const duration = clampedEnd - clampedStart;

  const numChannels = Math.min(2, sourceBuffer.numberOfChannels);
  const startSample = Math.floor(clampedStart * sampleRate);
  const frameCount = Math.floor(duration * sampleRate);

  const dataSize = frameCount * numChannels * 2;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const fadeSamples = Math.min(Math.floor(fadeSec * sampleRate), Math.floor(frameCount / 4));
  let offset = 44;

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(sourceBuffer.getChannelData(c));
  }

  for (let i = 0; i < frameCount; i++) {
    let env = 1;
    if (fadeSamples > 0) {
      if (i < fadeSamples) env = i / fadeSamples;
      else if (i > frameCount - fadeSamples) env = (frameCount - i) / fadeSamples;
    }

    for (let c = 0; c < numChannels; c++) {
      const idx = startSample + i;
      const sample = idx < channels[c].length ? channels[c][idx] * env : 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

export interface ReelVideoOptions {
  track: Track;
  sourceBuffer: AudioBuffer;
  startSec: number;
  endSec: number;
  aspect: '9:16' | '1:1';
  onProgress?: (pct: number) => void;
}

/**
 * Renders a dark-editorial Social Reel Video (.webm) combining cover artwork,
 * commentary quote, reactive waveform bars, and the exact trimmed audio stream.
 */
export async function renderSnippetReelVideoBlob({
  track,
  sourceBuffer,
  startSec,
  endSec,
  aspect,
  onProgress,
}: ReelVideoOptions): Promise<Blob> {
  const width = aspect === '9:16' ? 720 : 1080;
  const height = aspect === '9:16' ? 1280 : 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx2d = canvas.getContext('2d')!;

  // Load cover image if available (resolving local idb:// uploads)
  const resolvedImgSrc = track.coverUrl ? await resolveCoverUrl(track.coverUrl) : '';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const imgLoaded = await new Promise<boolean>((resolve) => {
    if (!resolvedImgSrc) {
      resolve(false);
      return;
    }
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = resolvedImgSrc;
  });

  const audioCtx = getAudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;

  const clampedStart = Math.max(0, Math.min(sourceBuffer.duration - 0.1, startSec));
  const clampedEnd = Math.max(clampedStart + 0.5, Math.min(sourceBuffer.duration, endSec));
  const clipDuration = Math.min(30, clampedEnd - clampedStart);

  const src = audioCtx.createBufferSource();
  src.buffer = sourceBuffer;

  const gainNode = audioCtx.createGain();
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.linearRampToValueAtTime(0.95, now + 0.18);
  gainNode.gain.setValueAtTime(0.95, now + Math.max(0.2, clipDuration - 0.25));
  gainNode.gain.linearRampToValueAtTime(0.001, now + clipDuration);

  src.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(dest);

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm')
    ? 'video/webm'
    : '';

  const recorder = mimeType
    ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 3_500_000 })
    : new MediaRecorder(combinedStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  let animId = 0;
  const startTimeMs = performance.now();

  const drawFrame = () => {
    const elapsedSec = (performance.now() - startTimeMs) / 1000;
    const progress = Math.min(1, elapsedSec / clipDuration);
    onProgress?.(Math.round(progress * 100));

    analyser.getByteFrequencyData(freqData);

    // Background obsidian gradient
    ctx2d.fillStyle = '#070709';
    ctx2d.fillRect(0, 0, width, height);

    if (imgLoaded) {
      ctx2d.save();
      ctx2d.globalAlpha = 0.26;
      const scale = Math.max(width / img.width, height / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx2d.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
      ctx2d.restore();
    }

    const scrim = ctx2d.createLinearGradient(0, 0, 0, height);
    scrim.addColorStop(0, 'rgba(7,7,9,0.85)');
    scrim.addColorStop(0.5, 'rgba(7,7,9,0.55)');
    scrim.addColorStop(1, 'rgba(7,7,9,0.95)');
    ctx2d.fillStyle = scrim;
    ctx2d.fillRect(0, 0, width, height);

    // Top brand kicker
    ctx2d.fillStyle = '#a1a1aa';
    ctx2d.font = '600 20px "Outfit", sans-serif';
    ctx2d.fillText('00:00  ·  AUDIO REEL', 56, 84);

    // Centered cover art card
    const artSize = aspect === '9:16' ? 480 : 420;
    const artX = (width - artSize) / 2;
    const artY = aspect === '9:16' ? 160 : 120;
    ctx2d.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx2d.lineWidth = 2;
    if (imgLoaded) {
      ctx2d.drawImage(img, artX, artY, artSize, artSize);
    } else {
      ctx2d.fillStyle = '#141418';
      ctx2d.fillRect(artX, artY, artSize, artSize);
    }
    ctx2d.strokeRect(artX, artY, artSize, artSize);

    // Title & Artist
    const textStartY = artY + artSize + 68;
    ctx2d.fillStyle = '#ffffff';
    ctx2d.font = '700 44px "Outfit", sans-serif';
    ctx2d.fillText(track.title.slice(0, 28), 56, textStartY);

    ctx2d.fillStyle = '#a1a1aa';
    ctx2d.font = '500 24px "Plus Jakarta Sans", sans-serif';
    ctx2d.fillText(`${track.artist}  ·  ${track.albumTitle}`, 56, textStartY + 40);

    // Commentary quote
    if (track.commentary) {
      ctx2d.fillStyle = '#d4d4d8';
      ctx2d.font = '400 22px "Plus Jakarta Sans", sans-serif';
      const quote = `"${track.commentary.slice(0, 88)}${track.commentary.length > 88 ? '...' : ''}"`;
      ctx2d.fillText(quote, 56, textStartY + 90);
    }

    // Reactive audio waveform bars
    const waveY = height - 190;
    const barCount = 48;
    const barZoneWidth = width - 112;
    const stepW = barZoneWidth / barCount;
    for (let i = 0; i < barCount; i++) {
      const peakVal = track.waveformPeaks[Math.floor((i / barCount) * track.waveformPeaks.length)] ?? 40;
      const liveBoost = (freqData[i % freqData.length] ?? 0) / 255;
      const h = Math.max(8, (peakVal * 0.7 + liveBoost * 75) * 1.1);
      const isPassed = i / barCount <= progress;
      ctx2d.fillStyle = isPassed ? '#ef4444' : 'rgba(255,255,255,0.28)';
      ctx2d.fillRect(56 + i * stepW, waveY - h / 2, Math.max(3, stepW - 5), h);
    }

    // Timecode footer
    ctx2d.fillStyle = '#a1a1aa';
    ctx2d.font = '500 20px "IBM Plex Mono", monospace';
    const currentPos = clampedStart + elapsedSec;
    const mm = String(Math.floor(currentPos / 60)).padStart(2, '0');
    const ss = String(Math.floor(currentPos % 60)).padStart(2, '0');
    ctx2d.fillText(`${mm}:${ss}  /  CLIP ${clipDuration.toFixed(1)}s`, 56, height - 72);

    if (elapsedSec < clipDuration) {
      animId = requestAnimationFrame(drawFrame);
    }
  };

  return await new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      cancelAnimationFrame(animId);
      combinedStream.getTracks().forEach((t) => t.stop());
      onProgress?.(100);
      resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
    };

    recorder.start(100);
    src.start(0, clampedStart, clipDuration);
    drawFrame();

    window.setTimeout(() => {
      try {
        src.stop();
      } catch {
        // ignore if already stopped
      }
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, clipDuration * 1000 + 80);
  });
}
