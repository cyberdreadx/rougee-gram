import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useNotes, type Note } from "@/hooks/useNotes";
import { useProfile, useMyProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import Avatar from "./Avatar";
import NoteEditor from "./NoteEditor";
import { displayName } from "@/lib/profile";
import { shortAddress } from "@/lib/format";

/**
 * Instagram-style "Notes" row for the top of the DM inbox — a horizontally
 * scrollable strip of short, 24h text statuses. The first item is your own note.
 */
export default function NotesRow() {
  const { notes, myNote } = useNotes();
  const [editing, setEditing] = useState(false);

  return (
    <div className="border-b border-ink-border/60">
      <div className="hide-scrollbar flex gap-4 overflow-x-auto px-4 py-3">
        <MyNoteBubble note={myNote} onClick={() => setEditing(true)} />
        {notes.map((n) => (
          <OtherNoteBubble key={n.pubkey} note={n} />
        ))}
      </div>
      {editing && (
        <NoteEditor note={myNote} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function NoteChip({ text }: { text: string }) {
  return (
    <div className="relative mb-1 max-w-[76px]">
      <div className="rounded-2xl rounded-bl-sm bg-ink-card px-2.5 py-1.5 text-center text-[11px] leading-tight text-white line-clamp-2">
        {text}
      </div>
      {/* little tail */}
      <span className="absolute -bottom-1 left-2 h-2 w-2 rounded-full bg-ink-card" />
    </div>
  );
}

function MyNoteBubble({ note, onClick }: { note: Note | null; onClick: () => void }) {
  const { address } = useAuth();
  const profile = useMyProfile();
  return (
    <button onClick={onClick} className="flex w-16 shrink-0 flex-col items-center gap-1">
      {note ? (
        <NoteChip text={note.text} />
      ) : (
        <div className="mb-1 rounded-2xl rounded-bl-sm bg-ink-card px-2.5 py-1.5 text-[11px] text-ink-muted">
          Note…
        </div>
      )}
      <div className="relative">
        <Avatar refUri={profile?.avatarRef} seed={address} name={profile?.name} size={52} />
        {!note && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-rouge-600 ring-2 ring-ink">
            <Plus className="h-3 w-3 text-white" />
          </span>
        )}
      </div>
      <span className="max-w-[64px] truncate text-[11px] text-ink-muted">Your note</span>
    </button>
  );
}

function OtherNoteBubble({ note }: { note: Note }) {
  const { data: profile } = useProfile(note.pubkey);
  const navigate = useNavigate();
  const name = profile ? displayName(profile) : shortAddress(note.pubkey, 6, 4);
  return (
    <button
      onClick={() => profile?.address && navigate(`/u/${profile.address}`)}
      className="flex w-16 shrink-0 flex-col items-center gap-1"
    >
      <NoteChip text={note.text} />
      <Avatar refUri={profile?.avatarRef} seed={note.pubkey} name={profile?.name} size={52} />
      <span className="max-w-[64px] truncate text-[11px] text-ink-muted">{name}</span>
    </button>
  );
}

