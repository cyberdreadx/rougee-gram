/**
 * Message-request gate (Instagram/Signal-style). RougeChain's messenger has no
 * server-side "accept" primitive, so which conversations you've accepted — and
 * which senders you've rejected/blocked — is kept client-side, per account.
 *
 * A first DM from someone you don't follow is a *request*: it's quarantined and
 * its contents stay hidden until you Accept. Reject blocks that sender so their
 * future messages don't resurface. Reactive via useSyncExternalStore.
 */

interface Gate {
  accepted: string[]; // conversation ids you've accepted
  blocked: string[]; // participant pubkeys you've rejected/blocked
}

const listeners = new Set<() => void>();

function storageKey(address: string): string {
  return `rougee-gram:dm-gate:${address}`;
}

function read(address: string): Gate {
  try {
    const raw = localStorage.getItem(storageKey(address));
    const g = raw ? (JSON.parse(raw) as Partial<Gate>) : null;
    return { accepted: g?.accepted ?? [], blocked: g?.blocked ?? [] };
  } catch {
    return { accepted: [], blocked: [] };
  }
}

function write(address: string, g: Gate): void {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(g));
  } catch {
    /* ignore quota / private-mode errors */
  }
  listeners.forEach((l) => l());
}

/** Raw snapshot string for useSyncExternalStore (stable while unchanged). */
export function getGateSnapshot(address: string): string {
  if (!address) return "";
  return localStorage.getItem(storageKey(address)) ?? "";
}

export function subscribeGate(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function parseGate(snapshot: string): Gate {
  try {
    const g = snapshot ? (JSON.parse(snapshot) as Partial<Gate>) : null;
    return { accepted: g?.accepted ?? [], blocked: g?.blocked ?? [] };
  } catch {
    return { accepted: [], blocked: [] };
  }
}

export function acceptConversation(address: string, conversationId: string): void {
  if (!address || !conversationId) return;
  const g = read(address);
  if (!g.accepted.includes(conversationId)) {
    g.accepted.push(conversationId);
    write(address, g);
  }
}

/** Reject a sender: hide their conversation and keep future ones quarantined. */
export function blockPubkey(address: string, pubkey: string): void {
  if (!address || !pubkey) return;
  const g = read(address);
  if (!g.blocked.includes(pubkey)) {
    g.blocked.push(pubkey);
    write(address, g);
  }
}
