// The sealed relay's crypto: node test.mjs
import { isKey, isNonce, isPromise, commitment, confirmation, confirmed, derive, newKeyPair, newNonce, sealer, PAGE_TO_PHONE, PHONE_TO_PAGE, fromBase64, toBase64 } from "./sealed.js";

let failed = 0;
const check = (name, ok) => { console.log((ok ? "ok    " : "FAILED") + " " + name); if (!ok) failed++; };
const refused = async (work) => { try { await work(); return false; } catch { return true; } };

const page = await newKeyPair();
const phone = await newKeyPair();
const pageNonce = newNonce();
const phoneNonce = newNonce();
const a = await derive(page.pair.privateKey, phone.pub, page.pub, phone.pub, pageNonce, phoneNonce);
const b = await derive(phone.pair.privateKey, page.pub, page.pub, phone.pub, pageNonce, phoneNonce);
check("both sides reach the same check code", a.check === b.check);
check("both sides reach the same room", a.room === b.room);
check("the check code is eight digits", /^\d{8}$/.test(a.check));
check("the room says nothing of the check", !a.room.includes(a.check));

// The promise: a key that wasn't the one promised is caught.
const promise = await commitment(phone.pub, phoneNonce);
const thief = await newKeyPair();
check("the promised key matches", promise === await commitment(phone.pub, phoneNonce));
check("another key doesn't match the promise", promise !== await commitment(thief.pub, phoneNonce));
check("another nonce doesn't match the promise", promise !== await commitment(phone.pub, newNonce()));

// A relay in the middle gives each side its own key instead of the other's.
const pageSees = await derive(page.pair.privateKey, thief.pub, page.pub, thief.pub, pageNonce, phoneNonce);
const phoneSees = await derive(phone.pair.privateKey, thief.pub, thief.pub, phone.pub, pageNonce, phoneNonce);
check("a swapped key shows different codes", pageSees.check !== phoneSees.check);
check("a swapped key gives a different room", pageSees.room !== phoneSees.room);

// A plain "ok" is worth nothing without the key.
const proof = await confirmation(b.confirmPhone, b.transcript);
check("the phone's proof is accepted", await confirmed(a.confirmPhone, a.transcript, proof));
check("a proof from another key is refused", !await confirmed(a.confirmPhone, a.transcript,
  await confirmation(phoneSees.confirmPhone, phoneSees.transcript)));
check("the page's proof can't pass as the phone's", !await confirmed(a.confirmPhone, a.transcript,
  await confirmation(a.confirmPage, a.transcript)));

// A commit with no real promise must never earn the page's key.
check("a real promise passes", isPromise(promise));
for (const bad of [undefined, null, "", 0, false, {}, [], "short", promise + "A"]) check(`not a promise: ${JSON.stringify(bad)}`, !isPromise(bad));
check("a real key and nonce pass", isKey(phone.pub) && isNonce(phoneNonce));
check("a short key is refused", !isKey(phone.pub.subarray(1)));
check("a short nonce is refused", !isNonce(phoneNonce.subarray(1)));

const glasses = sealer(a.send, a.receive);
const handset = sealer(a.receive, a.send);
const frame = await glasses.seal({ path: "/test/hello" });
const got = await handset.open(frame, PAGE_TO_PHONE);
check("a message arrives", got.path === "/test/hello");
check("a replay is refused", await refused(() => handset.open(frame, PAGE_TO_PHONE)));

const bent = fromBase64(await glasses.seal({ path: "/test/hello" }));
bent[20] ^= 1;
check("a changed message is refused", await refused(() => handset.open(toBase64(bent), PAGE_TO_PHONE)));

const reflected = await glasses.seal({ path: "/test/hello" });
check("a message sent back to its sender is refused", await refused(() => glasses.open(reflected, PHONE_TO_PAGE)));

const stranger = sealer(thief.pub.subarray(0, 32), thief.pub.subarray(32, 64));
check("a stranger's message is refused", await refused(async () => handset.open(await stranger.seal({ path: "/test/hello" }), PAGE_TO_PHONE)));

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
