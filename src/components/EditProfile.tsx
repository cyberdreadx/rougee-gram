import { useRef, useState } from "react";
import { Camera, Loader2, Link2, Plus, X } from "lucide-react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { useToast } from "./Toast";
import { useUpdateProfile } from "@/hooks/useProfile";
import type { Profile } from "@/lib/profile";
import { processImage } from "@/lib/image";
import { putImage } from "@/lib/media";
import {
  NAME_LIMIT,
  BIO_LIMIT,
  PROFILE_LINKS_MAX,
  LINK_LABEL_LIMIT,
  normalizeLinkUrl,
  type ProfileLink,
} from "@/lib/envelope";

export default function EditProfile({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateProfile();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [avatarRef, setAvatarRef] = useState(profile.avatarRef);
  const [localPreview, setLocalPreview] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [links, setLinks] = useState<ProfileLink[]>(profile.links);

  function updateLink(i: number, patch: Partial<ProfileLink>) {
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLink() {
    setLinks((ls) => (ls.length >= PROFILE_LINKS_MAX ? ls : [...ls, { url: "" }]));
  }
  function removeLink(i: number) {
    setLinks((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function pickAvatar(f: File | null) {
    if (!f) return;
    setUploadingAvatar(true);
    try {
      setLocalPreview(URL.createObjectURL(f));
      const img = await processImage(f, { square: true, maxSize: 400, quality: 0.85 });
      const media = await putImage(img.blob, "avatar");
      setAvatarRef(media.ref);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Avatar upload failed", "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function save() {
    // Drop blank rows; reject any non-empty URL that isn't a valid http(s) link.
    const filled = links.filter((l) => (l.url || "").trim());
    const bad = filled.find((l) => !normalizeLinkUrl(l.url));
    if (bad) {
      toast(`"${bad.url}" isn't a valid link.`, "error");
      return;
    }
    update.mutate(
      { name, bio, avatarRef, links: filled, vfy: profile.vfy },
      {
        onSuccess: () => {
          toast("Profile saved", "success");
          onClose();
        },
        onError: (e) =>
          toast(e instanceof Error ? e.message : "Save failed", "error"),
      },
    );
  }

  return (
    <Modal onClose={onClose} title="Edit profile" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2">
          <button
            className="relative"
            onClick={() => fileInput.current?.click()}
            disabled={uploadingAvatar}
          >
            {localPreview ? (
              <img
                src={localPreview}
                alt="avatar preview"
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <Avatar refUri={avatarRef} seed={profile.pubkey} name={name} size={80} />
            )}
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-rouge-600 text-white ring-2 ring-ink-card">
              {uploadingAvatar ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </span>
          </button>
          <button
            className="text-xs text-rouge-400 hover:underline"
            onClick={() => fileInput.current?.click()}
          >
            Change photo
          </button>
        </div>

        <div>
          <label className="label">Display name</label>
          <input
            className="input"
            value={name}
            maxLength={NAME_LIMIT}
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Bio</label>
          <textarea
            className="input h-24 resize-none"
            value={bio}
            maxLength={BIO_LIMIT}
            placeholder="Tell people about yourself"
            onChange={(e) => setBio(e.target.value)}
          />
          <div className="mt-1 text-right text-xs text-ink-muted">
            {bio.length}/{BIO_LIMIT}
          </div>
        </div>

        <div>
          <label className="label flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Links
          </label>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="rounded-xl border border-ink-border bg-ink-soft p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={l.url}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="yoursite.com"
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                  />
                  <button
                    className="btn-ghost h-9 w-9 shrink-0 p-0"
                    onClick={() => removeLink(i)}
                    aria-label="Remove link"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  className="input mt-2"
                  value={l.label ?? ""}
                  maxLength={LINK_LABEL_LIMIT}
                  placeholder="Label (optional)"
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                />
              </div>
            ))}
          </div>
          {links.length < PROFILE_LINKS_MAX && (
            <button
              className="btn-soft mt-2 w-full justify-center gap-1.5 py-2 text-sm"
              onClick={addLink}
            >
              <Plus className="h-4 w-4" /> Add link
            </button>
          )}
        </div>

        <button
          className="btn-primary w-full py-3"
          onClick={save}
          disabled={update.isPending || uploadingAvatar}
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </button>
        <p className="text-center text-xs text-ink-muted">
          Your profile is published as a signed on-chain post.
        </p>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
      />
    </Modal>
  );
}
