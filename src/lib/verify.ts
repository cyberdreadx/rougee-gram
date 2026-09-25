import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

/**
 * RouGee verified "checks" — Hybrid model.
 *
 * A user is verified when BOTH hold:
 *  1. their profile carries a `vfy` attestation — an ML-DSA-65 signature by
 *     **RouGee HQ** over `verify:v1:<their pubkey>` (issued once, after they
 *     proved control of their on-chain mail via a one-time code), AND
 *  2. they currently hold ≥ VERIFY_MIN_XRGE (a live balance check at read time,
 *     so selling below the threshold silently drops the badge).
 *
 * Issuance (mail code + balance gate + signing) runs in the `rougee-verify`
 * Worker; reading is fully client-side/on-chain — the signature is verifiable
 * against HQ's public key baked in below, and the balance is on-chain.
 */

/**
 * RouGee HQ's ML-DSA-65 public key (hex). The Worker signs attestations with the
 * matching secret (held only as a Worker secret). REPLACE with the real HQ
 * pubkey after generating the HQ wallet — until then no attestation verifies.
 */
export const HQ_PUBLIC_KEY = "f965ff1485e3c02e6e3287d3d56cdadbc81c999d49d0c507a7165ddf1df223ca998e3c72d8669398dd2abb9c6c3c0aa34536ec8c783c725c1f03ef6c8215f098d0a184a75ddec2e6c51d6872cf4cbb64698d320385fdf18f0cf7c286d96d88e491998a2bb397cb44f28c20374b79084c27939d2c245fcb43de500eeb96727a663cdd42017a905773569fcc55de1ab0d294ec9fa75e1871b3a04af7a2a25ba4c557e86ae6f68a08ca781586bb199b015e5db9328d042f762211c4263acb3050a1ab4eabcc73397c3bab119fc8c84d8ee9c69bb63e1deb10cc0253e385b2ed67230df8e28aa7079480b67da7bd62dbdb4f207eb2f4d986dfa69a3011196241c349eb0d700172927d1158cb0b2636ba38a5400faf302698a09b68b6f834824397e250f559cfc78095efea4f3d22cc3ba1fcacc636c2220140fccc4f67916cd2d6eac1540628200128c43e771ff6fa37073f48aebe87e88ea51a95f117c15caa2fe2eeb994c9e55586b6cd6fac525129a51715f2c536786cacf74d7ca2b12563b88bfbd3f985e7c30e917c92eef1379c53fbe0187bf9e9d9bcf9c74ae053d190b38b964f0809db15ca353a5e8a66b99267a3a2c296d32d0c6b9967ba6de14f1b2303d9cdfe1152e54385cf0ae3f0e9702e51c72c63fa5a81dcd2cb036558b77f31a4ff337f2a9e1228ae3b4786de2cdc8abf2c595376f795157085414871a43d8be5879b35dab6f2f919d94a6928459472573a459a446d92568cdc1b632e702d4779d62687c690ec845eb40e84732650bc6fcd2ef58490216f7c953dd05f465e7cf37f63ff1f39ac5162fd44dc8332f55c3f8c9629510a11f9e7c6dfa58b8969103647a28aca53e47b3f92e83ef6c515f266ab8df6307de5def16864c89a475bbb5ce19d7823cd1109a2ff725ebee9ef4e506004e836716430b175cd4d2d359fddbed950aa7f5fdd8b0cab4ea7f42e1ddf8f4067a5a10d8a86eb6cb0ef803a3baad5f8f00b7daf26f3ff8319aedd087e8283172171270073451dcb5193734a892f351e0b4eab78d1420b96955a93d5c76a0eb2d126b5ae9f38327d63d594d962c91b1778580bd01fc4774ff6785f2ff9b7a06a708888763f6ab328bdb26e9d49278ecd92db2eabaeaadfa4690ff90fae1cc70104d4449bfd8a03db3f891a2fcc4de3080a52ce57105c556a1829b3854d2860766b353696b36f7622b3aaac8f4f42deaeb716c714a58737193dda11e2e72728d727609b526cd528b102cc50297d04b7657f4089ac293fe1f84ade2cc832ddeaafb14ab526e973b794ecc40158b7d9b7e88d5d9d1cce153729925b576e753889b71a771a502002c04d039d7649cafcabe67a99fec5b9223e33293e60524b9bffa27654b370015b209b22f71bc10f0dad52b17d1cb72abded074e7aa42e9e8170539b243191a1ed1f66a76cd8039b03ea58520a61b0de6bc817ff0b5d8c072de09b8f769f8afd6ae258989059a9b9b4e38f0102324ca70d511aa28ef208d2b9a2b065872e5ac54e2eb15a4c65f179f594a45a4d5ac52efaa61607c4a305577836e75e9936d2820cec397a6080280cafc616ecfa795efec8de9c3078cdb7b61000628d09d917f635eca67ff8a36102badd04333bf3bc50b1275bdda323745a2c9f0229f3273352708290ea9ca8581b9d26cd5f2a519d30800eebe3dcb6da29198dcc62ea610861da0bae0f8270c55816074fbc2f51a37c1e62469c7143023f3bc9087b06d8cc4c4951681d4a8bdceb8fd456502bac5b1b57840469263ffece06db707c2864ca9476b231df81004c5a0543d16d967bbdc3bc97b714f3a36257250bf26625761d7ab900f203c67c4d7bed95d68e707e5929c4c70323d23b72fa23f021c5d73bde4d1bb5805e333e0ea0a576adb3b0791fb41ac8609c4079071b82b833449f8082003a4e2fe6c58e0912d88a61ec1b3c4a280b7a49c533e3134f11d55be632a70dbedc41467a7dd1fcb59acd2bedc97e508743fa9de172bb438a7188453078591c38e696a0b0566884e480d7a9bc8030283c0e6dd4da452ef872b8b34c913135ec8e8bd2f7e13ddaf30788441c39be4c02e97b8f7b62e20d9333d137ef1897bb53eb65030b39c082a246bec1c9586920ed6563a750a642543aa8473cf6ec0c7b79e20d7c985c73ec9a91d74ea7bba26bb6d7660688f68ebc87a157af7f178d408ccbded8ff762caf824a1af67c0a22aa87c865c41f4d904bc279c802293ea2ef911fcec37cad56371716adff276b0920895fe5d6050bc3ca783c9e94066ef84ab5723f180bc5be2029e4d73bb6db25105ead0efff28aeeebcf7e0fb8e277a30f5d26707e0cc31efa862b57281e7d0f54c028c7c4b026f4fbeb3728c5b2ccb48f1b979850331e97f909fdcb988acbd25d6b2b41867ff27fff0d5c3169f4b1b78ee9250455b067bc2c41aa253e90082d1aaee58e994e056ea5fb87fbeb480de174d018a01faf1f5311e9e603d1ffbb6128db88cd6f579409ec2022ed7b95b300b27b9d58c58156b8bc7f48cc4c3475f925e463730360ccd43c9a89be4f7a474fd3b66cc58ad4210f954f76a7ee5b0cff9bbbe3d8e30b81e7a3e9fa3908187e98b00ef07df7b738b65e109800ba69ba82493d29342f349131faaa2e9d4c595004c6dd3376b63db605d0f20649fa7469506397b435c58d1f0afec222226425b6e36f3542ce9559e7386bfc7afb803e214d05f789764db80361c065dafe7e16d88cbb9002734915af5f29deabd05f";

/** Minimum XRGE a verified account must hold. */
export const VERIFY_MIN_XRGE = 50_000;

/** The exact message HQ signs for a given account. Domain-separated + versioned. */
export function verifyMessage(pubkey: string): string {
  return `verify:v1:${pubkey}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * True if `vfy` is a valid HQ signature over this pubkey's verify message.
 * A signature is bound to a specific pubkey, so it can't be copied into someone
 * else's profile. Balance is NOT checked here — see `useVerified`.
 */
export function isValidAttestation(pubkey: string, vfy: string | undefined): boolean {
  if (!vfy || !pubkey) return false;
  if (HQ_PUBLIC_KEY.startsWith("__")) return false; // HQ key not configured yet
  try {
    const msg = new TextEncoder().encode(verifyMessage(pubkey));
    return ml_dsa65.verify(hexToBytes(HQ_PUBLIC_KEY), msg, hexToBytes(vfy));
  } catch {
    return false;
  }
}
