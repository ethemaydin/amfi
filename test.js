// sync.js uçtan uca test (sahte Graph API; gerçek DM/API yok).
// Çalıştır: node test.js
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

const MOCK = path.join(__dirname, "test", "mock.js");
const SYNC = path.join(__dirname, "sync.js");
let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) fails++; };
const tmp = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), "amfi-" + tag + "-"));
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const cv = (id, user, igsid, text, msAgo) => ({
  id,
  updated_time: iso(msAgo),
  participants: { data: [{ id: "IG1", username: "englishbase.tr" }, { id: igsid, username: user }] },
  messages: { data: [{ from: { id: igsid, username: user }, message: text, created_time: iso(msAgo) }] }
});

function run(dir, extra = {}) {
  const env = {
    IG_TOKEN: "EAA" + "x".repeat(100), SALT: "test-salt", TOTAL: "50000", STEP: "10000",
    REQUIRE_COMMENT: "0", MAX_SEND: "50", MAX_CALLS: "100", RECHECK_EVERY: "0", CALLS_HOUR: "500",
    MOCK_LOG: path.join(dir, "postlog.jsonl"), ...extra
  };
  const r = spawnSync(process.execPath, ["--require", MOCK, SYNC], { cwd: dir, env: { ...process.env, ...env }, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const readJson = (dir, f, d) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { return d; } };
const posts = (dir) => { try { return fs.readFileSync(path.join(dir, "postlog.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse); } catch (e) { return []; } };

// ---------- 1) yorum + DM ile giriş, takip doğrulama, özel yanıt ----------
console.log("\n1) Yorum ve DM yolları, takip doğrulama");
const d1 = tmp("a");
const r1 = run(d1, {
  MOCK_COMMENTS: JSON.stringify({ M1: [
    { id: "C1", username: "follower1", text: "harika olmuş", timestamp: iso(120000) },
    { id: "C2", username: "nonfollower", text: "selam", timestamp: iso(60000) }
  ] }),
  MOCK_DMS: JSON.stringify({
    cv1: cv("cv1", "follower1", "U1", "Takip ettim \u2705", 30000),
    cv2: cv("cv2", "oldfan", "U2", "kat\u0131l", 40000)
  }),
  MOCK_FOLLOW: JSON.stringify({ U1: true, U2: true })
});
ok(r1.code === 0, "1. çalışma hatasız bitti " + (r1.code === 0 ? "" : r1.out));
const p1 = readJson(d1, "private.json", {}), pub1 = readJson(d1, "data.json", { seats: {} });
ok(pub1.seats["1"] === "follower1", "yorum yazan takipçi masa 1'e oturdu (şu an: " + JSON.stringify(pub1.seats) + ")");
ok(pub1.seats["2"] === "oldfan", "yorum yazmayan eski takipçi DM ile masa 2'ye oturdu");
ok(!Object.values(pub1.seats).includes("nonfollower"), "hiç DM atmayan kişi listeye girmedi");
const pv = posts(d1).filter((x) => x.recipient && x.recipient.comment_id);
ok(pv.length === 1 && pv[0].recipient.comment_id === "C2", "yorum yazan herkese özel yanıt gitti (" + pv.length + " adet)");
ok(posts(d1).every((x) => !x.recipient.comment_id || x.btn), "özel yanıtlar düğmeli gönderildi");
ok(pv.length === 1, "düğmeye basmış kullanıcıya ikinci kez özel yanıt gitmedi");

// ---------- 2) masa taşıma + kaldır ----------
console.log("\n2) 'masa 7' taşıma ve 'kaldır'");
const r2 = run(d1, {
  MOCK_DMS: JSON.stringify({
    cv1: cv("cv1", "follower1", "U1", "masa 7", 1000),
    cv2: cv("cv2", "oldfan", "U2", "kald\u0131r", 2000)
  }),
  MOCK_FOLLOW: JSON.stringify({ U1: true, U2: true })
});
const pub2 = readJson(d1, "data.json", { seats: {} }), p2 = readJson(d1, "private.json", { users: {} });
ok(r2.code === 0, "2. çalışma hatasız");
ok(pub2.seats["7"] === "follower1", "üye 'masa 7' ile taşındı");
ok(!pub2.seats["1"], "eski masa boşaldı");
ok(p2.users.oldfan && p2.users.oldfan.removed === true, "'kaldır' yazan kişi işaretlendi");
ok(Object.keys(pub2.seats).length === 1, "listede tek kişi kaldı");

// ---------- 3) takibi bırakan listeden düşer ----------
console.log("\n3) Takibi bırakan listeden düşer");
const r3 = run(d1, { MOCK_DMS: JSON.stringify({}), MOCK_FOLLOW: JSON.stringify({ U1: false }) });
const pub3 = readJson(d1, "data.json", { seats: {} });
ok(r3.code === 0, "3. çalışma hatasız");
ok(Object.keys(pub3.seats).length === 0, "takibi bırakan üye listeden çıkarıldı");

// ---------- 4) hızlı yanıt reddedilirse butonsuz fallback ----------
console.log("\n4) Buton desteklenmezse butonsuz gönderim");
const d4 = tmp("qr");
const r4 = run(d4, {
  MOCK_COMMENTS: JSON.stringify({ M1: [{ id: "C9", username: "qruser", text: "kat\u0131lmak istiyorum", timestamp: iso(60000) }] }),
  MOCK_DMS: JSON.stringify({}),
  MOCK_NO_QUICK_REPLY: "1"
});
const p4 = posts(d4);
ok(r4.code === 0, "çalışma hatasız");
ok(p4.length >= 2 && p4[0].btn === true && p4[p4.length - 1].btn === false, "önce düğmeli denendi, reddedilince butonsuz gönderildi (" + p4.length + " deneme)");

// ---------- 5) DRY modu: hiç mesaj gönderilmez ----------
console.log("\n5) DRY (kuru çalışma) modu");
const d5 = tmp("dry");
const r5 = run(d5, {
  DRY: "1",
  MOCK_COMMENTS: JSON.stringify({ M1: [{ id: "C10", username: "dryuser", text: "selam", timestamp: iso(60000) }] }),
  MOCK_DMS: JSON.stringify({}), MOCK_FOLLOW: JSON.stringify({})
});
ok(r5.code === 0, "çalışma hatasız");
ok(posts(d5).length === 0, "DRY modunda hiçbir mesaj gönderilmedi");
ok(/\[DRY/.test(r5.out), "DRY günlüğü basıldı");

// ---------- 6) İncir çekilişi ----------
console.log("\n6) 1 masa = 1 adım ile çekiliş");
const d6 = tmp("draw");
const now = Date.now();
fs.writeFileSync(path.join(d6, "private.json"), JSON.stringify({
  users: {
    aa: { u: "aa", first: now - 9000, checked: now, igsid: "U1", member: true, desk: 1, d: true, c: true },
    bb: { u: "bb", first: now - 8000, checked: now, igsid: "U2", member: true, desk: 2, d: true, c: true },
    cc: { u: "cc", first: now - 7000, checked: now, igsid: "U3", member: true, desk: 3, d: true, c: true }
  },
  order: ["aa", "bb", "cc"], cSince: now, cIds: [], mSince: now, winners: []
}));
const drawEnv = { TOTAL: "3", STEP: "1", MOCK_DMS: JSON.stringify({}), MOCK_FOLLOW: JSON.stringify({ U1: true, U2: true, U3: true }) };
const r6 = run(d6, drawEnv);
const w6 = readJson(d6, "data.json", { winners: [] }).winners;
ok(r6.code === 0, "çekiliş çalışması hatasız");
ok(w6.length === 3 && w6.every((w) => w.m >= 1 && w.m <= 3 && w.desk >= 1 && w.desk <= 3 && w.user), "her eşik için kazanan seçildi: " + w6.map((w) => w.m + "->@" + w.user).join(", "));
const r6b = run(d6, drawEnv);
const w6b = readJson(d6, "data.json", { winners: [] }).winners;
ok(JSON.stringify(w6) === JSON.stringify(w6b), "aynı SALT ile kazananlar değişmiyor (deterministik)");
console.log("\n" + (fails ? fails + " TEST BAŞARISIZ" : "TÜM TESTLER GEÇTİ"));
process.exit(fails ? 1 : 0);
process.exit(fails ? 1 : 0);