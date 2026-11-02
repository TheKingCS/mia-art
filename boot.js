// Starts MIA on the glasses: pairs if needed, joins the sealed relay, and gives
// her interface (glasses.js, published unchanged from MIA's web/) its `MIA`
// object, which speaks through the relay. The phone decides what she gets;
// this page holds no data of its own.
import {
  RELAY, commitment, confirmation, confirmed, derive, fromBase64, isKey, isNonce,
  isPromise, newKeyPair, newNonce, sealer, toBase64,
} from "./sealed.js";

const $ = (id) => document.getElementById(id);
const say = (text) => { $("facts").textContent = text; };
const STORE = "mia.relay";
const ANSWER_MS = 8000;
const LOST_AFTER = 4;

let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORE)); } catch (e) { saved = null; }
const remember = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) { say("Couldn't save the key"); } };

// ------------------------------------------------------------ pairing

function stopped(why) {
  $("big").textContent = "";
  $("sure").hidden = true;
  say(why);
  $("restart").hidden = false;
  $("restart").focus();
  $("restart").onclick = () => { $("restart").hidden = true; pair(); };
}

async function pair() {
  $("pairing").hidden = false;
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  $("big").textContent = code;
  say("Enter this in MIA on your phone: Settings, Glasses");
  const { pair: keys, pub } = await newKeyPair();
  const nonce = newNonce();
  const socket = new WebSocket(`${RELAY}/pair-${code}?role=page`);
  let promised = null;
  let found = null;
  let agreed = false;  // the person here has seen both match
  let proof = null;  // the phone's, kept until then
  let over = false;
  const abandon = (why) => { over = true; socket.close(); stopped(why); };

  const finish = async () => {
    if (!agreed || !proof || saved || over) return;
    if (!await confirmed(found.confirmPhone, found.transcript, proof)) return abandon("Pairing stopped: the proof was wrong.");
    if (over) return;
    socket.send(JSON.stringify({ t: "ok", mac: await confirmation(found.confirmPage, found.transcript) }));
    saved = { room: found.room, send: toBase64(found.send), receive: toBase64(found.receive), highest: 0 };
    remember();
    over = true;
    setTimeout(() => socket.close(), 500);
    $("pairing").hidden = true;
    connect();
  };

  $("match").onclick = () => { agreed = true; say("Now confirm on your phone"); $("sure").hidden = true; finish(); };
  $("differ").onclick = () => abandon("Pairing stopped.");

  socket.onmessage = async (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch (e) { return abandon("Pairing stopped: a bad message."); }
    if (over) return;
    if (message.t === "commit") {
      if (!isPromise(message.c)) return abandon("Pairing stopped: a bad message.");
      if (promised) { if (message.c !== promised) abandon("Pairing stopped: the promise changed."); return; }
      promised = message.c;
      socket.send(JSON.stringify({ t: "hello", pub: toBase64(pub), nonce: toBase64(nonce) }));
    } else if (message.t === "reveal" && promised && !found) {
      let phonePub, phoneNonce;
      try { phonePub = fromBase64(message.pub); phoneNonce = fromBase64(message.nonce); } catch (e) { return abandon("Pairing stopped: a bad message."); }
      if (!isKey(phonePub) || !isNonce(phoneNonce)) return abandon("Pairing stopped: a bad message.");
      if (await commitment(phonePub, phoneNonce) !== promised) return abandon("Pairing stopped: the key wasn't the one promised.");
      found = await derive(keys.privateKey, phonePub, pub, phonePub, nonce, phoneNonce);
      if (over) return;
      $("big").textContent = found.check.slice(0, 4) + " " + found.check.slice(4);
      say("Does your phone show the same number?");
      $("sure").hidden = false;
      $("differ").focus();  // a stray tap must never agree
    } else if (message.t === "ok" && found && !proof) {
      if (!isPromise(message.mac)) return abandon("Pairing stopped: a bad message.");
      proof = message.mac;
      finish();
    }
  };
  socket.onclose = () => {
    if (saved || over) return;
    if (promised) stopped("Pairing stopped: the connection dropped.");
    else setTimeout(pair, 2000);  // nobody has answered yet, so nothing was tried
  };
}

// ------------------------------------------------------------ the relay

let box = null;
let socket = null;
let misses = 0;
const asked = new Map();  // each sealed answer must match a question, once

class Refused extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function ask(path) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== 1) return reject(new Error("Not connected"));
    const id = toBase64(crypto.getRandomValues(new Uint8Array(12)));
    const timer = setTimeout(() => {
      asked.delete(id);
      if (++misses >= LOST_AFTER) offerPairing();
      reject(new Error("No answer"));
    }, ANSWER_MS);
    asked.set(id, { resolve, reject, timer });
    box.seal({ id, path }).then((frame) => socket.send(frame)).catch(reject);
  });
}

// The phone may have unpaired: say so, and leave the way back open.
function offerPairing() {
  if (!$("pairing").hidden) return;
  $("pairing").hidden = false;
  $("big").textContent = "";
  say("Your phone isn't answering. Is MIA open on it?");
  $("restart").hidden = false;
  $("restart").onclick = () => {
    try { localStorage.removeItem(STORE); } catch (e) { /* the next pairing replaces it */ }
    location.reload();
  };
  $("wait").hidden = false;
  $("wait").onclick = () => { misses = 0; $("pairing").hidden = true; $("wait").hidden = true; $("restart").hidden = true; };
  $("wait").focus();
}

function connect() {
  box = sealer(fromBase64(saved.send), fromBase64(saved.receive), saved.highest || 0);
  socket = new WebSocket(`${RELAY}/${saved.room}?role=page`);
  socket.onopen = () => start();
  socket.onmessage = async (event) => {
    let reply;
    try { reply = await box.open(event.data); } catch (e) { return; }
    saved.highest = box.state.highest;
    remember();
    const waiting = asked.get(reply.id);
    if (!waiting) return;  // an answer nobody asked for
    asked.delete(reply.id);
    clearTimeout(waiting.timer);
    misses = 0;
    if (reply.status === 200) waiting.resolve(reply.body);
    else waiting.reject(new Refused(reply.status, "That's on your phone for now."));
  };
  socket.onclose = () => setTimeout(connect, 3000);
}

// ------------------------------------------------------------ what her interface calls

const notHere = () => Promise.reject(new Refused(403, "That's on your phone for now."));

window.MIA = {
  demo: false,
  glasses: (mission) => ask("/api/glasses" + (mission ? "?mission=" + encodeURIComponent(mission) : "")),
  glassesPanel: (app, item, mission) => ask("/api/glasses/" + encodeURIComponent(app) + "/" + encodeURIComponent(item) +
    (mission ? "?mission=" + encodeURIComponent(mission) : "")),
  glassesOrb: () => ask("/api/glasses/orb"),
  glassesFeed: (since) => ask("/api/glasses/feed" + (since ? "?since=" + encodeURIComponent(since) : "")),
  phoneListen: () => ask("/voice/listen"),
  // Not over the relay yet: Zac approved reading first (DEC-0062).
  firstBoot: () => Promise.resolve({ done: true, beats: [] }),
  userSync: () => Promise.resolve({ done: true, offer: false, active: false }),
  shell: notHere, thread: () => Promise.resolve({ messages: [] }), speak: notHere, image: notHere,
  propose: notHere, approve: notHere, talk: notHere, voice: notHere, firstBootStep: notHere, userSyncStep: notHere,
  reject: () => Promise.resolve(),
};

// ------------------------------------------------------------ Back

// The glasses' Back walks browser history, so her screens need an entry while
// she's away from the orb. On the orb there is none, and Back leaves her.
function followBack() {
  let held = false;
  const hold = () => {
    const away = $("home").hidden;
    if (away && !held) { history.pushState({ mia: true }, ""); held = true; }
  };
  new MutationObserver(hold).observe($("home"), { attributes: true, attributeFilter: ["hidden"] });
  addEventListener("popstate", () => {
    held = false;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    setTimeout(hold, 80);
  });
}

// ------------------------------------------------------------ start

let started = false;
function start() {
  if (started) return;
  started = true;
  followBack();
  for (const src of ["icons.js", "glasses.js"]) {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    document.body.append(script);
  }
}

if (saved) connect(); else pair();
