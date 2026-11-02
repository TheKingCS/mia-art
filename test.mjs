// The sealed relay's crypto: node test.mjs
import { derive, newKeyPair, sealer, PAGE_TO_PHONE, PHONE_TO_PAGE, fromBase64, toBase64 } from "./sealed.js";

let failed = 0;
const check = (name, ok) => { console.log((ok ? "ok    " : "FAILED") + " " + name); if (!ok) failed++; };
const refused = async (work) => { try { await work(); return false; } catch { return true; } };

const page = await newKeyPair();
const phone = await newKeyPair();
const a = await derive(page.pair.privateKey, phone.pub, page.pub, phone.pub);
const b = await derive(phone.pair.privateKey, page.pub, page.pub, phone.pub);
check("both sides reach the same check code", a.check === b.check);
check("both sides reach the same room", a.room === b.room);
check("the check code is six digits", /^\d{6}$/.test(a.check));
check("the room says nothing of the check", !a.room.includes(a.check));

// A relay in the middle gives each side its own key instead of the other's.
const thief = await newKeyPair();
const pageSees = await derive(page.pair.privateKey, thief.pub, page.pub, thief.pub);
const phoneSees = await derive(phone.pair.privateKey, thief.pub, thief.pub, phone.pub);
check("a swapped key shows different codes", pageSees.check !== phoneSees.check);
check("a swapped key gives a different room", pageSees.room !== phoneSees.room);

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
