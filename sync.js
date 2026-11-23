// English Base Amfisi · otomasyon (Sadece Yorum Modu)
// Akış: yorum oku -> masa ata -> İncir çekilişi -> data.json
const fs = require("fs");
const E = process.env;
const VER = E.API_VERSION || "v25.0";
const TOTAL = +E.TOTAL || 50000, STEP = +E.STEP || 10000;
const SALT = E.SALT || "english-base-amfi-2026";
const MAX_CALLS = +E.MAX_CALLS || 400;
const DIR = E.DATA_DIR || ".";
const NAME_OK = /^[A-Za-z0-9._]{1,30}$/;
const WANT = /masa\s*#?\s*(\d{1,5})/i, DEL = /kald[ıi]r|\bsil\b/i, JOIN = /kat[ıi]l/i;

let token = (E.IG_TOKEN || "").trim(), calls = 0;
if (!token) throw new Error("IG_TOKEN gerekli");

const isFbToken = token.startsWith("EAA");
const API = isFbToken ? `https://graph.facebook.com/${VER}` : `https://graph.instagram.com/${VER}`;
const IG_ID = (E.IG_ACCOUNT_ID || "17841476270184825").trim();

async function api(path, params = {}, soft = false) {
  const u = new URL(path.startsWith("http") ? path : API + path);
  Object.entries({ ...params, access_token: token }).forEach(([k, v]) => u.searchParams.set(k, v));
  calls++;
  try {
    const j = await (await fetch(u)).json();
    if (j.error) throw new Error(j.error.message);
    return j;
  } catch (e) {
    if (!soft) throw e;
    if (E.VERBOSE) console.error("API uyarı:", path, e.message);
    return null;
  }
}
function h32(str){let h1=1779033703,h2=3144134277,h3=1013904242,h4=2773480762;for(let i=0,k;i<str.length;i++){k=str.charCodeAt(i);h1=h2^Math.imul(h1^k,597399067);h2=h3^Math.imul(h2^k,2869860233);h3=h4^Math.imul(h3^k,951274213);h4=h1^Math.imul(h4^k,2716044179)}h1=Math.imul(h3^(h1>>>18),597399067);h2=Math.imul(h4^(h2>>>22),2869860233);h3=Math.imul(h1^(h3>>>17),951274213);h4=Math.imul(h2^(h4>>>19),2716044179);return(h1^h2^h3^h4)>>>0}
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const writeJson = (f, o) => { fs.writeFileSync(f + ".tmp", JSON.stringify(o)); fs.renameSync(f + ".tmp", f); };

(async () => {
  const S = readJson(`${DIR}/private.json`, { users: {}, order: [], cSince: 0, cIds: [], winners: [] });
  const D = readJson(`${DIR}/data.json`, { winners: [] });
  const users = S.users, order = S.order, winners = (S.winners = S.winners || D.winners || []);
  const banned = new Set(fs.existsSync("banned.txt") ? fs.readFileSync("banned.txt", "utf8").split(/\s+/).map((s) => s.replace(/^@/, "").toLowerCase()).filter(Boolean) : []);
  const now = Date.now();

  if (!isFbToken) {
    if (S.token) token = S.token;
    if (!S.tokenAt || now - S.tokenAt > 30 * 864e5) {
      const r = await api("https://graph.instagram.com/refresh_access_token", { grant_type: "ig_refresh_token" }, true);
      if (r && r.access_token) { token = r.access_token; S.token = token; S.tokenAt = now; }
    }
  }

  const target = isFbToken ? `/${IG_ID}` : "/me";
  const meFields = isFbToken ? "id,username,followers_count" : "user_id,username,followers_count";
  const me = await api(target, { fields: meFields });

  const rec = (name) => {
    const k = name.toLowerCase();
    return users[k] || (users[k] = { u: name, first: now });
  };
  const events = [];

  // Yorumları oku
  let media = (E.MEDIA_IDS || "").split(",").filter(Boolean);
  if (!media.length) media = ((await api(`${target}/media`, { fields: "id", limit: 10 })).data || []).map((m) => m.id);
  const cIds = new Set(S.cIds || []);
  for (const id of media) {
    let params = { fields: "id,username,text,timestamp", limit: 100 };
    for (;;) {
      const j = await api(`/${id}/comments`, params, true);
      if (!j) break;
      const page = j.data || [];
      for (const c of page) {
        const ts = Date.parse(c.timestamp);
        if (ts > S.cSince || (ts === S.cSince && !cIds.has(c.id))) {
          events.push({ ts, name: c.username || "", text: c.text || "", id: c.id });
        }
      }
      const after = j.paging && j.paging.next && j.paging.cursors && j.paging.cursors.after;
      if (!after || !page.length || Date.parse(page[page.length - 1].timestamp) < S.cSince) break;
      params = { ...params, after };
    }
  }

  events.sort((a, b) => a.ts - b.ts || String(a.id).localeCompare(String(b.id)));
  const isWinner = (k) => winners.some((w) => w.user.toLowerCase() === k);
  let free = 1; const seats = {};
  for (const k in users) if (users[k].member) seats[users[k].desk] = users[k].u;
  const nextFree = () => { while (seats[free]) free++; return free; };
  const unseat = (k, why) => {
    const r = users[k]; if (!r || !r.member) return;
    delete seats[r.desk]; free = Math.min(free, r.desk);
    r.member = false; if (why) r[why] = true;
    const i = order.indexOf(k); if (i >= 0) order.splice(i, 1);
  };

  for (const ev of events) {
    if (!NAME_OK.test(ev.name) || banned.has(ev.name.toLowerCase())) continue;
    const r = rec(ev.name), k = ev.name.toLowerCase();
    r.c = true;
    const w = WANT.exec(ev.text);
    if (DEL.test(ev.text)) { if (!isWinner(k)) { unseat(k); r.removed = true; r.c = false; } continue; }
    if (r.removed) { if (JOIN.test(ev.text)) r.removed = false; else continue; }
    if (w && +w[1] >= 1 && +w[1] <= TOTAL) r.want = +w[1];
  }

  const maxC = events.reduce((a, e) => Math.max(a, e.ts), S.cSince);
  S.cIds = [...new Set([...(maxC === S.cSince ? S.cIds || [] : []), ...events.filter((e) => e.ts === maxC).map((e) => e.id)])];
  S.cSince = maxC;

  // Taşıma istekleri
  for (const k in users) {
    const r = users[k];
    if (r.member && r.want) {
      if (r.want !== r.desk && !seats[r.want] && !isWinner(k)) {
        delete seats[r.desk]; free = Math.min(free, r.desk); r.desk = r.want; seats[r.want] = r.u;
      }
      r.want = 0;
    }
  }

  // Yeni üyeleri doğrudan masaya oturt (yorum yapmış olması yeterli)
  const pending = Object.keys(users)
    .filter((k) => !users[k].member && !users[k].removed && users[k].c && !banned.has(k))
    .sort((a, b) => users[a].first - users[b].first);

  for (const k of pending) {
    const r = users[k];
    const d = r.want && !seats[r.want] ? r.want : nextFree();
    seats[d] = r.u; r.member = true; r.desk = d; r.want = 0; order.push(k);
  }

  // Banlılar
  for (const k of order.slice()) if (banned.has(k) && !isWinner(k)) unseat(k);

  // İncir çekilişi (çekiliş anında kazananı canlı takip edip etmediğini kendin teyit edebilirsin)
  const draw = (m, attempt) => {
    for (let a = attempt; a < attempt + 50; a++) {
      const elig = order.slice(0, m).filter((k) => !banned.has(k));
      if (!elig.length) return null;
      const k = elig[h32(`${SALT}|${m}|${order[m - 1]}|${a}`) % elig.length];
      return { m, user: users[k].u, desk: users[k].desk, attempt: a, at: new Date().toISOString() };
    }
    return null;
  };
  for (let i = 0; i < winners.length; i++) if (banned.has(winners[i].user.toLowerCase()) || !users[winners[i].user.toLowerCase()].member) {
    const w = draw(winners[i].m, winners[i].attempt + 1); if (w) winners[i] = w;
  }
  for (let m = STEP; m <= TOTAL; m += STEP) if (order.length >= m && !winners.some((w) => w.m === m)) { const w = draw(m, 0); if (w) winners.push(w); }
  winners.sort((a, b) => a.m - b.m);

  const pub = { seats: {}, winners, followers: me.followers_count || 0, total: TOTAL, step: STEP, updated: new Date().toISOString() };
  for (const d in seats) pub.seats[d] = seats[d];
  writeJson(`${DIR}/data.json`, pub);
  writeJson(`${DIR}/private.json`, S);
  console.log(`${events.length} yorum olayı, ${order.length} üye, ${winners.length} kazanan, ${calls} API çağrısı`);
})().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
