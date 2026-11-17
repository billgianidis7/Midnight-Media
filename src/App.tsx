import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowRight,
  CloudUpload,
  Disc3,
  Heart,
  LogOut,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Scissors,
  Search,
  Share2,
} from 'lucide-react';
import { AlbumDetailDrawer } from './components/AlbumDetailDrawer';
import { AuthModal } from './components/AuthModal';
import { CloudBackupPanel } from './components/CloudBackupPanel';
import { CoverImage } from './components/CoverImage';
import { CreatorUploadsManager } from './components/CreatorUploadsManager';
import { ShareModal } from './components/ShareModal';
import { UploadPostModal } from './components/UploadPostModal';
import { WaveformReelStudio } from './components/WaveformReelStudio';
import { HERO_BACKDROP_URL } from './data/seedCatalog';
import {
  exportSnippetToWavBlob,
  getAudioContext,
  getTrackAudioBuffer,
} from './lib/audioEngine';
import {
  deleteDriveFile,
  downloadDriveFileBlob,
  ensureBackupFolder,
  listDriveBackupFiles,
  uploadBlobToDrive,
} from './lib/driveBackup';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
  testConnection,
} from './lib/firebase';
import {
  clearAllUserUploadsInFirestore,
  createAlbumInFirestore,
  createTrackInFirestore,
  deleteAlbumAndTracksInFirestore,
  deleteBackupRecord,
  deleteTrackInFirestore,
  fetchUserLikedTrackIds,
  saveBackupRecord,
  saveUserPrivateProfile,
  subscribePublicAlbums,
  subscribePublicTracks,
  subscribeUserBackups,
  subscribeUserOwnedAlbums,
  subscribeUserOwnedTracks,
  toggleTrackLikeInFirestore,
  updateAlbumInFirestore,
  updateTrackDriveBackupInfo,
  updateTrackInFirestore,
  updateTrackSnippetBounds,
} from './lib/firestoreRepo';
import { getLocalAudioBlob } from './lib/localAudioStore';
import {
  Album,
  CloudBackupRecord,
  formatDuration,
  ReleaseType,
  Track,
  Visibility,
} from './types/music';

type FilterTab = 'All' | 'Albums' | 'Singles' | 'EPs' | 'Remixes';

const LOCAL_LIKES_STORAGE_KEY = 'zeromedia_liked_tracks_v1';

function loadLocalLikedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_LIKES_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);

  const [cloudAlbums, setCloudAlbums] = useState<Album[]>([]);
  const [cloudTracks, setCloudTracks] = useState<Track[]>([]);
  const [ownedAlbums, setOwnedAlbums] = useState<Album[]>([]);
  const [ownedTracks, setOwnedTracks] = useState<Track[]>([]);
  const [backups, setBackups] = useState<CloudBackupRecord[]>([]);

  // Listener Likes state
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(() => loadLocalLikedIds());
  const [localLikeDeltas, setLocalLikeDeltas] = useState<Record<string, number>>({});

  // Navigation & UI state
  const [activeNav, setActiveNav] = useState<'feed' | 'albums' | 'archive' | 'manage' | 'cloud'>('feed');
  const [filterTab, setFilterTab] = useState<FilterTab>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllAlbums, setShowAllAlbums] = useState(false);

  // Modals & Drawers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [drawerAlbum, setDrawerAlbum] = useState<Album | null>(null);
  const [drawerInitialTrackId, setDrawerInitialTrackId] = useState<string | null>(null);
  const [waveformTrack, setWaveformTrack] = useState<Track | null>(null);
  const [shareTarget, setShareTarget] = useState<{ album?: Album | null; track?: Track | null } | null>(
    null
  );

  // Playback engine state
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const playbackOffsetRef = useRef<number>(0);
  const playbackStartWallRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const lastLogoPressRef = useRef<number>(0);
  const singleTapTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  }, []);

  // Boot connection check + clear legacy demo comment storage + Auth listener
  useEffect(() => {
    try {
      localStorage.removeItem('zeromedia_seed_album_comments_v1');
      localStorage.removeItem('zeromedia_seed_track_comments_v1');
    } catch {
      // ignore storage errors
    }

    testConnection();
    const unsubAuth = initAuth((u, token) => {
      setUser(u);
      if (token) setDriveToken(token);
      if (!u) {
        setDriveToken(null);
        setDriveFolderId(null);
        setBackups([]);
        setOwnedAlbums([]);
        setOwnedTracks([]);
        setUploadModalOpen(false);
        setWaveformTrack(null);
      }
    });
    return () => unsubAuth();
  }, []);

  const userUid = user?.uid ?? null;

  // Public feed subscriptions
  useEffect(() => {
    const unsubAlbums = subscribePublicAlbums(userUid, setCloudAlbums);
    const unsubTracks = subscribePublicTracks(userUid, setCloudTracks);
    return () => {
      unsubAlbums();
      unsubTracks();
    };
  }, [userUid]);

  // Authenticated creator subscriptions (owned albums, tracks, backups)
  useEffect(() => {
    if (!userUid) {
      setBackups((prev) => (prev.length === 0 ? prev : []));
      setOwnedAlbums((prev) => (prev.length === 0 ? prev : []));
      setOwnedTracks((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const unsubOwnedAlbums = subscribeUserOwnedAlbums(userUid, setOwnedAlbums);
    const unsubOwnedTracks = subscribeUserOwnedTracks(userUid, setOwnedTracks);
    const unsubBackups = subscribeUserBackups(userUid, setBackups);
    return () => {
      unsubOwnedAlbums();
      unsubOwnedTracks();
      unsubBackups();
    };
  }, [userUid]);

  const allAlbums = useMemo(() => cloudAlbums, [cloudAlbums]);
  const allTracks = useMemo(() => cloudTracks, [cloudTracks]);

  // Hydrate Firestore liked track states when signed in
  useEffect(() => {
    if (!userUid || allTracks.length === 0) return;
    let cancelled = false;
    fetchUserLikedTrackIds(
      userUid,
      allTracks.map((t) => t.id)
    ).then((cloudLiked) => {
      if (cancelled) return;
      setLikedTrackIds((prev) => {
        const merged = new Set(prev);
        cloudLiked.forEach((id) => merged.add(id));
        return merged;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userUid, allTracks]);

  const drawerTracks = useMemo(
    () => (drawerAlbum ? allTracks.filter((t) => t.albumId === drawerAlbum.id) : []),
    [allTracks, drawerAlbum]
  );

  const featuredAlbum = allAlbums[0] ?? null;
  const featuredTrack =
    (featuredAlbum && allTracks.find((t) => t.albumId === featuredAlbum.id)) ||
    allTracks[0] ||
    null;

  const deepLinkAppliedRef = useRef(false);

  // Deep-link URL support (?album=...&track=...)
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const albId = params.get('album');
    const trkId = params.get('track');
    if (!albId) {
      deepLinkAppliedRef.current = true;
      return;
    }
    const foundAlb = allAlbums.find((a) => a.id === albId);
    if (foundAlb) {
      deepLinkAppliedRef.current = true;
      setDrawerAlbum(foundAlb);
      if (trkId) setDrawerInitialTrackId(trkId);
    }
  }, [allAlbums]);

  // --- Hidden Double-Press Handler on "00:00" Top-Left Wordmark ---
  const handleBrandPress = () => {
    const now = Date.now();
    const delta = now - lastLogoPressRef.current;
    if (delta > 0 && delta <= 750) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastLogoPressRef.current = 0;
      if (!user || !user.emailVerified) {
        setAuthModalOpen(true);
      } else {
        setActiveNav('manage');
        document.getElementById('manage-uploads-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      lastLogoPressRef.current = now;
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        lastLogoPressRef.current = 0;
        setActiveNav('feed');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        singleTapTimerRef.current = null;
      }, 300);
    }
  };

  // --- Listener Likes Handler ---
  const getLikeCount = useCallback(
    (track: Track) => {
      const base = Math.max(0, Math.round(track.likeCount ?? 0));
      const delta = localLikeDeltas[track.id] ?? 0;
      return Math.max(0, base + delta);
    },
    [localLikeDeltas]
  );

  const handleToggleLike = useCallback(
    async (track: Track) => {
      const currentlyLiked = likedTrackIds.has(track.id);
      const nextLiked = new Set(likedTrackIds);
      if (currentlyLiked) {
        nextLiked.delete(track.id);
      } else {
        nextLiked.add(track.id);
      }
      setLikedTrackIds(nextLiked);

      try {
        localStorage.setItem(LOCAL_LIKES_STORAGE_KEY, JSON.stringify([...nextLiked]));
      } catch {
        // ignore storage errors
      }

      if (user && user.emailVerified) {
        try {
          await toggleTrackLikeInFirestore(user, track, currentlyLiked);
        } catch {
          // revert local delta if Firestore fails
          setLikedTrackIds(likedTrackIds);
        }
      } else {
        setLocalLikeDeltas((prev) => ({
          ...prev,
          [track.id]: (prev[track.id] ?? 0) + (currentlyLiked ? -1 : 1),
        }));
      }
    },
    [likedTrackIds, user]
  );

  // --- Audio Playback Controls ---
  const stopAudioEngine = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // ignore
      }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startBufferPlayback = useCallback(
    (track: Track, buffer: AudioBuffer, startOffsetSec: number) => {
      stopAudioEngine();
      const ctx = getAudioContext();
      const safeOffset = Math.max(0, Math.min(buffer.duration - 0.05, startOffsetSec));
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0, safeOffset);

      sourceNodeRef.current = src;
      currentBufferRef.current = buffer;
      playbackOffsetRef.current = safeOffset;
      playbackStartWallRef.current = performance.now();
      setPlayingTrack(track);
      setIsPlaying(true);

      const tick = () => {
        const elapsed = (performance.now() - playbackStartWallRef.current) / 1000;
        const pos = playbackOffsetRef.current + elapsed;
        if (pos >= buffer.duration) {
          stopAudioEngine();
          setCurrentTimeSec(0);
          playbackOffsetRef.current = 0;
        } else {
          setCurrentTimeSec(pos);
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopAudioEngine]
  );

  const handleTogglePlayTrack = useCallback(
    async (track: Track) => {
      if (playingTrack?.id === track.id) {
        if (isPlaying) {
          const elapsed = (performance.now() - playbackStartWallRef.current) / 1000;
          const pausedAt = playbackOffsetRef.current + elapsed;
          stopAudioEngine();
          setCurrentTimeSec(pausedAt);
          playbackOffsetRef.current = pausedAt;
          return;
        } else if (currentBufferRef.current) {
          startBufferPlayback(track, currentBufferRef.current, playbackOffsetRef.current);
          return;
        }
      }

      setLoadingTrackId(track.id);
      try {
        const buffer = await getTrackAudioBuffer(track);
        startBufferPlayback(track, buffer, 0);
      } finally {
        setLoadingTrackId(null);
      }
    },
    [playingTrack?.id, isPlaying, stopAudioEngine, startBufferPlayback]
  );

  const handleSeek = useCallback(
    (ratio: number) => {
      if (!playingTrack || !currentBufferRef.current) return;
      const targetSec = Math.max(
        0,
        Math.min(currentBufferRef.current.duration - 0.1, ratio * currentBufferRef.current.duration)
      );
      setCurrentTimeSec(targetSec);
      playbackOffsetRef.current = targetSec;
      if (isPlaying) {
        startBufferPlayback(playingTrack, currentBufferRef.current, targetSec);
      }
    },
    [playingTrack, isPlaying, startBufferPlayback]
  );

  useEffect(() => {
    return () => stopAudioEngine();
  }, [stopAudioEngine]);

  // --- Auth & Google Drive Helpers ---
  const handleGoogleFastLogin = async () => {
    const res = await googleSignIn();
    setUser(res.user);
    setDriveToken(res.accessToken);
    if (res.accessToken) {
      const folderId = await ensureBackupFolder(res.accessToken);
      setDriveFolderId(folderId);
      await saveUserPrivateProfile(res.user, folderId);
    }
    showToast(`Signed in as ${res.user.displayName || 'Creator'}`);
  };

  const requireDriveAccess = async (): Promise<{ user: User; token: string; folderId: string } | null> => {
    if (!user) return null;
    let activeUser = user;
    let activeToken = driveToken || getAccessToken();

    if (!activeToken) {
      const res = await googleSignIn();
      activeUser = res.user;
      activeToken = res.accessToken;
      setUser(activeUser);
      setDriveToken(activeToken);
    }

    if (!activeUser || !activeToken) {
      showToast('Google Drive authorization is required to back up files.');
      return null;
    }

    let folderId = driveFolderId;
    if (!folderId) {
      folderId = await ensureBackupFolder(activeToken);
      setDriveFolderId(folderId);
      await saveUserPrivateProfile(activeUser, folderId);
    }

    return { user: activeUser, token: activeToken, folderId };
  };

  const handleBackupBlobToDrive = async (
    blob: Blob,
    fileName: string,
    mimeType: string,
    kind: CloudBackupRecord['kind'],
    track?: Track,
    album?: Album
  ) => {
    if (!user) return;
    setIsSyncingDrive(true);
    try {
      const ctx = await requireDriveAccess();
      if (!ctx) return;

      const uploaded = await uploadBlobToDrive(
        ctx.token,
        ctx.folderId,
        blob,
        fileName,
        mimeType
      );

      await saveBackupRecord(ctx.user, {
        trackId: track?.id || '',
        albumId: album?.id || track?.albumId || '',
        fileName: uploaded.name || fileName,
        mimeType,
        sizeBytes: blob.size,
        kind,
        driveFileId: uploaded.id,
        driveWebViewLink: uploaded.webViewLink || '',
      });

      if (track && track.authorUid === ctx.user.uid && kind === 'audio_master') {
        await updateTrackDriveBackupInfo(track.id, uploaded.id, uploaded.webViewLink || '');
      }

      showToast(`Backed up "${fileName}" to Google Drive.`);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleBackupTrackAudio = async (track: Track) => {
    if (!user) return;
    setIsSyncingDrive(true);
    try {
      let blob: Blob | null = null;
      let fileName = `${track.title.replace(/\s+/g, '_')}.wav`;
      let mimeType = 'audio/wav';

      if (track.audioSourceType === 'local_idb' && track.localFileId) {
        const localBlob = await getLocalAudioBlob(track.localFileId);
        if (localBlob) {
          blob = localBlob;
          mimeType = localBlob.type || 'audio/mpeg';
          const ext = mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : 'wav';
          fileName = `${track.title.replace(/\s+/g, '_')}.${ext}`;
        }
      }

      if (!blob) {
        const buf = await getTrackAudioBuffer(track);
        blob = await exportSnippetToWavBlob(buf, 0, buf.duration, 0.15);
      }

      await handleBackupBlobToDrive(blob, fileName, mimeType, 'audio_master', track);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleBackupAlbumArchive = async (album: Album, albumTracks: Track[]) => {
    if (!user) return;
    const archivePayload = {
      exportedAt: new Date().toISOString(),
      source: '00:00',
      album,
      tracks: albumTracks,
    };
    const blob = new Blob([JSON.stringify(archivePayload, null, 2)], {
      type: 'application/json',
    });
    await handleBackupBlobToDrive(
      blob,
      `${album.title.replace(/\s+/g, '_')}_archive.json`,
      'application/json',
      'album_archive',
      undefined,
      album
    );
  };

  const handleBackupFullCatalog = async () => {
    if (!user) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      source: '00:00',
      albums: ownedAlbums,
      tracks: ownedTracks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    await handleBackupBlobToDrive(
      blob,
      `00-00_Full_Catalog_${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
      'album_archive'
    );
  };

  const handleRefreshDriveFiles = async () => {
    if (!user) return;
    setIsSyncingDrive(true);
    try {
      const ctx = await requireDriveAccess();
      if (!ctx) return;
      const files = await listDriveBackupFiles(ctx.token, ctx.folderId);
      showToast(`Google Drive synced (${files.length} files in backup folder).`);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleDownloadBackup = async (record: CloudBackupRecord) => {
    const ctx = await requireDriveAccess();
    if (!ctx) return;
    const blob = await downloadDriveFileBlob(ctx.token, record.driveFileId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.fileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded "${record.fileName}" from Google Drive.`);
  };

  const handleDeleteBackup = async (record: CloudBackupRecord) => {
    const ctx = await requireDriveAccess();
    if (!ctx) return;
    await deleteDriveFile(ctx.token, record.driveFileId);
    await deleteBackupRecord(ctx.user.uid, record.id);
    showToast(`Deleted "${record.fileName}" from Google Drive.`);
  };

  // --- Create / Edit / Delete Album & Track Handlers ---
  const handleCreateAlbumAndTrack = async (params: {
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
  }) => {
    if (!user) return;

    let targetAlbum: Album;
    if (params.mode === 'new' && params.newAlbum) {
      targetAlbum = await createAlbumInFirestore(user, {
        ...params.newAlbum,
        trackCount: 0,
      });
    } else if (params.existingAlbum) {
      targetAlbum = params.existingAlbum;
    } else {
      throw new Error('No target album specified.');
    }

    const createdTrack = await createTrackInFirestore(user, targetAlbum, params.trackInput);
    showToast(`Published "${createdTrack.title}" to "${targetAlbum.title}".`);

    if (params.backupToDrive && params.audioBlob) {
      await handleBackupBlobToDrive(
        params.audioBlob,
        params.audioFileName || `${createdTrack.title}.wav`,
        params.audioBlob.type || 'audio/wav',
        'audio_master',
        createdTrack,
        targetAlbum
      );
    }

    if (params.backupToDrive && params.imageBlob) {
      const ctx = await requireDriveAccess();
      if (ctx) {
        await uploadBlobToDrive(
          ctx.token,
          ctx.folderId,
          params.imageBlob,
          params.imageFileName || `${createdTrack.title}_cover.jpg`,
          params.imageBlob.type || 'image/jpeg'
        );
      }
    }
  };

  const handleUpdateAlbum = async (
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
  ) => {
    const childTracks = ownedTracks.filter((t) => t.albumId === album.id);
    await updateAlbumInFirestore(album, updates, childTracks);
    showToast(`Updated album "${updates.title}".`);
  };

  const handleDeleteAlbum = async (album: Album) => {
    const childTracks = ownedTracks.filter((t) => t.albumId === album.id);
    if (playingTrack && childTracks.some((t) => t.id === playingTrack.id)) {
      stopAudioEngine();
      setPlayingTrack(null);
    }
    await deleteAlbumAndTracksInFirestore(album, childTracks);
    showToast(`Deleted album "${album.title}".`);
  };

  const handleUpdateTrack = async (
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
  ) => {
    await updateTrackInFirestore(track, updates);
    showToast(`Updated track "${updates.title}".`);
  };

  const handleDeleteTrack = async (track: Track) => {
    if (playingTrack?.id === track.id) {
      stopAudioEngine();
      setPlayingTrack(null);
    }
    const parentAlbum = ownedAlbums.find((a) => a.id === track.albumId);
    await deleteTrackInFirestore(track, parentAlbum);
    showToast(`Deleted track "${track.title}".`);
  };

  const handleClearAllUploads = async () => {
    stopAudioEngine();
    setPlayingTrack(null);
    setDrawerAlbum(null);
    setWaveformTrack(null);
    await clearAllUserUploadsInFirestore(ownedAlbums, ownedTracks);
    showToast('Cleared all uploaded tracks, albums, and local media.');
  };

  // Filtered tracks for Archive & Feed table
  const filteredTracks = useMemo(() => {
    return allTracks.filter((trk) => {
      if (filterTab === 'Albums' && trk.releaseType !== 'Album') return false;
      if (filterTab === 'Singles' && trk.releaseType !== 'Single') return false;
      if (filterTab === 'EPs' && trk.releaseType !== 'EP') return false;
      if (filterTab === 'Remixes' && trk.releaseType !== 'Remix') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          trk.title.toLowerCase().includes(q) ||
          trk.artist.toLowerCase().includes(q) ||
          trk.albumTitle.toLowerCase().includes(q) ||
          trk.commentary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allTracks, filterTab, searchQuery]);

  const visibleAlbums = showAllAlbums ? allAlbums : allAlbums.slice(0, 6);

  const scrollToSection = (nav: typeof activeNav, elementId?: string) => {
    setActiveNav(nav);
    if (elementId) {
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const playingDuration =
    currentBufferRef.current?.duration || playingTrack?.durationSec || 1;
  const playProgressPct = Math.min(100, Math.max(0, (currentTimeSec / playingDuration) * 100));
  const isAuthenticated = Boolean(user);

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 pb-20">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-[#070709]/92 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1380px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Wordmark — press twice to unlock Studio Login / Sign Up */}
          <button
            type="button"
            onClick={handleBrandPress}
            className="font-mono text-base md:text-lg font-medium tracking-[0.22em] tabular-nums text-white whitespace-nowrap shrink-0 cursor-pointer select-none bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            aria-label="00:00"
          >
            00:00
          </button>

          {/* Zone 2: Public links vs Authenticated Studio links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium tracking-[0.16em] uppercase">
            <button
              type="button"
              onClick={() => scrollToSection('feed', 'featured-section')}
              className={`py-5 border-b transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeNav === 'feed'
                  ? 'text-white border-white'
                  : 'text-zinc-400 border-transparent hover:text-white'
              }`}
            >
              Feed
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('albums', 'albums-section')}
              className={`py-5 border-b transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeNav === 'albums'
                  ? 'text-white border-white'
                  : 'text-zinc-400 border-transparent hover:text-white'
              }`}
            >
              Albums
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('archive', 'archive-section')}
              className={`py-5 border-b transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeNav === 'archive'
                  ? 'text-white border-white'
                  : 'text-zinc-400 border-transparent hover:text-white'
              }`}
            >
              Archive
            </button>
            {isAuthenticated && (
              <>
                <button
                  type="button"
                  onClick={() => scrollToSection('manage', 'manage-uploads-section')}
                  className={`py-5 border-b transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeNav === 'manage'
                      ? 'text-white border-white'
                      : 'text-zinc-400 border-transparent hover:text-white'
                  }`}
                >
                  Manage
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('cloud', 'cloud-backup-section')}
                  className={`py-5 border-b transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeNav === 'cloud'
                      ? 'text-white border-white'
                      : 'text-zinc-400 border-transparent hover:text-white'
                  }`}
                >
                  Cloud Backup
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: Single primary action (Post Track only when logged in; Share/Listen for public) */}
          <div className="shrink-0">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] bg-white text-black hover:bg-zinc-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Post Track
              </button>
            ) : featuredTrack ? (
              <button
                type="button"
                onClick={() => handleTogglePlayTrack(featuredTrack)}
                className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] border border-white/25 text-white hover:bg-white hover:text-black transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {playingTrack?.id === featuredTrack.id && isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {playingTrack?.id === featuredTrack.id && isPlaying ? 'Pause' : 'Listen'}
              </button>
            ) : (
              <span className="font-mono text-xs tracking-[0.2em] text-zinc-500 uppercase whitespace-nowrap shrink-0">
                Archive
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1380px] mx-auto px-6 space-y-12 pt-4">
        {/* Hero Eclipse Banner */}
        <section
          id="top"
          className="relative overflow-hidden border border-white/10 min-h-[240px] md:min-h-[280px] flex items-center"
        >
          <img
            src={HERO_BACKDROP_URL}
            alt="Eclipse over dark clouds"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070709] via-[#070709]/75 to-[#070709]/40" />

          <div className="relative z-10 w-full px-6 md:px-10 py-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-300">
                  Music
                </span>
                <span className="h-px w-14 bg-white/30" />
              </div>

              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase tracking-tight text-white leading-[1.04] text-balance">
                Sound For A Quieter Tomorrow
              </h1>

              <p className="text-sm md:text-base text-zinc-300">
                Music for deeper thinking, wider horizons. Explore releases, read liner notes, and listen without distraction.
              </p>
            </div>

            <div className="hidden md:flex flex-col items-end text-right space-y-1.5 text-[11px] uppercase tracking-[0.28em] text-zinc-300 shrink-0">
              <span>Explore</span>
              <span>Listen</span>
              <span>Feel</span>
              <span>Repeat</span>
              <span className="h-px w-10 bg-white/40 mt-2" />
            </div>
          </div>
        </section>

        {/* Featured Release Split (when at least 1 track & album are published) */}
        <section id="featured-section">
          {featuredAlbum && featuredTrack ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              {/* Featured Release Player Card */}
              <div className="lg:col-span-8 border border-white/10 bg-[#0c0c10] grid grid-cols-1 md:grid-cols-12 overflow-hidden">
                <div className="md:col-span-7 p-6 md:p-7 flex flex-col justify-between gap-5 relative bg-gradient-to-br from-[#19090a] via-[#0d0d11] to-[#0a0a0d]">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-300">
                        Featured Release
                      </span>
                      <span className="h-px w-12 bg-white/25" />
                    </div>

                    <div>
                      <h2
                        onClick={() => {
                          setDrawerAlbum(featuredAlbum);
                          setDrawerInitialTrackId(featuredTrack.id);
                        }}
                        className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight cursor-pointer hover:text-red-400 transition-colors"
                      >
                        {featuredAlbum.title}
                      </h2>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 mt-1">
                        {featuredAlbum.artist}
                      </p>
                    </div>

                    {(featuredAlbum.commentary || featuredTrack.commentary) && (
                      <p className="text-xs md:text-sm text-zinc-300 leading-relaxed line-clamp-3">
                        {featuredAlbum.commentary || featuredTrack.commentary}
                      </p>
                    )}
                  </div>

                  {/* Inline Waveform & Play Screen Controls */}
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-3.5">
                      <button
                        type="button"
                        onClick={() => handleTogglePlayTrack(featuredTrack)}
                        className="w-11 h-11 rounded-full bg-white text-black hover:bg-zinc-200 flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer"
                        aria-label={
                          playingTrack?.id === featuredTrack.id && isPlaying
                            ? 'Pause featured track'
                            : 'Play featured track'
                        }
                      >
                        {loadingTrackId === featuredTrack.id ? (
                          <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        ) : playingTrack?.id === featuredTrack.id && isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>

                      <div
                        className="flex-1 flex items-center gap-[2px] h-10 cursor-pointer"
                        onClick={(e) => {
                          if (playingTrack?.id !== featuredTrack.id) {
                            handleTogglePlayTrack(featuredTrack);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          handleSeek((e.clientX - rect.left) / rect.width);
                        }}
                        title="Click to play or scrub"
                      >
                        {featuredTrack.waveformPeaks.slice(0, 44).map((peak, i) => {
                          const pct = (i / 44) * 100;
                          const active =
                            playingTrack?.id === featuredTrack.id && pct <= playProgressPct;
                          return (
                            <span
                              key={i}
                              style={{ height: `${Math.max(14, peak)}%` }}
                              className={`flex-1 transition-colors ${
                                active ? 'bg-red-500' : 'bg-white/45'
                              }`}
                            />
                          );
                        })}
                      </div>

                      <span className="font-mono text-[11px] text-zinc-300 tabular-nums shrink-0">
                        {playingTrack?.id === featuredTrack.id
                          ? formatDuration(currentTimeSec)
                          : '00:00'}{' '}
                        / {formatDuration(featuredTrack.durationSec)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                        {featuredAlbum.releaseType} ·{' '}
                        {featuredAlbum.tags.slice(0, 2).join(' · ') || 'Audio'} ·{' '}
                        {featuredAlbum.year}
                      </p>

                      <div className="flex items-center gap-3.5 text-[11px] uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleToggleLike(featuredTrack)}
                          className={`inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                            likedTrackIds.has(featuredTrack.id)
                              ? 'text-red-400'
                              : 'text-zinc-300 hover:text-white'
                          }`}
                          aria-label={`Like ${featuredTrack.title}`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${
                              likedTrackIds.has(featuredTrack.id)
                                ? 'fill-red-500 text-red-500'
                                : ''
                            }`}
                          />
                          <span className="font-mono tabular-nums">
                            {getLikeCount(featuredTrack)}
                          </span>
                        </button>

                        {isAuthenticated && (
                          <button
                            type="button"
                            onClick={() => setWaveformTrack(featuredTrack)}
                            className="text-red-400 hover:text-red-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Scissors className="w-3 h-3" />
                            Trim Reel
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setDrawerAlbum(featuredAlbum);
                            setDrawerInitialTrackId(featuredTrack.id);
                          }}
                          className="text-zinc-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Comments
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setShareTarget({ album: featuredAlbum, track: featuredTrack })
                          }
                          className="text-zinc-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Share2 className="w-3 h-3" />
                          Share
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => {
                    setDrawerAlbum(featuredAlbum);
                    setDrawerInitialTrackId(featuredTrack.id);
                  }}
                  className="md:col-span-5 relative min-h-[220px] md:min-h-full overflow-hidden cursor-pointer group bg-[#120708]"
                >
                  <CoverImage
                    src={featuredAlbum.coverUrl}
                    alt={featuredAlbum.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                </div>
              </div>

              {/* Right: Commentary & Quick Track Info */}
              <div className="lg:col-span-4 border border-white/10 bg-[#0b0b0f] p-6 md:p-7 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                      Track Notes
                    </span>
                    <span className="h-px w-10 bg-white/20" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-white tracking-tight">
                    {featuredTrack.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {featuredTrack.commentary ||
                      'Published directly to the 00:00 feed. Open album details to read listener comments and discuss this release.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerAlbum(featuredAlbum);
                      setDrawerInitialTrackId(featuredTrack.id);
                    }}
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-white hover:text-red-400 inline-flex items-center gap-2 cursor-pointer"
                  >
                    Open Release
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => setWaveformTrack(featuredTrack)}
                      className="text-xs font-semibold uppercase tracking-[0.16em] text-red-400 hover:text-red-300 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      Reel Studio
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-white/10 bg-[#0b0b0f] p-10 md:p-14 flex flex-col items-center justify-center text-center space-y-4">
              <Disc3 className="w-8 h-8 text-zinc-600" />
              <div className="space-y-1.5 max-w-md">
                <h2 className="font-display text-xl font-bold text-white tracking-tight">
                  Blank Canvas
                </h2>
                <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">
                  {isAuthenticated
                    ? 'Your archive is ready. Upload your first song, artwork, and written commentary to launch the feed.'
                    : 'No releases have been published yet. New albums and tracks will appear here once released.'}
                </p>
              </div>
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] bg-white text-black hover:bg-zinc-200 inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Post First Release
                </button>
              )}
            </div>
          )}
        </section>

        {/* New Music / Albums Grid */}
        {allAlbums.length > 0 && (
          <section id="albums-section" className="space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
              <div className="flex items-center gap-4">
                <h2 className="font-display text-xs font-bold uppercase tracking-[0.22em] text-white">
                  New Music &amp; Albums
                </h2>
                <span className="h-px w-10 bg-white/25 hidden sm:inline-block" />
              </div>

              {allAlbums.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllAlbums((v) => !v)}
                  className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300 hover:text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {showAllAlbums ? 'Show Top 6' : `View All Releases (${allAlbums.length})`}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {visibleAlbums.map((album) => {
                const leadTrack =
                  allTracks.find((t) => t.albumId === album.id) || featuredTrack;
                const isAlbumPlaying =
                  playingTrack?.albumId === album.id && isPlaying;

                return (
                  <article
                    key={album.id}
                    className="group space-y-2.5 cursor-pointer"
                    onClick={() => {
                      setDrawerAlbum(album);
                      setDrawerInitialTrackId(null);
                    }}
                  >
                    <div className="relative aspect-[4/3] bg-[#101014] border border-white/10 overflow-hidden">
                      <CoverImage
                        src={album.coverUrl}
                        alt={album.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

                      {leadTrack && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlayTrack(leadTrack);
                          }}
                          className={`absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                            isAlbumPlaying
                              ? 'bg-red-600 border-red-500 text-white'
                              : 'bg-black/65 border-white/60 text-white hover:bg-white hover:text-black'
                          }`}
                          aria-label={isAlbumPlaying ? `Pause ${album.title}` : `Play ${album.title}`}
                        >
                          {isAlbumPlaying ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <h3 className="font-display text-sm font-semibold text-white group-hover:text-red-400 transition-colors truncate">
                        {album.title}
                      </h3>
                      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                        <span className="truncate">{album.artist}</span>
                        <span className="font-mono tabular-nums shrink-0">
                          {album.year}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Song Feed & Archive + Editorial Sidebar */}
        <section
          id="archive-section"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2"
        >
          {/* Left: Track Feed & Archive Table */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
              <div className="flex items-center gap-4">
                <h2 className="font-display text-xs font-bold uppercase tracking-[0.22em] text-white">
                  Track Feed &amp; Archive
                </h2>
                <span className="h-px w-10 bg-white/25 hidden sm:inline-block" />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter tracks or notes..."
                    className="bg-[#0c0c10] border border-white/15 pl-8 pr-3 py-1 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40 w-44 sm:w-52"
                  />
                </div>

                <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.16em]">
                  {(['All', 'Albums', 'Singles', 'EPs', 'Remixes'] as FilterTab[]).map(
                    (tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setFilterTab(tab)}
                        className={`pb-1 border-b transition-colors cursor-pointer whitespace-nowrap ${
                          filterTab === tab
                            ? 'text-white border-white font-semibold'
                            : 'text-zinc-500 border-transparent hover:text-zinc-200'
                        }`}
                      >
                        {tab}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {allTracks.length === 0 ? (
              <div className="border border-white/10 bg-[#0b0b0f] p-8 text-center">
                <p className="text-xs text-zinc-500">
                  Track feed is currently empty.
                </p>
              </div>
            ) : filteredTracks.length === 0 ? (
              <div className="border border-white/10 bg-[#0b0b0f] p-8 text-center space-y-2">
                <p className="text-sm text-zinc-300">No tracks match the current filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('All');
                    setSearchQuery('');
                  }}
                  className="text-xs uppercase tracking-wider text-red-400 hover:text-red-300 cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/10 border-b border-white/10">
                {filteredTracks.map((trk, idx) => {
                  const active = playingTrack?.id === trk.id;
                  const parentAlbum =
                    allAlbums.find((a) => a.id === trk.albumId) || featuredAlbum;
                  const isLiked = likedTrackIds.has(trk.id);

                  return (
                    <div
                      key={trk.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:bg-white/[0.02] px-2 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePlayTrack(trk)}
                          className="relative w-14 h-10 bg-[#121217] border border-white/10 overflow-hidden shrink-0 cursor-pointer"
                          aria-label={active && isPlaying ? `Pause ${trk.title}` : `Play ${trk.title}`}
                        >
                          <CoverImage
                            src={trk.coverUrl}
                            alt={trk.title}
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                            {active && isPlaying ? (
                              <Pause className="w-3.5 h-3.5 text-red-400" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-white opacity-80 group-hover:opacity-100" />
                            )}
                          </span>
                        </button>

                        <span className="font-mono text-xs text-zinc-500 tabular-nums w-6 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (parentAlbum) {
                                  setDrawerAlbum(parentAlbum);
                                  setDrawerInitialTrackId(trk.id);
                                }
                              }}
                              className="font-display text-sm font-semibold text-white hover:text-red-400 transition-colors truncate cursor-pointer text-left"
                            >
                              {trk.title}
                            </button>
                            <span className="text-[11px] text-zinc-500 truncate hidden md:inline">
                              · {trk.albumTitle}
                            </span>
                          </div>

                          {trk.commentary && (
                            <p className="text-xs text-zinc-400 truncate max-w-xl">
                              {trk.commentary}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 pl-20 sm:pl-0 shrink-0">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-zinc-400 hidden md:inline whitespace-nowrap">
                          {trk.releaseType} · {trk.year}
                        </span>

                        <span className="font-mono text-xs text-zinc-300 tabular-nums w-12 text-right">
                          {formatDuration(trk.durationSec)}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleLike(trk)}
                            className={`px-2 py-1.5 border text-[11px] font-mono tabular-nums inline-flex items-center gap-1 cursor-pointer transition-colors ${
                              isLiked
                                ? 'border-red-500/60 bg-red-500/15 text-red-400'
                                : 'border-white/10 hover:border-white/40 text-zinc-300 hover:text-white'
                            }`}
                            title="Like track"
                            aria-label={`Like ${trk.title}`}
                          >
                            <Heart
                              className={`w-3.5 h-3.5 ${
                                isLiked ? 'fill-red-500 text-red-500' : ''
                              }`}
                            />
                            <span>{getLikeCount(trk)}</span>
                          </button>

                          {isAuthenticated && (
                            <button
                              type="button"
                              onClick={() => setWaveformTrack(trk)}
                              className="p-1.5 border border-white/10 hover:border-red-500/60 text-zinc-300 hover:text-red-400 cursor-pointer transition-colors"
                              title="Trim Reel Snippet & Export"
                              aria-label={`Trim Reel for ${trk.title}`}
                            >
                              <Scissors className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {parentAlbum && (
                            <button
                              type="button"
                              onClick={() => {
                                setDrawerAlbum(parentAlbum);
                                setDrawerInitialTrackId(trk.id);
                              }}
                              className="p-1.5 border border-white/10 hover:border-white/40 text-zinc-300 hover:text-white cursor-pointer transition-colors"
                              title="View Comments & Album"
                              aria-label={`Comments for ${trk.title}`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isAuthenticated && (
                            <button
                              type="button"
                              onClick={() => handleBackupTrackAudio(trk)}
                              className="p-1.5 border border-white/10 hover:border-white/40 text-zinc-300 hover:text-white cursor-pointer transition-colors"
                              title="Back Up Audio to Google Drive"
                              aria-label={`Back up ${trk.title} to Drive`}
                            >
                              <CloudUpload className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setShareTarget({ album: parentAlbum, track: trk })
                            }
                            className="p-1.5 border border-white/10 hover:border-white/40 text-zinc-300 hover:text-white cursor-pointer transition-colors"
                            title="Share Track"
                            aria-label={`Share ${trk.title}`}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Editorial Quote & Authenticated Creator Session */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="border-t border-white/10 pt-6 space-y-4">
              <blockquote className="font-display text-sm md:text-base uppercase tracking-[0.16em] text-zinc-200 leading-relaxed">
                &ldquo;Music gives shape to a more thoughtful tomorrow.&rdquo;
              </blockquote>
              <div className="h-px w-10 bg-white/30" />
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] tabular-nums text-zinc-500">
                00:00
              </p>
            </div>

            {isAuthenticated && user && (
              <div className="border border-white/10 bg-[#0b0b0f] p-5 space-y-4">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                    Studio Account Active
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {user.displayName || user.email || 'Verified Creator'}
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {user.emailVerified
                      ? `Signed in (${user.email}). Uploads, waveform trim, and Drive backup unlocked.`
                      : `Signed in (${user.email}). Verify email via 00:00 dialog or Google Fast Login to unlock writes.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setUploadModalOpen(true)}
                    className="px-3.5 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 cursor-pointer"
                  >
                    Post New Song
                  </button>
                  {!user.emailVerified && (
                    <button
                      type="button"
                      onClick={() => setAuthModalOpen(true)}
                      className="px-3.5 py-2 text-xs font-medium uppercase tracking-wider border border-amber-500/40 text-amber-300 cursor-pointer"
                    >
                      Verify / Fast Login
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={logout}
                    className="px-3.5 py-2 text-xs font-medium uppercase tracking-wider border border-white/15 hover:border-white/40 text-zinc-300 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </aside>
        </section>

        {/* Creator Account Management + Google Drive Backup (Strictly Logged-In Only) */}
        {isAuthenticated && (
          <>
            <CreatorUploadsManager
              albums={ownedAlbums}
              tracks={ownedTracks}
              onOpenUpload={() => setUploadModalOpen(true)}
              onOpenWaveform={(trk) => setWaveformTrack(trk)}
              onUpdateAlbum={handleUpdateAlbum}
              onDeleteAlbum={handleDeleteAlbum}
              onUpdateTrack={handleUpdateTrack}
              onDeleteTrack={handleDeleteTrack}
              onClearAllUploads={handleClearAllUploads}
            />

            <CloudBackupPanel
              user={user}
              hasDriveToken={Boolean(driveToken)}
              driveFolderId={driveFolderId}
              backups={backups}
              isSyncing={isSyncingDrive}
              onSignIn={handleGoogleFastLogin}
              onBackupFullCatalog={handleBackupFullCatalog}
              onRefreshDriveFiles={handleRefreshDriveFiles}
              onDownloadBackup={handleDownloadBackup}
              onDeleteBackup={handleDeleteBackup}
            />
          </>
        )}
      </main>

      {/* Compact Sticky Bottom Audio Player (Play Screen with Like Button) */}
      {playingTrack && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-[#0a0a0e]/95 backdrop-blur-md border-t border-white/15">
          <div
            className="h-0.5 bg-white/10 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              handleSeek((e.clientX - rect.left) / rect.width);
            }}
          >
            <div
              style={{ width: `${playProgressPct}%` }}
              className="h-full bg-red-500 transition-[width] duration-75"
            />
          </div>

          <div className="max-w-[1380px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => handleTogglePlayTrack(playingTrack)}
                className="w-8 h-8 rounded-full bg-white text-black hover:bg-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                )}
              </button>

              <CoverImage
                src={playingTrack.coverUrl}
                alt={playingTrack.title}
                className="w-8 h-8 object-cover border border-white/15 hidden sm:block shrink-0"
              />

              <div className="min-w-0">
                <p className="font-display text-xs font-semibold text-white truncate">
                  {playingTrack.title}
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {playingTrack.artist} · {playingTrack.albumTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <span className="font-mono text-[11px] text-zinc-300 tabular-nums hidden sm:inline">
                {formatDuration(currentTimeSec)} / {formatDuration(playingDuration)}
              </span>

              <button
                type="button"
                onClick={() => handleToggleLike(playingTrack)}
                className={`px-2.5 py-1.5 border text-[11px] font-mono tabular-nums inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  likedTrackIds.has(playingTrack.id)
                    ? 'border-red-500/60 bg-red-500/15 text-red-400'
                    : 'border-white/15 hover:border-white/40 text-zinc-200'
                }`}
                aria-label={`Like ${playingTrack.title}`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    likedTrackIds.has(playingTrack.id) ? 'fill-red-500 text-red-500' : ''
                  }`}
                />
                <span>{getLikeCount(playingTrack)}</span>
              </button>

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setWaveformTrack(playingTrack)}
                  className="px-3 py-1.5 text-[11px] uppercase tracking-wider border border-white/15 hover:border-red-500/60 text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Scissors className="w-3 h-3 text-red-400" />
                  Trim Reel
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const alb =
                    allAlbums.find((a) => a.id === playingTrack.albumId) || featuredAlbum;
                  setShareTarget({ album: alb, track: playingTrack });
                }}
                className="p-1.5 border border-white/15 hover:border-white/40 text-zinc-200 cursor-pointer"
                aria-label="Share current track"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 right-6 z-50 border border-white/20 bg-[#101015] px-4 py-3 text-xs text-white shadow-xl max-w-sm">
          {toastMessage}
        </div>
      )}

      {/* Hidden Auth Modal (Opened Only on Double-Press of 00:00) */}
      {authModalOpen && (
        <AuthModal
          open={authModalOpen}
          user={user}
          onClose={() => setAuthModalOpen(false)}
          onGoogleFastLogin={handleGoogleFastLogin}
          onEmailAuthSuccess={(signedInUser) => {
            setUser(signedInUser);
            if (signedInUser.emailVerified) {
              showToast(`Signed in as ${signedInUser.displayName || signedInUser.email}`);
            }
          }}
        />
      )}

      {/* Upload Modal (Logged-In Only) */}
      {isAuthenticated && uploadModalOpen && (
        <UploadPostModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          user={user}
          hasDriveToken={Boolean(driveToken)}
          userAlbums={ownedAlbums}
          onCreateAlbumAndTrack={handleCreateAlbumAndTrack}
        />
      )}

      {/* Album Detail Drawer */}
      {drawerAlbum && (
        <AlbumDetailDrawer
          album={drawerAlbum}
          tracks={drawerTracks}
          initialTrackId={drawerInitialTrackId}
          user={user}
          playingTrackId={playingTrack?.id ?? null}
          isPlaying={isPlaying}
          currentTimeSec={currentTimeSec}
          likedTrackIds={likedTrackIds}
          getLikeCount={getLikeCount}
          onToggleLike={handleToggleLike}
          onClose={() => {
            setDrawerAlbum(null);
            setDrawerInitialTrackId(null);
          }}
          onPlayTrack={handleTogglePlayTrack}
          onOpenWaveform={(trk) => {
            if (isAuthenticated) setWaveformTrack(trk);
          }}
          onOpenShare={(alb, trk) => setShareTarget({ album: alb, track: trk })}
          onBackupTrackToDrive={handleBackupTrackAudio}
          onBackupAlbumArchive={handleBackupAlbumArchive}
        />
      )}

      {/* Waveform Reel Studio (Logged-In Only) */}
      {isAuthenticated && waveformTrack && (
        <WaveformReelStudio
          track={waveformTrack}
          onClose={() => setWaveformTrack(null)}
          onSaveBounds={async (trk, startSec, endSec) => {
            if (user && trk.authorUid === user.uid) {
              await updateTrackSnippetBounds(trk.id, startSec, endSec);
            }
            showToast(`Saved snippet window (${formatDuration(startSec)}–${formatDuration(endSec)}).`);
          }}
          onBackupBlobToDrive={(blob, fileName, mimeType, kind, trk) =>
            handleBackupBlobToDrive(blob, fileName, mimeType, kind, trk)
          }
          onOpenShare={(trk) => {
            const alb = allAlbums.find((a) => a.id === trk.albumId) || null;
            setShareTarget({ album: alb, track: trk });
          }}
          canSaveToCloud={Boolean(
            waveformTrack && user && waveformTrack.authorUid === user.uid
          )}
          hasDriveToken={Boolean(driveToken)}
          onRequestSignIn={handleGoogleFastLogin}
        />
      )}

      {/* Share Modal */}
      {shareTarget && (
        <ShareModal
          open={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
          album={shareTarget?.album}
          track={shareTarget?.track}
        />
      )}
    </div>
  );
}
