// The glasses' side of the sealed relay (MIA's docs/GLASSES_RELAY_PLAN.md):
// pairing and encryption with the browser's own crypto. No secrets live in
// this file; the keys are made on the glasses and the phone.

export const RELAY = "wss://mia-relay.yhrhodes.workers.dev";

const words = new TextEncoder();
export const PAGE_TO_PHONE = "page-to-phone";
export const PHONE_TO_PAGE = "phone-to-page";

export const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function join(...parts) {
  const all = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return all;
}

export async function newKeyPair() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { pair, pub: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) };
}

export const newNonce = () => crypto.getRandomValues(new Uint8Array(32));

/** The phone's promise of its key, sent before it can see the page's. */
export async function commitment(pub, nonce) {
  return toBase64(await crypto.subtle.digest("SHA-256", join(pub, nonce)));
}

async function expand(ikm, salt, info) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: words.encode(info) }, key, 256));
}

/** Everything both sides derive. `mine` is this side's private key. The
 *  transcript binds both keys and both nonces, page first on both sides. */
export async function derive(mine, theirPub, pagePub, phonePub, pageNonce, phoneNonce) {
  const peer = await crypto.subtle.importKey("raw", theirPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, mine, 256));
  const salt = new Uint8Array(await crypto.subtle.digest("SHA-256",
    join(words.encode("mia-relay-v2"), pagePub, phonePub, pageNonce, phoneNonce)));
  const check = await expand(shared, salt, "check");
  const room = await expand(shared, salt, "room");
  return {
    transcript: salt,
    check: String(new DataView(check.buffer).getUint32(0) % 100000000).padStart(8, "0"),
    room: [...room].map((b) => b.toString(16).padStart(2, "0")).join(""),
    send: await expand(shared, salt, PAGE_TO_PHONE),
    receive: await expand(shared, salt, PHONE_TO_PAGE),
    confirmPhone: await expand(shared, salt, "confirm-phone"),
    confirmPage: await expand(shared, salt, "confirm-page"),
  };
}

const macKey = (bytes, use) => crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, [use]);

/** Proof that a side holds the key, over everything said in pairing. */
export async function confirmation(key, transcript) {
  return toBase64(await crypto.subtle.sign("HMAC", await macKey(key, "sign"), transcript));
}

export async function confirmed(key, transcript, mac) {
  return crypto.subtle.verify("HMAC", await macKey(key, "verify"), fromBase64(mac), transcript);
}

const aes = (bytes, use) => crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [use]);

/** Keeps the numbering: each message's number only goes up. */
export function sealer(sendBytes, receiveBytes, highest = 0) {
  let sent = 0;
  const state = { highest };
  return {
    state,
    async seal(message, direction = PAGE_TO_PHONE) {
      sent = Math.max(sent + 1, Date.now());
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const body = words.encode(JSON.stringify({ ...message, n: sent }));
      const out = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: words.encode(direction) }, await aes(sendBytes, "encrypt"), body);
      return toBase64(join(nonce, new Uint8Array(out)));
    },
    async open(frame, direction = PHONE_TO_PAGE) {
      const all = fromBase64(frame);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: all.subarray(0, 12), additionalData: words.encode(direction) },
        await aes(receiveBytes, "decrypt"), all.subarray(12));
      const message = JSON.parse(new TextDecoder().decode(plain));
      if (!(message.n > state.highest)) throw new Error("replayed");
      state.highest = message.n;
      return message;
    },
  };
}
