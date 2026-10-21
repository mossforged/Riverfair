/* Riverfair turn alerts: a Cloudflare Worker.

   The game calls POST /notify {code} after every committed turn. This worker reads that game
   from the Firebase database itself, works out whose turn it is, and if that player is away
   (not connected, or with the game in a background tab) sends a push notification to the
   device they turned alerts on from. Because the worker decides from the real game state,
   nobody can use it to send alerts about anything else.

   Setup (Cloudflare dashboard, no command line):
   1. Workers & Pages > Create > Create Worker, name it "riverfair-push", Deploy.
   2. Edit code, replace everything with this file, Deploy.
   3. Settings > Variables and Secrets > Add, type Secret, name VAPID_JWK, value: the one-line
      key you were given (it starts with {"kty":"EC"). Deploy.
   4. Copy the worker's address (https://riverfair-push.<you>.workers.dev) into PUSH_URL in game.js. */

const DB = 'https://istanbul-8c39c-default-rtdb.firebaseio.com';
const ORIGINS = ['https://mossforged.github.io', 'http://localhost:8765'];
const GAME_URL = 'https://mossforged.github.io/Riverfair/';
const SUBJECT = 'https://mossforged.github.io/Riverfair/';

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('Riverfair turn alerts are running.', { headers: cors });
    try {
      const { code } = await req.json();
      if (!/^[A-Z0-9]{4,8}$/.test(code || '')) return new Response('bad code', { status: 400, headers: cors });
      const result = await notifyTurn(code, env);
      return new Response(result, { headers: cors });
    } catch (e) {
      return new Response('error: ' + (e && e.message || e), { status: 500, headers: cors });
    }
  },
};

const get = async (path) => (await fetch(`${DB}/${path}.json`)).json();

async function notifyTurn(code, env) {
  const [stateStr, claims, push, presence, vis, sent] = await Promise.all([
    get(`games/${code}/state`), get(`games/${code}/claims`), get(`games/${code}/push`),
    get(`games/${code}/presence`), get(`games/${code}/vis`), get(`games/${code}/notified`)]);
  if (!stateStr) return 'no game';
  const g = JSON.parse(stateStr);
  if (g.over) return 'game over';
  const p = g.players[g.current];
  if (!p || p.ai) return 'ai turn';
  const owner = (claims && claims['s' + p.i]) || p.owner;
  const sub = push && push[owner];
  if (!sub) return 'no alerts for this player';
  const away = !(presence && presence[owner]) || (vis && vis[owner] === false);
  if (!away) return 'player is watching';
  const key = `${g.round}-${g.current}`;
  if (sent && sent[owner] === key) return 'already sent';
  const payload = JSON.stringify({
    title: `Your turn, ${p.name}`,
    body: `The market is waiting for you in game ${code}.`,
    url: `${GAME_URL}?game=${code}`,
    tag: `riverfair-${code}`,
  });
  const res = await sendPush(sub, payload, env);
  if (res.status === 404 || res.status === 410) { // the browser threw this subscription away
    await fetch(`${DB}/games/${code}/push/${owner}.json`, { method: 'DELETE' });
    return 'subscription expired';
  }
  if (res.ok) await fetch(`${DB}/games/${code}/notified/${owner}.json`, { method: 'PUT', body: JSON.stringify(key) });
  return 'push ' + res.status;
}

/* ---------- Web Push: VAPID signing (RFC 8292) and payload encryption (RFC 8291) ---------- */
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

export async function vapidHeader(endpoint, jwkJson) {
  const jwk = JSON.parse(jwkJson);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  const pub = concat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${b64u(pub)}`;
}

export async function encryptPayload(sub, text) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

async function sendPush(sub, text, env) {
  const body = await encryptPayload(sub, text);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, env.VAPID_JWK),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
      Topic: 'riverfair-turn',
    },
    body,
  });
}
