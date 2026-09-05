/**
 * RARITY - Official WhatsApp Business Cloud API Webhook Server
 * Meta for Developers: WhatsApp Cloud API
 * Ready for deployment on Render.com
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

// ponytail: parse .env simply without adding dotenv package
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Configuration via Environment Variables
const CONFIG = {
  VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || 'rarity_webhook_secret_123',
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || '', // Meta Cloud API System User / Access Token
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID || '', // WhatsApp Phone Number ID
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
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

// 1. Send WhatsApp Message via Meta Cloud API
async function sendWhatsAppMessage(to, text) {
  if (!CONFIG.WHATSAPP_TOKEN || !CONFIG.PHONE_NUMBER_ID) {
    console.warn('[WA-Cloud] Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID');
    return;
  }
  const url = `https://graph.facebook.com/v20.0/${CONFIG.PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text }
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[WA-Cloud] Send failed:', res.status, JSON.stringify(data));
    } else {
      console.log('[WA-Cloud] Message sent successfully to', to, 'id:', data.messages?.[0]?.id);
    }
    return data;
  } catch (err) {
    console.error('[WA-Cloud] Network error sending message:', err.message);
  }
}

// 2. Download Media URL from Meta Cloud API
async function downloadMedia(mediaId) {
  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${CONFIG.WHATSAPP_TOKEN}` }
  });
  const metaData = await metaRes.json();
  const mediaUrl = metaData.url;

  const fileRes = await fetch(mediaUrl, {
    headers: { 'Authorization': `Bearer ${CONFIG.WHATSAPP_TOKEN}` }
  });
  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    base64Data: Buffer.from(arrayBuffer).toString('base64'),
    mimeType: metaData.mime_type || 'image/jpeg'
  };
}

// 3. Call Gemini AI
async function callGemini(contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });
  if (!res.ok) throw new Error(`Gemini Error ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
}

// Users persistence: maps phone to { step, name, sheetId, plannerTab }
const USERS_FILE = path.join(__dirname, 'users.json');
let users = {};
try {
  if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
} catch (e) { users = {}; }

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getUser(phone) {
  if (!users[phone]) {
    users[phone] = { step: 'ASK_NAME', name: '', sheetId: '', plannerTab: '' };
    saveUsers();
  }
  return users[phone];
}

// 4. Append Expense to Google Sheets
async function appendExpenseToSheet(exp, targetSheetId, targetTab) {
  const sheetId = targetSheetId || CONFIG.SPREADSHEET_ID;
  const tab = targetTab || CONFIG.PLANNER_TAB;
  if (!CONFIG.GOOGLE_ACCESS_TOKEN) return { success: false, reason: 'No Google Token' };
  
  const encGet = encodeURIComponent(`'${tab}'!F66:J121`);
  const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encGet}`, {
    headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}` }
  });
  const getData = await getRes.json();
  const rows = getData.values || [];
  let emptyOffset = rows.findIndex(r => !r || !r[0] || !String(r[0]).trim());
  if (emptyOffset === -1) emptyOffset = rows.length;
  const nextRow = 66 + emptyOffset;
  if (nextRow > 121) return { success: false, reason: 'Sheet penuh' };

  const encWrite = encodeURIComponent(`'${tab}'!F${nextRow}:J${nextRow}`);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encWrite}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: [[exp.date || new Date().toISOString().split('T')[0], exp.merchant || 'Umum', exp.category || 'Lainnya', exp.amount || 0, exp.notes || '']]
    })
  });
  return { success: true, row: nextRow };
}

// 5. Append Reminder to Tracker Tab
async function appendReminderToSheet(rem, targetSheetId) {
  const sheetId = targetSheetId || CONFIG.SPREADSHEET_ID;
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
    const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encGet}`, {
      headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}` }
    });
    const getData = await getRes.json();
    const rows = getData.values || [];
    let emptyOffset = rows.findIndex(r => !r || !r[0]);
    if (emptyOffset === -1) emptyOffset = rows.length;
    const nextRow = 3 + emptyOffset;

    const encWrite = encodeURIComponent(`'Tracker'!B${nextRow}:E${nextRow}`);
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encWrite}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${CONFIG.GOOGLE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[dateTimeFormatted, rem.name, rem.category, timeNote]] })
    });
  } catch (e) {}
}

// --- WEBHOOK ROUTES FOR META CLOUD API ---

// GET /webhook (Meta verification handshake)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
    console.log('[Webhook] Verified successfully with Meta!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST /webhook (Meta incoming message listener)
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge Meta immediately

  const body = req.body;
  console.log('[Webhook POST] Incoming payload:', JSON.stringify(body, null, 2));

  if (!body.object || !body.entry) {
    console.warn('[Webhook POST] Ignored: missing body.object or body.entry');
    return;
  }

  for (const entry of body.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      const messages = value?.messages || [];
      const statuses = value?.statuses || [];

      if (statuses.length) {
        console.log('[Webhook Status Update]:', statuses.map(s => `${s.id}: ${s.status}`));
      }

      for (const msg of messages) {
        const from = msg.from; // User's WhatsApp Phone Number
        const msgType = msg.type;
        console.log(`[Webhook Message] Received ${msgType} from ${from}:`, msg.text?.body || msg.image?.id || '');

        const user = getUser(from);

        // A. Image Receipt OCR
        if (msgType === 'image') {
          await sendWhatsAppMessage(from, '🔍 Membaca struk dengan AI...');
          try {
            const { base64Data, mimeType } = await downloadMedia(msg.image.id);
            const today = new Date().toISOString().split('T')[0];
            const prompt = `Extract receipt info to JSON: date (YYYY-MM-DD, default ${today}), merchant, amount (integer Rupiah), category (${CONFIG.EXPENSE_CATEGORIES.join('/')}), notes.`;
            const parsed = await callGemini([{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]);

            if (!CONFIG.EXPENSE_CATEGORIES.includes(parsed.category)) parsed.category = 'Lainnya';
            const sheetRes = await appendExpenseToSheet(parsed, user.sheetId, user.plannerTab);

            let reply = `🧾 *HASIL STRUK BELANJA*\n📅 Tanggal: ${parsed.date}\n🏪 Toko: ${parsed.merchant || 'Umum'}\n💰 Total: ${rupiah(parsed.amount)}\n🏷️ Kategori: ${parsed.category}\n`;
            if (parsed.notes) reply += `📝 Catatan: ${parsed.notes}\n`;
            reply += sheetRes.success ? `\n✅ *Tercatat di Sheet baris ${sheetRes.row}*` : `\n⚠️ Status Sheet: ${sheetRes.reason}`;
            await sendWhatsAppMessage(from, reply);
          } catch (e) {
            await sendWhatsAppMessage(from, `❌ Gagal memproses struk: ${e.message}`);
          }
          continue;
        }

        // B. Text Message
        if (msgType === 'text') {
          const text = msg.text.body.trim();

          // 1. Explicit Help / Info Commands
          if (/^(!help|help|\/help|!rarity|info)/i.test(text)) {
            const reply = `👋 *Halo ${user.name || 'di Rarity'}!*\n\n` +
              `Saya asisten keuangan & pengingat WhatsApp Anda.\n\n` +
              `📌 *Perintah Cepat:*\n` +
              `• Kirim *Foto Struk* → Baca otomatis & catat ke Sheet\n` +
              `• *Beli [item] [harga]* → Catat pengeluaran (contoh: _Beli kopi 25rb di Janji Jiwa_)\n` +
              `• *Ingatkan [acara] [waktu]* → Buat pengingat (contoh: _Ingatkan ujian kalkulus besok jam 08:00_)\n` +
              `• *selesai [nama]* → Tandai pengingat beres\n` +
              `• *!status* → Cek koneksi Google Sheet Anda\n` +
              `• *!sheet [ID_SHEET]* → Ubah / hubungkan Google Sheet baru\n` +
              `• *!reset* → Ulangi onboarding nama & sheet`;
            await sendWhatsAppMessage(from, reply);
            continue;
          }

          // 2. Status Command
          if (/^!status/i.test(text)) {
            const sheetMsg = user.sheetId ? `✅ Terhubung ke ID: \`${user.sheetId}\`` : `⚠️ Belum terhubung. Kirim \`!sheet [ID_GOOGLE_SHEET]\``;
            await sendWhatsAppMessage(from, `👤 *Profil User:*\nNama: ${user.name || 'Belum diatur'}\nSheet: ${sheetMsg}`);
            continue;
          }

          // 3. Reset / Re-link Sheet
          if (/^!reset/i.test(text)) {
            user.step = 'ASK_NAME';
            user.name = '';
            user.sheetId = '';
            saveUsers();
            await sendWhatsAppMessage(from, '🔄 Data profil direset. Siapa nama panggilan Anda?');
            continue;
          }

          if (/^!sheet\s*/i.test(text)) {
            const rawId = text.replace(/^!sheet\s*/i, '').trim();
            const extracted = rawId.match(/[-\w]{25,}/)?.[0] || rawId;
            if (extracted.length >= 25) {
              user.sheetId = extracted;
              user.step = 'READY';
              saveUsers();
              await sendWhatsAppMessage(from, `✅ Google Sheet ID berhasil disimpan:\n\`${extracted}\`\n\nSekarang Anda siap mencatat belanja atau membuat pengingat!`);
            } else {
              await sendWhatsAppMessage(from, 'Format Sheet ID tidak valid. Contoh: `!sheet 1le2VC_ASrU1YVebKmuJUyLivPfvKA3kLW5KUUjKSrN4`');
            }
            continue;
          }

          // 4. ONBOARDING STEP: ASK_NAME
          if (user.step === 'ASK_NAME') {
            user.name = text;
            user.step = 'ASK_SHEET';
            saveUsers();
            const welcome = `Salam kenal, *${user.name}*! 👋\n\n` +
              `Untuk mencatat transaksi & agenda, hubungkan dengan Google Sheet Rarity Anda.\n\n` +
              `1️⃣ *Sudah buka Rarity di Web?* Salin Sheet ID dari menu Settings di web, lalu balas pesan ini dengan ID-nya.\n` +
              `2️⃣ *Belum punya?* Buka aplikasi web Rarity untuk buat otomatis, atau ketik *lewati* jika ingin coba bot dulu.`;
            await sendWhatsAppMessage(from, welcome);
            continue;
          }

          // 5. ONBOARDING STEP: ASK_SHEET
          if (user.step === 'ASK_SHEET') {
            if (/^(lewati|skip|nanti)/i.test(text)) {
              user.step = 'READY';
              saveUsers();
              await sendWhatsAppMessage(from, `Siap, *${user.name}*! Anda bisa menghubungkan Google Sheet kapan saja dengan ketik:\n\`!sheet [ID_SHEET]\`\n\nKetik *!help* untuk panduan.`);
              continue;
            }
            const extracted = text.match(/[-\w]{25,}/)?.[0];
            if (extracted) {
              user.sheetId = extracted;
              user.step = 'READY';
              saveUsers();
              await sendWhatsAppMessage(from, `🎉 Mantap *${user.name}*! Google Sheet terhubung:\n\`${extracted}\`\n\nKetik *!help* untuk melihat apa saja yang bisa saya lakukan.`);
            } else {
              await sendWhatsAppMessage(from, 'Sheet ID belum valid. Tempelkan ID Sheet (25+ karakter) atau ketik *lewati* untuk lanjut tanpa sheet sekarang.');
            }
            continue;
          }

          // 6. Done command
          if (/^(selesai|done)/i.test(text)) {
            const query = text.replace(/^(selesai|done)\s*/i, '').trim().toLowerCase();
            let target = reminders.find(r => !r.done && (r.phone === from) && (query === '' || r.name.toLowerCase().includes(query)));
            if (target) {
              target.done = true;
              saveReminders();
              await sendWhatsAppMessage(from, `🎉 Agenda *${target.name}* telah diselesaikan!`);
            } else {
              await sendWhatsAppMessage(from, 'Tidak ada pengingat aktif yang cocok.');
            }
            continue;
          }

          // 7. Natural Language Classification (Strict with "chat" fallback)
          const now = new Date();
          const todayISO = now.toISOString().split('T')[0];
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          const prompt = `Classify user Indonesian message: "${text}". Current time: ${todayISO} ${timeStr}.
Rules:
- If user wants to set a reminder/event/task/alarm with a time:
  {"type":"reminder","name":"string","datetime":"YYYY-MM-DD HH:mm","category":"${CONFIG.TRACKER_CATEGORIES.join('/')}","notes":"string"}
- If user describes an expense/purchase/money spent (mentions an item and price):
  {"type":"expense","date":"YYYY-MM-DD","merchant":"string","amount":integer_IDR,"category":"${CONFIG.EXPENSE_CATEGORIES.join('/')}","notes":"string"}
- If greeting, question, command, or general chit-chat:
  {"type":"chat","reply":"short friendly Indonesian reply"}
Output JSON only.`;

          try {
            const parsed = await callGemini([{ parts: [{ text: prompt }] }]);
            
            if (parsed.type === 'reminder' && parsed.datetime) {
              const targetTime = new Date(parsed.datetime.replace(' ', 'T')).getTime();
              if (isNaN(targetTime)) {
                await sendWhatsAppMessage(from, 'Format waktu belum jelas. Contoh: *Ingatkan ujian kalkulus besok jam 08:00*');
                continue;
              }
              const newRem = {
                id: Date.now(),
                phone: from,
                name: parsed.name || 'Agenda',
                timestamp: targetTime,
                category: parsed.category || 'Lainnya',
                notes: parsed.notes || '',
                done: false,
                triggered: []
              };
              reminders.push(newRem);
              saveReminders();
              appendReminderToSheet(newRem, user.sheetId);

              const formattedDT = new Date(targetTime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
              let reply = `⏰ *PENGINGAT TERSIMPAN*\n📌 *${newRem.name}* [${newRem.category}]\n🗓️ Waktu: *${formattedDT}*\n🔔 Pengingat aktif (H-1 hari, 12 jam, 5 jam, 1 jam, 30 menit & saat mulai).\n_Ketik "selesai ${newRem.name}" jika sudah beres._`;
              await sendWhatsAppMessage(from, reply);
            } else if (parsed.type === 'expense' && parsed.amount) {
              if (!CONFIG.EXPENSE_CATEGORIES.includes(parsed.category)) parsed.category = 'Lainnya';
              const sheetRes = await appendExpenseToSheet(parsed, user.sheetId, user.plannerTab);
              let reply = `💸 *CATATAN PENGELUARAN*\n🏪 Toko: ${parsed.merchant || 'Umum'}\n💰 Jumlah: ${rupiah(parsed.amount)}\n🏷️ Kategori: ${parsed.category}\n`;
              reply += sheetRes.success ? `✅ *Tercatat di Sheet baris ${sheetRes.row}*` : `⚠️ Status Sheet: ${sheetRes.reason}`;
              await sendWhatsAppMessage(from, reply);
            } else {
              // Casual chit-chat or unrecognized
              const reply = parsed.reply || `Halo ${user.name || ''}! Ketik *!help* untuk melihat perintah atau kirim foto struk belanja untuk dicatat.`;
              await sendWhatsAppMessage(from, reply);
            }
          } catch (e) {
            console.error('[Gemini / Parse Error]:', e.message);
            await sendWhatsAppMessage(from, 'Format belum terbaca. Kirim foto struk atau ketik *!help* untuk bantuan.');
          }
        }
      }
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => console.log(`WhatsApp Cloud API Webhook Server listening on port ${PORT}`));

// Background 5-Stage Reminder Schedule
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
          const msg = `🔔 *PENGINGAT!*\n📌 *${rem.name}* [${rem.category}]\n⏳ *${inv.label}*\n🗓️ Jadwal: ${new Date(rem.timestamp).toLocaleString('id-ID')}\n\n_Ketik "selesai ${rem.name}" jika sudah beres._`;
          await sendWhatsAppMessage(rem.phone, msg);
        } catch (err) {
          console.error('Failed to dispatch Cloud API reminder:', err.message);
        }
      }
    }
  }
  if (changed) saveReminders();
}, 30000);
