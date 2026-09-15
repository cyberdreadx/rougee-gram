import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Wallet, type WalletKeys, pubkeyToAddress } from "@rougechain/sdk";
import {
  saveWallet,
  unlockWallet,
  listWallets,
  deleteWallet,
  type StoredWalletMeta,
} from "@/lib/keystore";
import { requestFaucet, getXrgeBalance } from "@/lib/rouge";
import { invalidateProfile } from "@/lib/profile";
import * as extSigner from "@/lib/extensionSigner";

type Status = "loading" | "onboarding" | "locked" | "ready";

const LAST_ADDR_KEY = "rougee-gram:last-address";

interface AuthState {
  status: Status;
  wallet: WalletKeys | null;
  publicKey: string;
  address: string;
  wallets: StoredWalletMeta[];
  balance: number;
  /** True when signed in via the RougeChain browser extension (key stays in it). */
  isExtensionWallet: boolean;
  /** True when a RougeChain extension is present (desktop). */
  extensionDetected: boolean;
}

interface AuthActions {
  createWallet: (password: string) => Promise<{ mnemonic: string; address: string }>;
  finalizeOnboarding: () => Promise<void>;
  connectExtension: () => Promise<void>;
  importMnemonic: (mnemonic: string, password: string) => Promise<string>;
  importKeys: (publicKey: string, privateKey: string, password: string) => Promise<string>;
  unlock: (address: string, password: string) => Promise<void>;
  lock: () => void;
  logout: (address: string) => Promise<void>;
  refreshBalance: () => Promise<void>;
  refreshWallets: () => Promise<void>;
}

const Ctx = createContext<(AuthState & AuthActions) | null>(null);

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [wallet, setWallet] = useState<WalletKeys | null>(null);
  const [address, setAddress] = useState("");
  const [wallets, setWallets] = useState<StoredWalletMeta[]>([]);
  const [balance, setBalance] = useState(0);
  const [isExtensionWallet, setIsExtensionWallet] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);

  // Detect a RougeChain browser extension (desktop only).
  useEffect(() => {
    const check = () => setExtensionDetected(extSigner.extensionAvailable());
    check();
    window.addEventListener("rougechain#initialized", check);
    return () => window.removeEventListener("rougechain#initialized", check);
  }, []);

  const refreshWallets = useCallback(async () => {
    const list = await listWallets();
    setWallets(list);
    return;
  }, []);

  // Initial boot: decide onboarding vs locked.
  useEffect(() => {
    (async () => {
      const list = await listWallets();
      setWallets(list);
      setStatus(list.length > 0 ? "locked" : "onboarding");
    })();
  }, []);

  const activate = useCallback(async (keys: WalletKeys) => {
    const addr = await pubkeyToAddress(keys.publicKey);
    setWallet(keys);
    setAddress(addr);
    setIsExtensionWallet(false);
    setStatus("ready");
    try {
      localStorage.setItem(LAST_ADDR_KEY, addr);
    } catch {
      /* ignore */
    }
    // Fetch balance in the background.
    getXrgeBalance(keys.publicKey).then(setBalance).catch(() => {});
    return addr;
  }, []);

  // Connect the RougeChain browser extension: the private key stays in the
  // extension (wallet.privateKey stays ""), so writes route through it.
  const connectExtension = useCallback(async () => {
    const pk = await extSigner.connect();
    const addr = await pubkeyToAddress(pk);
    setWallet({ publicKey: pk, privateKey: "" });
    setAddress(addr);
    setIsExtensionWallet(true);
    setStatus("ready");
    try {
      localStorage.setItem(LAST_ADDR_KEY, addr);
    } catch {
      /* ignore */
    }
    getXrgeBalance(pk).then(setBalance).catch(() => {});
  }, []);

  const persistAndActivate = useCallback(
    async (w: Wallet, password: string, fundIfEmpty: boolean) => {
      const keys = w.toJSON();
      const addr = await pubkeyToAddress(keys.publicKey);
      await saveWallet(addr, keys, password);
      await refreshWallets();
      await activate(keys);

      if (fundIfEmpty) {
        // New accounts need XRGE to pay the tiny per-post fee. Fund via faucet.
        const bal = await getXrgeBalance(keys.publicKey);
        if (bal <= 0) {
          const ok = await requestFaucet(keys);
          if (ok) {
            getXrgeBalance(keys.publicKey).then(setBalance).catch(() => {});
          }
        }
      }
      return addr;
    },
    [activate, refreshWallets],
  );

  // Fresh-account creation is a two-step flow: create + persist (but stay on the
  // onboarding screen so the recovery phrase can be shown), then finalize once
  // the user confirms they've saved it. Funding runs in the background meanwhile.
  const pendingRef = useRef<WalletKeys | null>(null);

  const createWallet = useCallback(
    async (password: string) => {
      const w = Wallet.generate();
      const mnemonic = w.mnemonic ?? "";
      const keys = w.toJSON();
      const addr = await pubkeyToAddress(keys.publicKey);
      await saveWallet(addr, keys, password);
      await refreshWallets();
      pendingRef.current = keys;
      // Fund the new account in the background so it can post immediately.
      getXrgeBalance(keys.publicKey)
        .then((bal) => (bal <= 0 ? requestFaucet(keys) : false))
        .catch(() => {});
      return { mnemonic, address: addr };
    },
    [refreshWallets],
  );

  const finalizeOnboarding = useCallback(async () => {
    if (!pendingRef.current) return;
    const keys = pendingRef.current;
    pendingRef.current = null;
    await activate(keys);
  }, [activate]);

  const importMnemonic = useCallback(
    async (mnemonic: string, password: string) => {
      const w = Wallet.fromMnemonic(mnemonic.trim());
      return persistAndActivate(w, password, true);
    },
    [persistAndActivate],
  );

  const importKeys = useCallback(
    async (publicKey: string, privateKey: string, password: string) => {
      const w = Wallet.fromKeys(publicKey.trim(), privateKey.trim());
      if (!w.verify()) throw new Error("Public and private keys do not match.");
      return persistAndActivate(w, password, true);
    },
    [persistAndActivate],
  );

  const unlock = useCallback(
    async (addr: string, password: string) => {
      const keys = await unlockWallet(addr, password);
      await activate(keys);
    },
    [activate],
  );

  const lock = useCallback(() => {
    setWallet(null);
    setAddress("");
    setBalance(0);
    setIsExtensionWallet(false);
    // Extension sessions aren't in the keystore, so fall back to onboarding
    // when there are no stored wallets to unlock.
    setStatus(wallets.length > 0 ? "locked" : "onboarding");
  }, [wallets.length]);

  const logout = useCallback(
    async (addr: string) => {
      if (addr) await deleteWallet(addr);
      if (wallet) invalidateProfile(wallet.publicKey);
      const list = await listWallets();
      setWallets(list);
      setWallet(null);
      setAddress("");
      setBalance(0);
      setIsExtensionWallet(false);
      setStatus(list.length > 0 ? "locked" : "onboarding");
    },
    [wallet],
  );

  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    const bal = await getXrgeBalance(wallet.publicKey);
    setBalance(bal);
  }, [wallet]);

  const value = useMemo<AuthState & AuthActions>(
    () => ({
      status,
      wallet,
      publicKey: wallet?.publicKey ?? "",
      address,
      wallets,
      balance,
      isExtensionWallet,
      extensionDetected,
      createWallet,
      finalizeOnboarding,
      connectExtension,
      importMnemonic,
      importKeys,
      unlock,
      lock,
      logout,
      refreshBalance,
      refreshWallets,
    }),
    [
      status,
      wallet,
      address,
      wallets,
      balance,
      isExtensionWallet,
      extensionDetected,
      connectExtension,
      createWallet,
      finalizeOnboarding,
      importMnemonic,
      importKeys,
      unlock,
      lock,
      logout,
      refreshBalance,
      refreshWallets,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function getLastAddress(): string {
  try {
    return localStorage.getItem(LAST_ADDR_KEY) ?? "";
  } catch {
    return "";
  }
}
