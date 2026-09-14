/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUGE_API?: string;
  readonly VITE_ROUGE_NETWORK?: string;
  readonly VITE_PINATA_JWT?: string;
  readonly VITE_IPFS_GATEWAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
