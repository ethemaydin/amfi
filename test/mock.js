// sync.js testleri için sahte Graph API (gerçek ağa çıkmaz).
// Kullanım: node --require ./test/mock.js ./sync.js
const fs = require("fs");
const J = (k, d) => { try { return JSON.parse(process.env[k] || ""); } catch (e) { return d; } };
const COMMENTS = J("MOCK_COMMENTS", {});   // { mediaId: [{ id, username, text, timestamp }] }
const DMS = J("MOCK_DMS", {});             // { cvId: { participants:{data:[...]}, messages:{data:[...]}, updated_time } }
const FOLLOW = J("MOCK_FOLLOW", {});       // { IGSID: true|false }
const ME = J("MOCK_ME", { id: "PAGE1", name: "Test Sayfa", instagram_business_account: { id: "IG1", username: "englishbase.tr", followers_count: 1234 } });
const NO_QR = process.env.MOCK_NO_QUICK_REPLY === "1";
const LOG = process.env.MOCK_LOG || "postlog.jsonl";
const res = (o) => ({ status: 200, json: async () => o });

global.fetch = async function (input, init) {
  const u = new URL(typeof input === "string" ? input : String(input.url || input));
  const p = u.pathname.replace(/^\/v\d+\.\d+/, "");
  const method = (init && init.method) || "GET";

  if (method === "POST") {
    const body = JSON.parse((init && init.body) || "{}");
    const msg = body.message || {};
    fs.appendFileSync(LOG, JSON.stringify({ path: p, recipient: body.recipient, text: msg.text || "", btn: !!msg.quick_replies }) + "\n");
    if (NO_QR && msg.quick_replies) return res({ error: { message: "Quick replies are not supported here", code: 100 } });
    return res({ recipient_id: "x", message_id: "mid" + Date.now() });
  }

  if (p === "/me") return res(ME);
  if (/\/media$/.test(p)) return res({ data: Object.keys(COMMENTS).map((id) => ({ id })) });
  const cm = p.match(/^\/([^/]+)\/comments$/);
  if (cm) {
    const list = (COMMENTS[cm[1]] || []).slice().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return res({ data: list });
  }
  if (/\/conversations$/.test(p)) return res({ data: Object.values(DMS) });
  const prof = p.match(/^\/(U\w+)$/);
  if (prof) {
    const f = FOLLOW[prof[1]];
    return res({ id: prof[1], username: "user_" + prof[1], is_user_follow_business: typeof f === "boolean" ? f : undefined });
  }
  return res({ error: { message: "mock: bilinmeyen yol " + p } });
};