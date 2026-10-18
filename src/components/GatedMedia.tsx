import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/store/auth";
import { useProfile } from "@/hooks/useProfile";
import { useSubStatus, useSubscribe } from "@/hooks/useSubs";
import { getGateToken, gatedMediaUrl } from "@/lib/subs";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

/**
 * A "subscribers only" photo. If the viewer is the creator or an active
 * subscriber, it fetches a short-lived gate token and shows the image; otherwise
 * it shows a lock with a Subscribe button (pays the creator's monthly XRGE price).
 */
export default function GatedMedia({
  authorPubkey,
  cid,
  alt,
  className,
}: {
  authorPubkey: string;
  cid: string;
  alt?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const { toast } = useToast();
  const { data: creator } = useProfile(authorPubkey);
  const isMine = !!publicKey && publicKey === authorPubkey;
  const status = useSubStatus(isMine ? undefined : authorPubkey);
  const entitled = isMine || !!status.data?.active;
  const subscribe = useSubscribe();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!entitled) {
      setUrl(null);
      return;
    }
    let active = true;
    setFailed(false);
    (async () => {
      const token = await getGateToken(authorPubkey, { wallet, publicKey, isExtensionWallet });
      if (!active) return;
      const u = token ? gatedMediaUrl(cid, token) : null;
      if (u) setUrl(u);
      else setFailed(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entitled, cid, authorPubkey, publicKey]);

  if (entitled) {
    if (failed) {
      return (
        <div className={cn("flex items-center justify-center bg-ink-soft text-xs text-ink-muted", className)}>
          {t("subs.unavailable")}
        </div>
      );
    }
    if (!url) return <div className={cn("skeleton", className)} />;
    return (
      <img
        src={url}
        alt={alt ?? ""}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("block", className)}
      />
    );
  }

  const price = creator?.subPrice ?? 0;
  const onSubscribe = () => {
    if (!creator) return;
    subscribe.mutate(
      { creator: authorPubkey, address: creator.address, price },
      {
        onSuccess: () => toast(t("subs.subscribed"), "success"),
        onError: (e) => toast(e instanceof Error ? e.message : t("subs.failed"), "error"),
      },
    );
  };

  return (
    <div className={cn("relative flex items-center justify-center bg-ink-soft", className)}>
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white">
          <Lock className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold">{t("subs.locked")}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {t("subs.lockedBy", { name: creator?.name || t("subs.thisCreator") })}
          </p>
        </div>
        {price > 0 ? (
          <button
            className="btn-primary px-4 py-2 text-sm"
            disabled={subscribe.isPending || !wallet}
            onClick={onSubscribe}
          >
            {subscribe.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("subs.subscribeFor", { price })
            )}
          </button>
        ) : (
          <p className="text-xs text-ink-muted">{t("subs.noPrice")}</p>
        )}
      </div>
    </div>
  );
}
