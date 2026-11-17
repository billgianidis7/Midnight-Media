/**
 * Phase 0 Payload-First Security Test Runner Specification
 * Validates that every "Dirty Dozen+" adversarial payload violates invariants
 * and maps directly to Firestore rules rejections.
 */
import assert from 'node:assert/strict';

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  guardRule: string;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unverified Email Write',
    collection: 'albums',
    payload: { id: 'alb_1', title: 'Test', authToken: { email_verified: false } },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'isVerifiedUser() enforces request.auth.token.email_verified == true',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Album',
    collection: 'albums',
    payload: { id: 'alb_2', authorUid: 'victim_uid', requestAuthUid: 'attacker_uid' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'isValidAlbum() enforces data.authorUid == request.auth.uid',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Track',
    collection: 'tracks',
    payload: { id: 'trk_1', title: 'Track', isFeaturedAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'data.keys().hasOnly([...]) and affectedKeys().hasOnly([...])',
  },
  {
    id: 4,
    name: 'Orphaned Track Creation',
    collection: 'tracks',
    payload: { id: 'trk_2', albumId: 'non_existent_album' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'exists(/databases/$(database)/documents/albums/$(incoming().albumId))',
  },
  {
    id: 5,
    name: 'Path ID Poisoning',
    collection: 'albums',
    payload: { docId: 'bad$id!with spaces' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: "isValidId() matches '^[a-zA-Z0-9_\\\\-]+$' && size <= 128",
  },
  {
    id: 6,
    name: 'Unbounded Waveform Array',
    collection: 'tracks',
    payload: { waveformPeaks: new Array(200).fill(50) },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'data.waveformPeaks is list && data.waveformPeaks.size() <= 128',
  },
  {
    id: 7,
    name: 'Timestamp Forgery',
    collection: 'albums',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'incoming().createdAt == request.time',
  },
  {
    id: 8,
    name: 'Cross-Owner Album Mutation',
    collection: 'albums',
    payload: { title: 'Hacked', requestAuthUid: 'user_b', existingAuthorUid: 'user_a' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'existing().authorUid == request.auth.uid',
  },
  {
    id: 9,
    name: 'Immutable Ownership Hijack',
    collection: 'tracks',
    payload: { authorUid: 'user_b' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'incoming().authorUid == existing().authorUid',
  },
  {
    id: 10,
    name: 'PII Blanket Read',
    collection: 'users/userA/private/profile',
    payload: { requestAuthUid: 'user_b' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'isOwner(userId) strictly requires request.auth.uid == userId',
  },
  {
    id: 11,
    name: 'Private Album Comment Injection',
    collection: 'albums/private_alb/comments',
    payload: { body: 'Unauthorized comment', parentVisibility: 'private' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: "parent.data.visibility == 'public' || parent.data.authorUid == request.auth.uid",
  },
  {
    id: 12,
    name: 'Blanket List Query Bypass',
    collection: 'albums',
    payload: { query: 'all_documents_no_filter' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: "allow list: if resource.data.visibility == 'public' || (isSignedIn() && resource.data.authorUid == request.auth.uid)",
  },
  {
    id: 13,
    name: 'Non-Atomic Like Inflation',
    collection: 'tracks',
    payload: { likeCount: 999, withoutLikeDoc: true },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'existsAfter(/databases/$(database)/documents/tracks/$(trackId)/likes/$(request.auth.uid)) && likeCount == currentTrackLikes(existing()) + 1',
  },
  {
    id: 14,
    name: 'Spoofed TrackLike Identity',
    collection: 'tracks/trk_1/likes/user_b',
    payload: { userId: 'user_b', requestAuthUid: 'user_a' },
    expectedResult: 'PERMISSION_DENIED',
    guardRule: 'userId == request.auth.uid && isValidTrackLike(incoming(), trackId, userId)',
  },
];

assert.equal(DIRTY_DOZEN_PAYLOADS.length, 14);
