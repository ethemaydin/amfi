// English Base Amfisi · otomasyon (Node 18+)
// Akış: yorum + DM oku -> takip doğrula (is_user_follow_business) -> masa ata -> İncir çekilişi -> data.json
const fs = require("fs");
const E = process.env;
const API = `https://graph.instagram.com/${E.API_VERSION || "v25.0"}`;
const TOTAL = +E.TOTAL || 50000, STEP = +E.STEP || 10000;
const SALT = E.SALT || "english-base-amfi-2026";
const REQUIRE_COMMENT = E.REQUIRE_COMMENT !== "0";
const MAX_CALLS = +E.MAX_CALLS || 400, RECHECK = +E.RECHECK || 40;
const DIR = E.DATA_DIR || ".";
const NAME_OK = /^[A-Za-z0-9._]{1,30}$/;
const WANT = /masa\s*#?\s*(\d{1,5})/i, DEL = /kald[ıi]r|\bsil\b/i, JOIN = /kat[ıi]l/i;
let token = E.IG_TOKEN, calls = 0;
if (!token) throw new Error("IG_TOKEN gerekli");

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
  const S = readJson(`${DIR}/private.json`, { users: {}, order: [], cSince: 0, cIds: [], mSince: 0, winners: [] });
  const D = readJson(`${DIR}/data.json`, { winners: [] });
  const users = S.users, order = S.order, winners = (S.winners = S.winners || D.winners || []);
  const banned = new Set(fs.existsSync("banned.txt") ? fs.readFileSync("banned.txt", "utf8").split(/\s+/).map((s) => s.replace(/^@/, "").toLowerCase()).filter(Boolean) : []);
  const now = Date.now();

  // token yenile (60 günlük; 30 günde bir)
  if (S.token) token = S.token;
  if (!S.tokenAt || now - S.tokenAt > 30 * 864e5) {
    const r = await api("https://graph.instagram.com/refresh_access_token", { grant_type: "ig_refresh_token" }, true);
    if (r && r.access_token) { token = r.access_token; S.token = token; S.tokenAt = now; }
  }
  const me = await api("/me", { fields: "user_id,username,followers_count" });
  const selfId = String(me.user_id || me.id);

  const rec = (name) => {
    const k = name.toLowerCase();
    return users[k] || (users[k] = { u: name, first: now, checked: 0 });
  };
  const events = [];

  // 1) yorumlar (yeniden eskiye)
  let media = (E.MEDIA_IDS || "").split(",").filter(Boolean);
  if (!media.length) media = ((await api("/me/media", { fields: "id", limit: 10 })).data || []).map((m) => m.id);
  const cIds = new Set(S.cIds || []);
  for (const id of media) {
    let params = { fields: "id,username,text,timestamp", limit: 100 };
    for (;;) {
      const j = await api(`/${id}/comments`, params, true);
      if (!j) break;
      const page = j.data || [];
      for (const c of page) {
        const ts = Date.parse(c.timestamp);
        if (ts > S.cSince || (ts === S.cSince && !cIds.has(c.id))) events.push({ ts, name: c.username || "", text: c.text || "", src: "c", id: c.id });
      }
      const after = j.paging && j.paging.next && j.paging.cursors && j.paging.cursors.after;
      if (!after || !page.length || Date.parse(page[page.length - 1].timestamp) < S.cSince) break;
      params = { ...params, after };
    }
  }

  // 2) DM'ler
  let cp = { platform: "instagram", fields: "updated_time,participants,messages.limit(10){message,created_time,from}", limit: 50 };
  for (;;) {
    const j = await api("/me/conversations", cp, true);
    if (!j) break;
    const page = j.data || [];
    for (const cv of page) {
      const p = ((cv.participants && cv.participants.data) || []).find((x) => String(x.id) !== selfId);
      if (!p) continue;
      for (const m of (cv.messages && cv.messages.data) || []) {
        const ts = Date.parse(m.created_time);
        if (m.from && String(m.from.id) === String(p.id) && ts > S.mSince) events.push({ ts, name: p.username || "", text: m.message || "", src: "d", igsid: String(p.id) });
      }
    }
    const after = j.paging && j.paging.next && j.paging.cursors && j.paging.cursors.after;
    const lastUp = page.length && Date.parse(page[page.length - 1].updated_time);
    if (!after || !page.length || lastUp <= S.mSince) break;
    cp = { ...cp, after };
  }

  events.sort((a, b) => a.ts - b.ts || String(a.id).localeCompare(String(b.id)));
  const isWinner = (k) => winners.some((w) => w.user.toLowerCase() === k);
  let free = 1; const seats = {};
  for (const k in users) if (users[k].member) seats[users[k].desk] = users[k].u;
  const nextFree = () => { while (seats[free]) free++; return free; };
  const unseat = (k, why) => {
    const r = users[k]; if (!r || !r.member) return;
    delete seats[r.desk]; free = Math.min(free, r.desk);
    r.member = false; r.d = false; if (why) r[why] = true;
    const i = order.indexOf(k); if (i >= 0) order.splice(i, 1);
  };

  for (const ev of events) {
    if (!NAME_OK.test(ev.name) || banned.has(ev.name.toLowerCase())) continue;
    const r = rec(ev.name), k = ev.name.toLowerCase();
    if (ev.src === "c") r.c = true; else { r.d = true; r.igsid = ev.igsid; }
    const w = WANT.exec(ev.text);
    if (DEL.test(ev.text)) { if (!isWinner(k)) { unseat(k); r.removed = true; r.c = r.d = false; } continue; }
    if (r.removed) { if (JOIN.test(ev.text) && ev.src === "d") r.removed = false; else continue; }
    r.fresh = true;
    if (w && +w[1] >= 1 && +w[1] <= TOTAL) r.want = +w[1];
  }
  const maxC = events.filter((e) => e.src === "c").reduce((a, e) => Math.max(a, e.ts), S.cSince);
  S.cIds = [...new Set([...(maxC === S.cSince ? S.cIds || [] : []), ...events.filter((e) => e.src === "c" && e.ts === maxC).map((e) => e.id)])];
  S.cSince = maxC;
  S.mSince = events.filter((e) => e.src === "d").reduce((a, e) => Math.max(a, e.ts), S.mSince);

  const follows = async (r) => {
    if (!r.igsid || calls >= MAX_CALLS) return null;
    const j = await api("/" + r.igsid, { fields: "username,is_user_follow_business" }, true);
    r.checked = Date.now();
    return j && typeof j.is_user_follow_business === "boolean" ? j.is_user_follow_business : null;
  };
  const eligible = (r) => !r.member && !r.removed && r.d && r.igsid && (r.c || !REQUIRE_COMMENT);

  // 3) taşıma istekleri (üyeler)
  for (const k in users) {
    const r = users[k];
    if (r.member && r.want) {
      if (r.want !== r.desk && !seats[r.want] && !isWinner(k)) { delete seats[r.desk]; free = Math.min(free, r.desk); r.desk = r.want; seats[r.want] = r.u; }
      r.want = 0;
    }
  }
  // 4) yeni üyeler: takip doğrulaması
  const pending = Object.keys(users).filter((k) => eligible(users[k]) && !banned.has(k) && (users[k].fresh || now - users[k].checked > 18e5))
    .sort((a, b) => users[a].first - users[b].first);
  for (const k of pending) {
    const r = users[k], f = await follows(r);
    r.fresh = false;
    if (f === true) {
      const d = r.want && !seats[r.want] ? r.want : nextFree();
      seats[d] = r.u; r.member = true; r.desk = d; r.want = 0; order.push(k);
    }
    if (calls >= MAX_CALLS) break;
  }
  // 5) banlılar
  for (const k of order.slice()) if (banned.has(k) && !isWinner(k)) unseat(k);
  // 6) takibi bırakanları ele (en eski kontrol edilenlerden RECHECK kadar)
  const old = order.filter((k) => !isWinner(k)).sort((a, b) => users[a].checked - users[b].checked).slice(0, RECHECK);
  for (const k of old) { if ((await follows(users[k])) === false) unseat(k, "unfollowed"); if (calls >= MAX_CALLS) break; }

  // 7) İncir çekilişi (kazanan canlı kontrol edilir)
  const draw = async (m, attempt) => {
    for (let a = attempt; a < attempt + 50; a++) {
      const elig = order.slice(0, m).filter((k) => !banned.has(k));
      if (!elig.length) return null;
      const k = elig[h32(`${SALT}|${m}|${order[m - 1]}|${a}`) % elig.length], f = await follows(users[k]);
      if (f === true) return { m, user: users[k].u, desk: users[k].desk, attempt: a, at: new Date().toISOString() };
      if (f === false) unseat(k, "unfollowed"); else return null;   // belirsiz: sonraki çalışmada tekrar dene
    }
    return null;
  };
  for (let i = 0; i < winners.length; i++) if (banned.has(winners[i].user.toLowerCase()) || !users[winners[i].user.toLowerCase()].member) {
    const w = await draw(winners[i].m, winners[i].attempt + 1); if (w) winners[i] = w;
  }
  for (let m = STEP; m <= TOTAL; m += STEP) if (order.length >= m && !winners.some((w) => w.m === m)) { const w = await draw(m, 0); if (w) winners.push(w); }
  winners.sort((a, b) => a.m - b.m);

  const pub = { seats: {}, winners, followers: me.followers_count || 0, total: TOTAL, step: STEP, updated: new Date().toISOString() };
  for (const d in seats) pub.seats[d] = seats[d];
  writeJson(`${DIR}/data.json`, pub);
  writeJson(`${DIR}/private.json`, S);
  console.log(`${events.length} olay, ${order.length} üye, ${winners.length} kazanan, ${calls} API çağrısı`);
})().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
