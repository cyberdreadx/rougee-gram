import { useRef } from "react";
import Avatar from "./Avatar";
import { useMentionAutocomplete } from "@/hooks/useMentionAutocomplete";

/**
 * Caption textarea with @mention autocomplete (suggestions from people the
 * viewer has already seen — see useMentionAutocomplete).
 */
export default function MentionCaption({
  value,
  onChange,
  disabled,
  placeholder,
  maxLength,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { suggestions, detect, pick, clear } = useMentionAutocomplete(value, onChange);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={className}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => {
          const el = e.target as HTMLTextAreaElement;
          detect(el.value, el.selectionStart ?? 0);
        }}
        onClick={(e) => {
          const el = e.target as HTMLTextAreaElement;
          detect(el.value, el.selectionStart ?? 0);
        }}
        onBlur={() => setTimeout(clear, 150)}
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-ink-border bg-ink-card shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.pubkey}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus; fire before blur
                pick(s.handle, ref.current);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
            >
              <Avatar seed={s.pubkey} size={24} />
              <span className="font-medium">@{s.handle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
