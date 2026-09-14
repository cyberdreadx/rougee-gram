export interface PutResult {
  /** Media reference URI: ipfs://<cid> or local://<hash> */
  ref: string;
  mime: string;
  size: number;
}

export type MediaBackend = "ipfs" | "local";
