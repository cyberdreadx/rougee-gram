# RougeChain messenger — node change requests

Two backend changes to the messenger, surfaced by real RouGee/Qwalla usage.
Both are node-side (the chain messenger backend that owns conversation records),
not client bugs — the clients already work around them as far as they can.

Endpoints referenced (all v2 signed):
`POST /api/v2/messenger/conversations` (create),
`POST /api/v2/messenger/conversations/list`,
`POST /api/v2/messenger/conversations/delete`,
`POST /api/v2/messenger/messages`,
`POST /api/v2/messenger/messages/delete`.

---

## 1. Deterministic conversation IDs (stop duplicate threads)

### Problem
`create conversation` mints a **new random id on every call**, from either party,
with no dedupe by participant set. A single pair therefore accumulates many
distinct 1:1 conversations, and their messages **scatter across those ids**.
Observed with real users: one contact shown as 4 separate "Encrypted
conversation" rows; another as 6 duplicate message requests — all the same
person.

Clients mitigate (RouGee now reuses an existing thread before creating and
collapses the list per participant-set) but cannot unify messages already split
across ids, nor stop the other side/other clients from minting new ones. The
durable fix is on the node.

### Proposed fix
Make 1:1 conversation creation **idempotent on a deterministic id** derived from
the participant set:

- **Canonical id (1:1):**
  `id = "dm_" + hex(sha256(sorted([pubkeyA, pubkeyB]).join("\n")))`
  Order-independent, so A→B and B→A resolve to the same id.
- **Create becomes upsert:** if a conversation with the canonical id exists,
  return it (`{ success:true, conversationId, existing:true }`) instead of
  inserting a duplicate. Response shape unchanged / backward-compatible.
- **Groups:** do **not** force-dedupe (`isGroup:true` / `participants.length > 2`)
  — two groups with the same members can be legitimately distinct. Keep random
  ids for groups (or derive from sorted members + a creation nonce/name).
- Messages already key on `conversation_id`, so once creation is idempotent all
  messages between a pair land under the one canonical id automatically.

### Migration
- **(a) Forward-only (low-risk):** new 1:1s deterministic; existing duplicates
  remain (clients already collapse them in the UI).
- **(b) One-time backfill (full fix):** for each set of 1:1 conversations sharing
  a participant pair, compute the canonical id, repoint every
  `message.conversation_id` to it, union participants/read-state, drop the
  emptied duplicates. Merges history; needs care around read receipts/unread.

Recommend shipping (a) now, scheduling (b) if history should unify.

### Acceptance criteria
- Two `create` calls for the same two pubkeys (any order, either side) return the
  **same** id and create **one** record.
- Messages between a pair always resolve to a single conversation in `…/list`.
- Group creation unaffected. No client change required.

---

## 2. Recoverable conversation/message delete (soft-delete + Trash)

### Problem
`conversations/delete` (and `messages/delete`) appear to be an **immediate,
irreversible server-side delete for the caller's account**. Because one wallet =
one inbox shared across every app signed into it, deleting in RouGee also cleared
it in Qwalla, with **no way to undo** — a real user lost a thread this way. There
is no `restore`/`undelete` endpoint.

The Mail side already models this well (Inbox / Sent / **Trash** with move +
permanent-delete). Messenger should match.

### Proposed fix
Two-stage delete, per participant (never touches the other party's copy):

1. **Soft-delete (default):** `conversations/delete` marks the conversation
   `deleted_at` **for the calling participant only** and hides it from `…/list`.
   Data is retained for a grace window (suggest **30 days**), then hard-deleted by
   a sweep. Same treatment for `messages/delete`.
2. **Restore:** new `POST /api/v2/messenger/conversations/restore`
   (signed, `{ conversationId }`, caller must be a participant) clears
   `deleted_at` and the thread + its messages reappear for that account.
   Optionally `…/messages/restore` for single messages.
3. **List filters (optional but useful):**
   - `…/conversations/list` accepts `folder: "inbox" | "trash"` (default inbox);
     `trash` returns soft-deleted-but-not-swept conversations so a UI can offer
     "Recently deleted".
4. **Permanent delete (optional):** `{ purge: true }` on delete, or a separate
   endpoint, to hard-delete immediately for users who want it gone now.

### Acceptance criteria
- Delete then restore (within the window) returns the conversation and all its
  messages to `…/list` for that account.
- Delete never affects the other participant's copy (unchanged from today).
- After the retention window, a soft-deleted thread is purged and no longer
  restorable.
- Existing clients keep working: default delete still "removes it from my inbox",
  just recoverably; `restore`/`folder:"trash"` are additive.

### Client follow-ups once this lands
- RouGee: add a "Recently deleted" view (`folder:"trash"`) + a Restore action;
  keep the current account-wide, can't-be-undone warning until restore exists.
- Consider a separate purely-local **"Delete for me on this device"** (client-side
  hide) distinct from the account-level delete, so a quick tidy-up never touches
  the shared server inbox.

---

Filed from RouGee (github.com/cyberdreadx/rougee-gram). Contact: the RouGee client
already implements the client-side halves (reuse-existing-thread + list collapse
for #1; account-wide delete warning for #2).
