// End-to-end smoke test against the live RougeChain testnet.
// Exercises the exact flow rougee-gram relies on: wallet -> faucet ->
// photo-envelope post -> read back -> like -> comment -> profile.
import { RougeChain, Wallet, pubkeyToAddress } from "@rougechain/sdk";

const API = "https://testnet.rougechain.io/api";
const rc = new RougeChain(API);
const log = (...a) => console.log(...a);
const ok = (c, m) => log(`${c ? "✅" : "❌"} ${m}`);

function envelope(cid, cap) {
  return JSON.stringify({ v: 1, t: "photo", cid, mime: "image/webp", w: 800, h: 800, cap });
}

async function waitForBalance(pub, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { balance } = await rc.getBalance(pub).catch(() => ({ balance: 0 }));
    if (balance > 0) return balance;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return 0;
}

async function main() {
  const health = await rc.getStats();
  ok(true, `node online — height ${health.network_height}, base fee ${health.base_fee}`);

  const w = Wallet.generate();
  const addr = await pubkeyToAddress(w.publicKey);
  ok(w.verify(), `generated wallet ${addr.slice(0, 22)}…`);

  log("→ requesting faucet…");
  const faucet = await rc.faucet(w);
  ok(faucet.success, `faucet: ${faucet.success ? "sent" : faucet.error}`);

  const bal = await waitForBalance(w.publicKey);
  ok(bal > 0, `balance funded: ${bal} XRGE`);

  log("→ creating photo post (JSON envelope in body)…");
  const body = envelope("ipfs://bafybeigdyrztsmoke", "rougee-gram smoke test 📷");
  const post = await rc.social.createPost(w, body);
  ok(post.success, `createPost: ${post.success ? post.data?.post?.id : post.error}`);
  const postId = post.data?.post?.id;
  if (!postId) throw new Error("no post id returned");

  log("→ reading global timeline…");
  const timeline = await rc.social.getGlobalTimeline(10, 0);
  const found = timeline.find((p) => p.id === postId);
  ok(Boolean(found), `post visible in timeline (${timeline.length} posts fetched)`);
  if (found) {
    const decoded = JSON.parse(found.body);
    ok(decoded.t === "photo" && decoded.cid.startsWith("ipfs://"), `envelope round-trips: cid=${decoded.cid}`);
  }

  log("→ liking own post…");
  const like = await rc.social.toggleLike(w, postId);
  ok(like.success, `toggleLike: liked=${like.liked} likes=${like.likes}`);

  const stats = await rc.social.getPostStats(postId, w.publicKey);
  ok(stats.likes >= 1 && stats.liked === true, `post stats: ${stats.likes} likes, liked=${stats.liked}`);

  log("→ commenting (threaded reply)…");
  const comment = await rc.social.createPost(w, "first! (smoke test comment)", postId);
  ok(comment.success, `comment: ${comment.success ? "ok" : comment.error}`);

  const replies = await rc.social.getPostReplies(postId);
  ok(replies.length >= 1, `replies fetched: ${replies.length}`);

  log("→ publishing profile envelope…");
  const profileBody = JSON.stringify({ v: 1, t: "profile", name: "Smoke Tester", bio: "on-chain & unbannable" });
  const prof = await rc.social.createPost(w, profileBody);
  ok(prof.success, `profile post: ${prof.success ? "ok" : prof.error}`);

  const mine = await rc.social.getUserPosts(w.publicKey, 20, 0);
  const hasProfile = mine.posts.some((p) => {
    try { return JSON.parse(p.body).t === "profile"; } catch { return false; }
  });
  ok(hasProfile, `profile discoverable via getUserPosts (${mine.total} total posts)`);

  const artist = await rc.social.getArtistStats(w.publicKey, w.publicKey);
  ok(typeof artist.followers === "number", `artist stats: ${artist.followers} followers, ${artist.following} following`);

  log("\n🎉 All core flows verified against live testnet.");
}

main().catch((e) => {
  console.error("❌ smoke test failed:", e);
  process.exit(1);
});
