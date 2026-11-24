// private.json <-> state/private.enc (AES-256-GCM). Anahtar: STATE_KEY secret'ı.
const fs = require("fs"), crypto = require("crypto");
const pass = process.env.STATE_KEY || "";
if (pass.length < 12) { console.error("STATE_KEY secret'ı yok veya çok kısa (en az 12 karakter)."); process.exit(1); }
try {
  if (process.argv[2] === "enc") {
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32);
    const c = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([c.update(fs.readFileSync("private.json")), c.final()]);
    fs.writeFileSync("state/private.enc", Buffer.concat([salt, iv, c.getAuthTag(), ct]));
  } else {
    const b = fs.readFileSync("state/private.enc"), key = crypto.scryptSync(pass, b.subarray(0, 16), 32);
    const d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(16, 28)); d.setAuthTag(b.subarray(28, 44));
    fs.writeFileSync("private.json", Buffer.concat([d.update(b.subarray(44)), d.final()]));
  }
} catch (e) { console.error("Şifre işlemi başarısız (STATE_KEY yanlış olabilir):", e.message); process.exit(1); }
