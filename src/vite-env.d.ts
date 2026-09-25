/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUGE_API?: string;
  readonly VITE_ROUGE_NETWORK?: string;
  readonly VITE_PINATA_JWT?: string;
  readonly VITE_IPFS_GATEWAY?: string;
  readonly VITE_CF_WORKER_URL?: string;
  readonly VITE_CF_UPLOAD_SECRET?: string;
  readonly VITE_CF_STREAM?: string;
  readonly VITE_VERIFY_WORKER_URL?: string;
  readonly VITE_TIPS_WORKER_URL?: string;
  readonly VITE_STORY_WORKER_URL?: string;
  /** "true" reveals operator-only Settings (media backend, network switcher). */
  readonly VITE_SHOW_ADVANCED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
