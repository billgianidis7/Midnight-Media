# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Verified Identity Ownership**: Every created `Album`, `Track`, `TrackLike`, `AlbumComment`, `TrackComment`, `UserPrivateInfo`, and `CloudBackupRecord` MUST carry `authorUid == request.auth.uid` (or `ownerUid == request.auth.uid` / `userId == request.auth.uid` / `uid == request.auth.uid`) and require `request.auth.token.email_verified == true`.
2. **Relational Integrity**: Every `Track` MUST reference an existing parent `Album` via `exists(/databases/$(database)/documents/albums/$(incoming().albumId))` at creation time. Every `AlbumComment`, `TrackComment`, and `TrackLike` MUST verify its parent `Album` or `Track` exists and is readable (`visibility == 'public'` or owned by actor).
3. **Atomic Like Synchronization**: Creating or deleting `/tracks/{trackId}/likes/{userId}` MUST atomically increment or decrement `likeCount` by exactly `1` on `/tracks/{trackId}` in the same write batch (`existsAfter` / `getAfter` enforcement).
4. **Immutable Lineage & Timestamps**: `id`, `authorUid`, `createdAt`, and `albumId` (on tracks/comments) are immutable after creation. `createdAt` and `updatedAt` MUST match `request.time`.
5. **PII Isolation**: User email addresses and Drive folder IDs live strictly under `/users/{userId}/private/profile` and are readable/writable only by `request.auth.uid == userId`.
6. **Bounded Arrays & Strings**: Every string enforces `.size()` bounds matching `firebase-blueprint.json`. `tags` <= 5 items; `waveformPeaks` <= 128 numbers.
7. **Zero-Trust Queries**: `allow list` on `/albums`, `/tracks`, and comments explicitly constrains `resource.data.visibility == 'public' || (isSignedIn() && resource.data.authorUid == request.auth.uid)` without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Attack Payloads (All Expected: PERMISSION_DENIED)
1. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create an `/albums/{id}`.
2. **Identity Spoofing on Album**: User A attempts to create an `/albums/{id}` with `authorUid: "user_B"`.
3. **Shadow Field Injection on Track**: Owner injects `{ isFeaturedAdmin: true }` into `/tracks/{id}` create or update.
4. **Orphaned Track Creation**: User creates a `/tracks/{id}` referencing a non-existent `albumId: "missing_album"`.
5. **Path ID Poisoning**: User attempts to create `/albums/invalid$id!with*badchars` or >128 char ID.
6. **Unbounded Waveform Array**: User submits `waveformPeaks` with 500 elements (> 128 limit) or non-numeric element `[ "bad" ]`.
7. **Timestamp Forgery**: User submits `createdAt` in the past instead of `request.time`.
8. **Cross-Owner Album Mutation**: User B attempts to update `title` or `commentary` on User A's album.
9. **Immutable Ownership Hijack**: User A attempts to update `authorUid` on their own track to User B's UID.
10. **PII Blanket Read**: User B attempts to `get` `/users/userA/private/profile`.
11. **Private Album Comment Injection**: User B attempts to post a comment onto User A's `visibility: "private"` album.
12. **Blanket List Query Bypass**: Unauthenticated user attempts to `list` `/albums` without `where('visibility', '==', 'public')`.
13. **Non-Atomic Like Inflation**: User increments `likeCount` by `+50` or updates `likeCount` without creating `/tracks/{id}/likes/{uid}`.
14. **Spoofed TrackLike Identity**: User A attempts to create `/tracks/{id}/likes/user_B`.
