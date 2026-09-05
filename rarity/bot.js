const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
let currentQR = null;
let botStatus = 'Initializing';

const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'AQ.Ab8RN6IAq5GuI0lYu_AjO0ZaHCTbecAAud26nXYtL5KAxMQdvA',
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '1le2VC_ASrU1YVebKmuJUyLivPfvKA3kLW5KUUjKSrN4',
  GOOGLE_ACCESS_TOKEN: process.env.GOOGLE_ACCESS_TOKEN || '',
  PLANNER_TAB: process.env.PLANNER_TAB || '[ISI DISINI]',
  EXPENSE_CATEGORIES: ['Makan', 'Belanja', 'Hiburan', 'Hutang', 'Jajan', 'Top Up', 'transport', 'Gadget', 'Pakaian', 'Lainnya'],
  TRACKER_CATEGORIES: ['Tugas', 'Jadwal Kumpul', 'Ujian', 'Event', 'Lainnya'],
  REMINDERS_FILE: path.join(__dirname, 'reminders.json')
};

let reminders = [];
try {
  if (fs.existsSync(CONFIG.REMINDERS_FILE)) {
    reminders = JSON.parse(fs.readFileSync(CONFIG.REMINDERS_FILE, 'utf-8'));
  }
} catch (e) { reminders = []; }

function saveReminders() {
  fs.writeFileSync(CONFIG.REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

function rupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

// HTTP Server for Render keep-alive & QR web pairing
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  if (botStatus === 'Connected') {
    return res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>RARITY Bot</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc;">
        <h2>✅ RARITY WhatsApp Bot Online</h2>
        <p style="color:#16a34a;font-weight:bold;">Status: Connected & Active</p>
        <p>Render Keep-Alive Active</p>
      </body>
      </html>
    `);
  }

  if (currentQR) {
    try {
      const qrDataUrl = await qrcode.toDataURL(currentQR);
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Scan QR WhatsApp Bot</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc;">
          <h2>Scan QR WhatsApp Bot</h2>
          <p>Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat</p>
          <img src="${qrDataUrl}" style="border:1px solid #ccc;padding:10px;background:#fff;border-radius:8px;"/><br><br>
          <small>Halaman otomatis refresh tiap 15 detik</small>
          <script>setTimeout(function(){ location.reload(); }, 15000);</script>
        </body>
        </html>
      `);
    } catch (e) {
      return res.end('Gagal generate QR');
    }
  }

  res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>Menyiapkan QR...</h2><script>setTimeout(function(){ location.reload(); }, 3000);</script></body></html>`);
});

server.listen(PORT, () => console.log(`HTTP Server running on port ${PORT}`));

// Self-ping to prevent Render free instance sleeping
setInterval(() => {
  if (process.env.RENDER_EXTERNAL_URL) {
    fetch(process.env.RENDER_EXTERNAL_URL + '/health').catch(() => {});
  }
}, 5 * 60 * 1000);

async function callGemini(contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } })
  });
  if (!res.ok) throw new Error(`Gemini Error ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
}

async function appendExpenseToSheet(exp) {
  if (!CONFIG.GOOGLE_ACCESS_TOKEN) return { success: false, reason: 'No Google Access Token set' };
  const tab = CONFIG.PLANNER_TAB;
  const encGet = encodeURIComponent(`'${tab}'!F66:J121`);
  const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encGet}`, {
    headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}` }
  });
  const getData = await getRes.json();
  const rows = getData.values || [];
  let emptyOffset = rows.findIndex(r => !r || !r[0] || !String(r[0]).trim());
  if (emptyOffset === -1) emptyOffset = rows.length;
  const nextRow = 66 + emptyOffset;
  if (nextRow > 121) return { success: false, reason: 'Sheet penuh (maks baris 121)' };

  const encWrite = encodeURIComponent(`'${tab}'!F${nextRow}:J${nextRow}`);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encWrite}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: [[exp.date || new Date().toISOString().split('T')[0], exp.merchant || 'Umum', exp.category || 'Lainnya', exp.amount || 0, exp.notes || '']]
    })
  });
  return { success: true, row: nextRow };
}

async function appendReminderToSheet(rem) {
  if (!CONFIG.GOOGLE_ACCESS_TOKEN) return;
  try {
    const dt = new Date(rem.timestamp);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    const dateTimeFormatted = `${y}-${m}-${d} ${hh}:${mm}`;
    const timeNote = `Jam: ${hh}:${mm}${rem.notes ? ' • ' + rem.notes : ''}`;

    const encGet = encodeURIComponent("'Tracker'!B3:E50");
    const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encGet}`, {
      headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}` }
    });
    const getData = await getRes.json();
    const rows = getData.values || [];
    let emptyOffset = rows.findIndex(r => !r || !r[0]);
    if (emptyOffset === -1) emptyOffset = rows.length;
    const nextRow = 3 + emptyOffset;

    const encWrite = encodeURIComponent(`'Tracker'!B${nextRow}:E${nextRow}`);
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encWrite}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[dateTimeFormatted, rem.name, rem.category, timeNote]] })
    });
  } catch (e) {
    console.warn('Tracker sync error:', e.message);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) currentQR = qr;
    if (connection === 'close') {
      botStatus = 'Disconnected';
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      currentQR = null;
      botStatus = 'Connected';
      console.log('✅ WhatsApp Bot Connected!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      const isImage = !!msg.message.imageMessage;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';

      if (isImage) {
        await sock.sendMessage(remoteJid, { text: '🔍 Membaca struk dengan AI...' });
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const base64Data = buffer.toString('base64');
          const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
          const today = new Date().toISOString().split('T')[0];
          const prompt = `Extract receipt info into JSON only: date (YYYY-MM-DD, default ${today}), merchant, amount (integer Rupiah), category (${CONFIG.EXPENSE_CATEGORIES.join('/')}), notes.`;
          const parsed = await callGemini([{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]);
          if (!CONFIG.EXPENSE_CATEGORIES.includes(parsed.category)) parsed.category = 'Lainnya';
          const sheetResult = await appendExpenseToSheet(parsed);

          let reply = `🧾 *HASIL STRUK BELANJA*\n📅 Tanggal: ${parsed.date}\n🏪 Toko: ${parsed.merchant || 'Umum'}\n💰 Total: ${rupiah(parsed.amount)}\n🏷️ Kategori: ${parsed.category}\n`;
          if (parsed.notes) reply += `📝 Catatan: ${parsed.notes}\n`;
          reply += sheetResult.success ? `\n✅ *Tercatat di Sheet baris ${sheetResult.row}*` : `\n⚠️ Status Sheet: ${sheetResult.reason}`;
          await sock.sendMessage(remoteJid, { text: reply });
        } catch (e) {
          await sock.sendMessage(remoteJid, { text: `❌ Gagal: ${e.message}` });
        }
        continue;
      }

      if (!text.trim()) continue;

      if (/^(selesai|done)/i.test(text.trim())) {
        const query = text.replace(/^(selesai|done)\s*/i, '').trim().toLowerCase();
        let target = reminders.find(r => !r.done && (r.chatId === remoteJid) && (query === '' || r.name.toLowerCase().includes(query)));
        if (target) {
          target.done = true;
          saveReminders();
          await sock.sendMessage(remoteJid, { text: `🎉 Agenda *${target.name}* telah diselesaikan!` });
        } else {
          await sock.sendMessage(remoteJid, { text: 'Tidak ada pengingat aktif yang cocok.' });
        }
        continue;
      }

      const now = new Date();
      const todayISO = now.toISOString().split('T')[0];
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const prompt = `Classify user Indonesian input: "${text}". Current time: ${todayISO} ${timeStr}.
Output JSON only:
If reminder/task/event/deadline:
{"type":"reminder","name":"string","datetime":"YYYY-MM-DD HH:mm","category":"${CONFIG.TRACKER_CATEGORIES.join('/')}","notes":"string"}
Else:
{"type":"expense","date":"YYYY-MM-DD","merchant":"string","amount":integer_IDR,"category":"${CONFIG.EXPENSE_CATEGORIES.join('/')}","notes":"string"}`;

      try {
        const parsed = await callGemini([{ parts: [{ text: prompt }] }]);
        if (parsed.type === 'reminder' && parsed.datetime) {
          const targetTime = new Date(parsed.datetime.replace(' ', 'T')).getTime();
          if (isNaN(targetTime)) {
            await sock.sendMessage(remoteJid, { text: 'Waktu belum jelas. Contoh: *Ingatkan ujian kalkulus besok jam 08:00*' });
            continue;
          }
          const newRem = { id: Date.now(), chatId: remoteJid, name: parsed.name || 'Agenda', timestamp: targetTime, category: parsed.category || 'Lainnya', notes: parsed.notes || '', done: false, triggered: [] };
          reminders.push(newRem);
          saveReminders();
          appendReminderToSheet(newRem);

          const formattedDT = new Date(targetTime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
          let reply = `⏰ *PENGINGAT TERSIMPAN*\n📌 *${newRem.name}* [${newRem.category}]\n🗓️ Waktu: *${formattedDT}*\n🔔 Pengingat aktif (H-1 hari, 12 jam, 5 jam, 1 jam, 30 menit & saat mulai).\n_Ketik "selesai ${newRem.name}" jika sudah beres._`;
          await sock.sendMessage(remoteJid, { text: reply });
        } else {
          if (!CONFIG.EXPENSE_CATEGORIES.includes(parsed.category)) parsed.category = 'Lainnya';
          const sheetResult = await appendExpenseToSheet(parsed);
          let reply = `💸 *CATATAN PENGELUARAN*\n🏪 Toko: ${parsed.merchant || 'Umum'}\n💰 Jumlah: ${rupiah(parsed.amount)}\n🏷️ Kategori: ${parsed.category}\n`;
          reply += sheetResult.success ? `✅ *Tercatat di Sheet baris ${sheetResult.row}*` : `⚠️ Status Sheet: ${sheetResult.reason}`;
          await sock.sendMessage(remoteJid, { text: reply });
        }
      } catch (e) {
        await sock.sendMessage(remoteJid, { text: 'Format belum terbaca. Kirim struk foto atau teks belanja / pengingat.' });
      }
    }
  });

  const INTERVALS = [
    { label: '1 hari lagi', ms: 24 * 60 * 60 * 1000 },
    { label: '12 jam lagi', ms: 12 * 60 * 60 * 1000 },
    { label: '5 jam lagi', ms: 5 * 60 * 60 * 1000 },
    { label: '1 jam lagi', ms: 60 * 60 * 1000 },
    { label: '30 menit lagi', ms: 30 * 60 * 1000 },
    { label: 'Waktunya sekarang!', ms: 0 }
  ];

  setInterval(async () => {
    const now = Date.now();
    let changed = false;
    for (const rem of reminders) {
      if (rem.done) continue;
      const diff = rem.timestamp - now;
      rem.triggered = rem.triggered || [];
      for (const inv of INTERVALS) {
        if (diff <= inv.ms && diff > inv.ms - 45000 && !rem.triggered.includes(inv.label)) {
          rem.triggered.push(inv.label);
          changed = true;
          try {
            await sock.sendMessage(rem.chatId, { text: `🔔 *PENGINGAT!*\n📌 *${rem.name}* [${rem.category}]\n⏳ *${inv.label}*\n🗓️ Jadwal: ${new Date(rem.timestamp).toLocaleString('id-ID')}\n\n_Ketik "selesai ${rem.name}" jika sudah selesai._` });
          } catch (err) {}
        }
      }
    }
    if (changed) saveReminders();
  }, 30000);
}

startBot();
