# CareSignal Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. Default-deny catch-all at `/databases/{database}/documents/{document=**}` blocks all unlisted paths.
2. Every write requires `request.auth != null && request.auth.token.email_verified == true`.
3. Every single-document operation (`get`, `create`, `update`, `delete`) enforces `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, `<= 128` chars).
4. `users/{userId}` contains PII (`email`), so `get` and `list` are strictly restricted to `isOwner(userId)` or `isAdmin()` (no `list` allowed on `/users` for non-admins; owner accesses their exact doc).
5. Subcollections `/users/{userId}/savedPlaces/{placeDocId}` and `/users/{userId}/appointments/{bookingDocId}` enforce relational ownership (`ownerId == userId == request.auth.uid`), parent existence (`exists(/databases/$(database)/documents/users/$(userId))`) via Master Gate, strict `keys().hasAll(...) && keys().hasOnly(...)`, strict field sizes/enums, immutable `ownerId` and `createdAt`, and server timestamp checks (`request.time`).
6. Terminal state locking: once a `SavedAppointmentReceipt` reaches `status == 'cancelled'`, non-admin clients cannot reactivate it to `'confirmed'`.
7. Admin privileges derive exclusively from `/admins/{uid}` existence or the verified bootstrapped admin email (`malikijaz35938@gmail.com` with `email_verified == true`), never from user profile fields or custom claims.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unverified email create**: `users/{uid}` created when `request.auth.token.email_verified == false`.
2. **Identity spoofing**: User A (`uidA`) creates `users/{uidB}` or sets `uid: "uidB"` inside `users/{uidA}`.
3. **Ghost/shadow field injection**: Create `users/{uid}/savedPlaces/{id}` with extra field `isAdmin: true` or `verified: true`.
4. **Orphaned subcollection write**: Create `users/{uid}/savedPlaces/{id}` when parent `/users/{uid}` does not exist.
5. **Client timestamp forgery**: Create `savedPlaces/{id}` with `createdAt: "2020-01-01T00:00:00Z"` instead of server timestamp (`request.time`).
6. **Immutable ownerId mutation**: Update `savedPlaces/{id}` changing `ownerId` from `uidA` to `uidB`.
7. **ID poisoning**: Create document with 300-character ID or slashes/dots (`bad.id..123`).
8. **Denial-of-Wallet string bloat**: Create `savedPlaces/{id}` with `note` > 300 chars or `title` > 160 chars.
9. **Blanket user PII read/list**: User A executes `getDocs(collection(db, "users"))` or `getDoc(doc(db, "users", uidB))`.
10. **Cross-user subcollection list**: User A queries `users/{uidB}/appointments`.
11. **Terminal state resurrection**: Non-admin updates `appointments/{id}` from `status: "cancelled"` back to `"confirmed"`.
12. **Self-escalation to admin**: Non-admin writes `/admins/{uid}` to grant themselves admin access.
