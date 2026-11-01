import { useMemo, useState } from "react";
import { Check, ListPlus, Loader2, Plus, Settings2, Trash2, X } from "lucide-react";
import { useAuth } from "@/store/auth";
import {
  addMember,
  createFeed,
  deleteFeed,
  hasMember,
  removeMember,
  renameFeed,
  resolveMemberInput,
  useCustomFeeds,
  type CustomFeed,
  type FeedMember,
} from "@/lib/customFeeds";
import { useAuthorsFeed } from "@/hooks/useSocial";
import { useNostrAuthorsFeed } from "@/hooks/useNostrFeed";
import { useProfile } from "@/hooks/useProfile";
import { displayName } from "@/lib/profile";
import { shortAddress } from "@/lib/format";
import { shortNpub } from "@/lib/nostrAuth";
import { toMs, type FeedPost } from "@/lib/nostrFeed";
import FeedList from "./FeedList";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

/** The signed-in owner key custom feeds are stored under. */
export function useFeedOwner(): string {
  const { address } = useAuth();
  return address || "anon";
}

/** A custom feed's posts: its RougeChain + Nostr accounts merged, newest-first. */
export function CustomFeedView({ feed }: { feed: CustomFeed }) {
  const [editing, setEditing] = useState(false);
  const rougeIds = useMemo(
    () => feed.members.filter((m) => m.network === "rouge").map((m) => m.id),
    [feed.members],
  );
  const nostrIds = useMemo(
    () => feed.members.filter((m) => m.network === "nostr").map((m) => m.id),
    [feed.members],
  );
  const rouge = useAuthorsFeed(rougeIds);
  const nostr = useNostrAuthorsFeed(nostrIds, nostrIds.length > 0);

  const posts = useMemo<FeedPost[]>(() => {
    const seen = new Set<string>();
    const out: FeedPost[] = [];
    for (const p of [...((rouge.data ?? []) as FeedPost[]), ...nostr.posts]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out.sort((a, b) => toMs(b.created_at) - toMs(a.created_at));
  }, [rouge.data, nostr.posts]);

  return (
    <>
      <div className="flex items-center justify-between border-b border-ink-border px-4 py-2 text-xs text-ink-muted">
        <span>
          {feed.members.length} account{feed.members.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5 hover:text-white"
        >
          <Settings2 className="h-3.5 w-3.5" /> Edit feed
        </button>
      </div>
      <FeedList
        posts={posts}
        isLoading={(rouge.isLoading && rougeIds.length > 0) || (nostr.isLoading && posts.length === 0)}
        emptyState={
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-ink-muted">
              {feed.members.length === 0
                ? "This feed is empty. Add RougeChain or Nostr accounts to fill it."
                : "No posts from these accounts yet."}
            </p>
            <button className="btn-primary" onClick={() => setEditing(true)}>
              Add accounts
            </button>
          </div>
        }
      />
      {editing && <FeedEditor feed={feed} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Rename a feed, add/remove accounts by @handle / npub / address, or delete it. */
export function FeedEditor({ feed, onClose }: { feed: CustomFeed; onClose: () => void }) {
  const owner = useFeedOwner();
  const { toast } = useToast();
  const [name, setName] = useState(feed.name);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function add() {
    if (!input.trim() || busy) return;
    setBusy(true);
    const m = await resolveMemberInput(input);
    setBusy(false);
    if (!m) {
      toast("Couldn't find that account", "error");
      return;
    }
    if (hasMember(feed, m)) {
      toast("Already in this feed");
      return;
    }
    addMember(owner, feed.id, m);
    setInput("");
  }

  return (
    <Modal onClose={onClose} title="Edit feed">
      <label className="mb-1 block text-xs text-ink-muted">Name</label>
      <input
        className="input w-full"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => renameFeed(owner, feed.id, name)}
        onKeyDown={(e) => e.key === "Enter" && renameFeed(owner, feed.id, name)}
      />

      <label className="mb-1 mt-4 block text-xs text-ink-muted">Add an account</label>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          placeholder="@handle, rouge1…, or npub1…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="btn-primary px-3" onClick={add} disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        Tip: you can also tap "Add to feed" on any profile.
      </p>

      <div className="mt-4 space-y-3">
        {feed.members.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-muted">No accounts yet.</p>
        )}
        {feed.members.map((m) => (
          <MemberRow
            key={`${m.network}:${m.id}`}
            member={m}
            onRemove={() => removeMember(owner, feed.id, m)}
          />
        ))}
      </div>

      <div className="mt-6 border-t border-ink-border pt-4">
        {confirmDelete ? (
          <div className="flex gap-2">
            <button className="btn-soft flex-1" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              className="btn-primary flex-1 !bg-rose-600"
              onClick={() => {
                deleteFeed(owner, feed.id);
                onClose();
              }}
            >
              Delete "{feed.name}"
            </button>
          </div>
        ) : (
          <button
            className="flex items-center gap-1.5 text-sm text-rose-400 hover:text-rose-300"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete feed
          </button>
        )}
      </div>
    </Modal>
  );
}

function MemberRow({ member, onRemove }: { member: FeedMember; onRemove: () => void }) {
  const { data: profile } = useProfile(member.network === "rouge" ? member.id : undefined);
  const name =
    member.network === "rouge"
      ? profile
        ? displayName(profile)
        : member.name || shortAddress(member.id, 8, 4)
      : member.name || shortNpub(member.id);
  const sub = member.network === "rouge" ? "RougeChain" : `Nostr · ${shortNpub(member.id)}`;
  return (
    <div className="flex items-center gap-3">
      <Avatar
        refUri={member.network === "rouge" ? profile?.avatarRef : undefined}
        seed={member.id}
        name={name}
        size={36}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="truncate text-xs text-ink-muted">{sub}</div>
      </div>
      <button
        onClick={onRemove}
        className="rounded-lg p-2 text-ink-muted hover:bg-white/5 hover:text-white"
        aria-label={`Remove ${name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Make a new, empty feed. Calls `onCreated` with it so the caller can open it. */
export function NewFeedModal({
  onClose,
  onCreated,
  first,
}: {
  onClose: () => void;
  onCreated?: (feed: CustomFeed) => void;
  first?: FeedMember;
}) {
  const owner = useFeedOwner();
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    const feed = createFeed(owner, name, first);
    onCreated?.(feed);
    onClose();
  };
  return (
    <Modal onClose={onClose} title="New feed">
      <input
        className="input w-full"
        placeholder="Name it — e.g. Artists, Cypherpunks, Friends"
        value={name}
        maxLength={40}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <p className="mt-2 text-xs text-ink-muted">
        Mix RougeChain and Nostr accounts. You don't have to follow them, and they won't be told.
      </p>
      <button className="btn-primary mt-4 w-full" onClick={submit} disabled={!name.trim()}>
        Create feed
      </button>
    </Modal>
  );
}

/** Profile button: toggle this account in any of your custom feeds. */
export function AddToFeedButton({
  member,
  className,
  label = false,
}: {
  member: FeedMember;
  className?: string;
  label?: boolean;
}) {
  const owner = useFeedOwner();
  const feeds = useCustomFeeds(owner);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inAny = feeds.some((f) => hasMember(f, member));

  return (
    <>
      <button
        onClick={() => (feeds.length ? setOpen(true) : setCreating(true))}
        className={cn(className)}
        aria-label="Add to feed"
        title="Add to feed"
      >
        <ListPlus className={cn("h-4 w-4", inAny && "text-rouge-400")} />
        {label && <span>Add to feed</span>}
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} title="Add to feed">
          <div className="space-y-1">
            {feeds.map((f) => {
              const on = hasMember(f, member);
              return (
                <button
                  key={f.id}
                  onClick={() =>
                    on ? removeMember(owner, f.id, member) : addMember(owner, f.id, member)
                  }
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-white/5"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {f.name}
                    <span className="ml-2 text-xs text-ink-muted">{f.members.length}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      on ? "border-rouge-500 bg-rouge-600 text-white" : "border-ink-border",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            className="btn-soft mt-3 flex w-full items-center justify-center gap-1.5"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" /> New feed
          </button>
        </Modal>
      )}
      {creating && <NewFeedModal first={member} onClose={() => setCreating(false)} />}
    </>
  );
}
