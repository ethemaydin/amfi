// English Base Amfisi · otomasyon (Node 18+)
// Akış: yorum -> otomatik DM (özel yanıt + "Takip ettim" düğmesi) -> takip doğrula -> masa ata -> İncir çekilişi -> data.json
// Token: EAA... (Facebook girişli) veya IGAA... (Instagram girişli) ya da CSV modu (VERIFIED_CSV_URL).
const fs = require("fs");
const E = process.env;
const clean = (t) => (t || "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "");
let token = clean(E.IG_TOKEN), calls = 0, sent = 0;
const CSV = E.VERIFIED_CSV_URL;                       // ManyChat vb. aracın doldurduğu CSV (isteğe bağlı mod)
const FB = /^EAA/.test(token) || E.API_MODE === "facebook";
const BASE = (FB ? "https://graph.facebook.com/" : "https://graph.instagram.com/") + (E.API_VERSION || "v25.0");
const TOTAL = +E.TOTAL || 50000, STEP = +E.STEP || 10000;
const SALT = E.SALT || "english-base-amfi-2026";
const SITE = E.SITE_URL || "https://amfi.englishbase.com.tr";
const REQUIRE_COMMENT = E.REQUIRE_COMMENT !== "0";
const KEY = E.COMMENT_KEYWORD ? new RegExp(E.COMMENT_KEYWORD, "i") : null;   // boşsa her yorum sayılır
const AUTO = E.AUTO_DM !== "0" && !CSV;
const MAX_CALLS = +E.MAX_CALLS || 400, RECHECK = +E.RECHECK || 40, MAX_SEND = +E.MAX_SEND || 60;
const DIR = E.DATA_DIR || ".";
const NAME_OK = /^[A-Za-z0-9._]{1,30}$/;
const WANT = /masa\s*#?\s*(\d{1,5})/i, DEL = /kald[ıi]r|\bsil\b/i, JOIN = /kat[ıi]l/i;
const T_ASK = E.MSG_ASK || "Merhaba! English Base Amfisi için yorumun harika 🙌 Hesabı takip ettiysen aşağıdaki düğmeye bas, masanı hemen ayıralım.";
const T_BTN = E.MSG_BTN || "Takip ettim ✅";
const T_OK = (d) => (E.MSG_OK || `Masan hazır: #${d} 🎉 Haritada gör: ${SITE}  Masanı değiştirmek için bana "masa 123" yazabilirsin.`).replace("{masa}", d);
const T_NO = E.MSG_NO || `Hesabı henüz takip etmiyor görünüyorsun. Bizi takip edip tekrar "${T_BTN}" yaz, masan ayrılsın.`;
if (!token && !CSV) throw new Error("IG_TOKEN veya VERIFIED_CSV_URL gerekli");
if (token) {
  console.log(`Mod: ${FB ? "Facebook girişi (EAA)" : "Instagram girişi"}, token uzunluğu: ${token.length}, başlangıç: ${token.slice(0, 4)}`);
  if (token.length < 80) console.warn("UYARI: Token çok kısa; eksik kopyalanmış veya yanlış değer olabilir.");
}
const fail = (m) => m + (/access token|OAuth/i.test(m) ? " → IG_TOKEN geçersiz: yeniden üret, boşluk/tırnak olmadan yapıştır." : "");

async function api(path, params = {}, soft = false) {
  const u = new URL(path.startsWith("http") ? path : BASE + path);
  Object.entries({ ...params, access_token: token }).forEach(([k, v]) => u.searchParams.set(k, v));
  calls++;
  try {
    const j = await (await fetch(u)).json();
    if (j.error) throw new Error(fail(j.error.message));
    return j;
  } catch (e) { if (!soft) throw e; if (E.VERBOSE) console.error("API uyarı:", path, e.message); return null; }
}
async function post(path, body) {
  calls++;
  try {
    const j = await (await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) })).json();
    if (j.error) throw new Error(j.error.message);
    return j;
  } catch (e) { if (E.VERBOSE) console.error("Gönderim uyarı:", e.message); return null; }
}
function h32(str){let h1=1779033703,h2=3144134277,h3=1013904242,h4=2773480762;for(let i=0,k;i<str.length;i++){k=str.charCodeAt(i);h1=h2^Math.imul(h1^k,597399067);h2=h3^Math.imul(h2^k,2869860233);h3=h4^Math.imul(h3^k,951274213);h4=h1^Math.imul(h4^k,2716044179)}h1=Math.imul(h3^(h1>>>18),597399067);h2=Math.imul(h4^(h2>>>22),2869860233);h3=Math.imul(h1^(h3>>>17),951274213);h4=Math.imul(h2^(h4>>>19),2716044179);return(h1^h2^h3^h4)>>>0}
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const writeJson = (f, o) => { fs.writeFileSync(f + ".tmp", JSON.stringify(o)); fs.renameSync(f + ".tmp", f); };
let IG_ID = (E.IG_USER_ID || "").trim(), PAGE_ID = (E.PAGE_ID || "").trim();
async function discover() {
  if (!token) return {};
  if (!FB) {
    const me = (await api("/me", { fields: "user_id,username,followers_count" }, !!CSV)) || {};
    IG_ID = String(me.user_id || me.id || "");
    PAGE_ID = IG_ID;
    return me;
  }

  const f = "id,name,instagram_business_account{id,username,followers_count}";
  const acc = await api("/me/accounts", { fields: f + ",access_token" }, true);
  let pg = (acc && acc.data || []).find(
    (x) => x.instagram_business_account &&
      (!IG_ID || String(x.instagram_business_account.id) === IG_ID) &&
      (!PAGE_ID || String(x.id) === PAGE_ID)
  );

  if (pg) {
    if (pg.access_token) token = pg.access_token;
    PAGE_ID = String(pg.id);
    IG_ID = String(pg.instagram_business_account.id);
    return {
      username: pg.instagram_business_account.username,
      followers_count: pg.instagram_business_account.followers_count
    };
  }

  // /me/accounts boş dönerse bilinen IG_USER_ID üzerinden doğrudan sorgula
  if (IG_ID) {
    const igInfo = await api(`/${IG_ID}`, { fields: "id,username,followers_count" }, true);
    if (igInfo && igInfo.id) {
      PAGE_ID = PAGE_ID || String(igInfo.id);
      return igInfo;
    }
  }

  throw new Error("Bu token'a bağlı, Instagram'a bağlanmış bir Facebook Sayfası veya geçerli IG_USER_ID bulunamadı.");
}

let IG_ID = (E.IG_USER_ID || "").trim(), PAGE_ID = (E.PAGE_ID || "").trim();
async function discover() {          // hesap kimliklerini bul; kullanıcı token'ı verildiyse sayfa token'ına geç
  if (!token) return {};
  if (!FB) {
    const me = (await api("/me", { fields: "user_id,username,followers_count" }, !!CSV)) || {};
    IG_ID = String(me.user_id || me.id || ""); PAGE_ID = IG_ID; return me;
  }
  const f = "id,name,instagram_business_account{id,username,followers_count}";
  let pg = await api("/me", { fields: f }, true);
  if (!pg || !pg.instagram_business_account) {
    const acc = await api("/me/accounts", { fields: f + ",access_token" });
    pg = (acc.data || []).find((x) => x.instagram_business_account && (!IG_ID || x.instagram_business_account.id === IG_ID) && (!PAGE_ID || x.id === PAGE_ID));
    if (!pg) throw new Error("Bu token'a bağlı, Instagram'a bağlanmış bir Facebook Sayfası bulunamadı (izinleri ve sayfa seçimini kontrol et).");
    if (pg.access_token) token = pg.access_token;
  }
  PAGE_ID = pg.id; IG_ID = pg.instagram_business_account.id;
  return { followers_count: pg.instagram_business_account.followers_count };
}

(async () => {
  const S = readJson(`${DIR}/private.json`, { users: {}, order: [], cSince: 0, cIds: [], mSince: 0, winners: [] });
  const D = readJson(`${DIR}/data.json`, { winners: [] });
  const users = S.users, order = S.order, winners = (S.winners = S.winners || D.winners || []);
  const banned = new Set(fs.existsSync("banned.txt") ? fs.readFileSync("banned.txt", "utf8").split(/\s+/).map((s) => s.replace(/^@/, "").toLowerCase()).filter(Boolean) : []);
  const now = Date.now();

  if (!FB && token && S.token) token = S.token;
  if (!FB && token && (!S.tokenAt || now - S.tokenAt > 30 * 864e5)) {      // Instagram girişli token 60 gün; 30 günde bir yenile
    const r = await api("https://graph.instagram.com/refresh_access_token", { grant_type: "ig_refresh_token" }, true);
    if (r && r.access_token) { token = r.access_token; S.token = token; S.tokenAt = now; }
  }
  const me = await discover();
  const selfIds = new Set([IG_ID, PAGE_ID].filter(Boolean).map(String));

  const rec = (name) => { const k = name.toLowerCase(); return users[k] || (users[k] = { u: name, first: now, checked: 0 }); };
  const events = [];
  const dm = async (recipient, text, btn) => {
    if (sent >= MAX_SEND || !IG_ID) return false;
    const message = { text }; if (btn) message.quick_replies = [{ content_type: "text", title: btn, payload: "TAKIP" }];
    let j = await post(`/${IG_ID}/messages`, { recipient, message });
    if (!j && FB && PAGE_ID && PAGE_ID !== IG_ID) j = await post(`/${PAGE_ID}/messages`, { recipient, message });
    sent++; return !!j;
  };

  // 1) yorumlar (yeniden eskiye)
  let media = CSV ? [] : (E.MEDIA_IDS || "").split(",").filter(Boolean);
  if (!media.length && !CSV) media = ((await api(`/${IG_ID}/media`, { fields: "id", limit: 10 })).data || []).map((m) => m.id);
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
    const j = CSV ? null : await api(`/${FB ? PAGE_ID : "me"}/conversations`, cp, true);
    if (!j) break;
    const page = j.data || [];
    for (const cv of page) {
      const p = ((cv.participants && cv.participants.data) || []).find((x) => !selfIds.has(String(x.id)) && x.username !== me.username);
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
    const w = WANT.exec(ev.text);
    if (ev.src === "c") { if (!KEY || KEY.test(ev.text)) { r.c = true; r.cid = ev.id; r.cts = ev.ts; } }
    else { r.d = true; r.igsid = ev.igsid; }
    if (DEL.test(ev.text)) { if (!isWinner(k)) { unseat(k); r.removed = true; r.c = r.d = false; } continue; }
    if (r.removed) { if (JOIN.test(ev.text) && ev.src === "d") r.removed = false; else continue; }
    r.fresh = true;
    if (w && +w[1] >= 1 && +w[1] <= TOTAL) r.want = +w[1];
  }
  const maxC = events.filter((e) => e.src === "c").reduce((a, e) => Math.max(a, e.ts), S.cSince);
  S.cIds = [...new Set([...(maxC === S.cSince ? S.cIds || [] : []), ...events.filter((e) => e.src === "c" && e.ts === maxC).map((e) => e.id)])];
  S.cSince = maxC;
  S.mSince = events.filter((e) => e.src === "d").reduce((a, e) => Math.max(a, e.ts), S.mSince);

  // 3) yeni yorumculara otomatik özel yanıt (7 gün içinde, kişi başı 1 kez)
  if (AUTO) {
    for (const k of Object.keys(users).sort((a, b) => users[a].cts - users[b].cts)) {
      const r = users[k];
      if (r.c && r.cid && !r.replied && !r.d && !r.member && !r.removed && !banned.has(k) && now - r.cts < 6.5 * 864e5) {
        if (sent >= MAX_SEND) break;
        r.replied = await dm({ comment_id: r.cid }, T_ASK, T_BTN) || false;
      }
    }
  }

  const follows = async (r) => {
    if (CSV) return true;                     // doğrulamayı dış araç yaptı
    if (!r.igsid || calls >= MAX_CALLS) return null;
    const j = await api("/" + r.igsid, { fields: "username,is_user_follow_business" }, true);
    r.checked = Date.now();
    return j && typeof j.is_user_follow_business === "boolean" ? j.is_user_follow_business : null;
  };
  const eligible = (r) => !r.member && !r.removed && r.d && r.igsid && (r.c || !REQUIRE_COMMENT);

  if (CSV) {                                  // CSV modu: satır sırasıyla üye olur
    const txt = await (await fetch(CSV)).text();
    txt.split(/\r?\n/).forEach((line, i) => {
      const [a, b] = line.split(/[,;\t]/).map((x) => (x || "").replace(/^["'@\s]+|["'\s]+$/g, ""));
      if (i === 0 && /^(username|kullan[ıi]c[ıi])/i.test(a)) return;
      if (!NAME_OK.test(a || "") || banned.has(a.toLowerCase())) return;
      const r = rec(a); if (r.removed) return;
      r.c = r.d = true; r.igsid = r.igsid || "csv"; r.fresh = r.fresh || !r.member;
      const w = parseInt((b || "").replace(/\D/g, ""), 10);
      if (w >= 1 && w <= TOTAL && !r.member) r.want = w;
    });
  }
  // 4) taşıma istekleri (üyeler)
  for (const k in users) {
    const r = users[k];
    if (r.member && r.want) {
      if (r.want !== r.desk && !seats[r.want] && !isWinner(k)) { delete seats[r.desk]; free = Math.min(free, r.desk); r.desk = r.want; seats[r.want] = r.u; }
      r.want = 0;
    }
  }
  // 5) yeni üyeler: takip doğrulaması
  const pending = Object.keys(users).filter((k) => eligible(users[k]) && !banned.has(k) && (users[k].fresh || now - users[k].checked > 18e5))
    .sort((a, b) => users[a].first - users[b].first);
  for (const k of pending) {
    const r = users[k], f = await follows(r);
    r.fresh = false;
    if (f === true) {
      const d = r.want && !seats[r.want] ? r.want : nextFree();
      seats[d] = r.u; r.member = true; r.desk = d; r.want = 0; order.push(k);
      if (AUTO && r.igsid !== "csv") await dm({ id: r.igsid }, T_OK(d));
    } else if (f === false && AUTO && now - (r.warn || 0) > 6 * 36e5) { r.warn = now; await dm({ id: r.igsid }, T_NO, T_BTN); }
    if (calls >= MAX_CALLS) break;
  }
  // 6) banlılar
  for (const k of order.slice()) if (banned.has(k) && !isWinner(k)) unseat(k);
  // 7) takibi bırakanları ele
  const old = order.filter((k) => !isWinner(k)).sort((a, b) => users[a].checked - users[b].checked).slice(0, RECHECK);
  for (const k of old) { if ((await follows(users[k])) === false) unseat(k, "unfollowed"); if (calls >= MAX_CALLS) break; }

  // 8) İncir çekilişi (kazanan canlı kontrol edilir)
  const draw = async (m, attempt) => {
    for (let a = attempt; a < attempt + 50; a++) {
      const elig = order.slice(0, m).filter((k) => !banned.has(k));
      if (!elig.length) return null;
      const k = elig[h32(`${SALT}|${m}|${order[m - 1]}|${a}`) % elig.length], f = await follows(users[k]);
      if (f === true) return { m, user: users[k].u, desk: users[k].desk, attempt: a, at: new Date().toISOString() };
      if (f === false) unseat(k, "unfollowed"); else return null;
    }
    return null;
  };
  for (let i = 0; i < winners.length; i++) { const u = users[winners[i].user.toLowerCase()]; if (banned.has(winners[i].user.toLowerCase()) || !u || !u.member) {
    const w = await draw(winners[i].m, winners[i].attempt + 1); if (w) winners[i] = w; } }
  for (let m = STEP; m <= TOTAL; m += STEP) if (order.length >= m && !winners.some((w) => w.m === m)) { const w = await draw(m, 0); if (w) winners.push(w); }
  winners.sort((a, b) => a.m - b.m);

  const pub = { seats: {}, winners, followers: me.followers_count || 0, total: TOTAL, step: STEP, updated: new Date().toISOString() };
  for (const d in seats) pub.seats[d] = seats[d];
  writeJson(`${DIR}/data.json`, pub);
  writeJson(`${DIR}/private.json`, S);
  console.log(`${events.length} olay, ${order.length} üye, ${winners.length} kazanan, ${sent} mesaj, ${calls} API çağrısı`);
})().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
