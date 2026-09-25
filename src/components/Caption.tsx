import { useState } from "react";
import UserLink from "./UserLink";
import RichText from "./RichText";

export default function Caption({
  authorPubkey,
  text,
  clamp = 140,
}: {
  authorPubkey: string;
  text: string;
  clamp?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > clamp;
  const shown = expanded || !isLong ? text : text.slice(0, clamp).trimEnd();

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      <UserLink pubkey={authorPubkey} className="mr-1.5 font-semibold" />
      <RichText text={shown} />
      {isLong && !expanded && (
        <>
          …{" "}
          <button
            className="text-ink-muted hover:underline"
            onClick={() => setExpanded(true)}
          >
            more
          </button>
        </>
      )}
    </p>
  );
}
