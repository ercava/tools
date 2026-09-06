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
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || Buffer.from('QVEuQWI4Uk42SnJ4ai05emFQRFlQYjF4Vmtob3pzRE9kWXZzcjZNLURVSmwzR1JYalE2WFE=', 'base64').toString(),
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest',
  APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbw1L3SYdGadXzfzv80othCcuajT-mtPfN7DdLt3OuHNbWbOMVB9Ym25ZRjxZ773TlYA/exec',
  ADMIN_SECRET: process.env.ADMIN_SECRET || 'rarity_x9k2m',
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '1le2VC_ASrU1YVebKmuJUyLivPfvKA3kLW5KUUjKSrN4',
  GOOGLE_ACCESS_TOKEN: process.env.GOOGLE_ACCESS_TOKEN || '',
  PLANNER_TAB: process.env.PLANNER_TAB || '[ISI DISINI]',
  EXPENSE_CATEGORIES: ['Makan', 'Belanja', 'Hiburan', 'Hutang', 'Jajan', 'Top Up', 'transport', 'Gadget', 'Pakaian', 'Lainnya'],
  TRACKER_CATEGORIES: ['Tugas', 'Jadwal Kumpul', 'Ujian', 'Event', 'Lainnya'],
  REMINDERS_FILE: path.join(__dirname, 'reminders.json')
};

// Background 5-Stage Reminder Schedule
const INTERVALS = [
  { label: '1 hari lagi', ms: 24 * 60 * 60 * 1000 },
  { label: '12 jam lagi', ms: 12 * 60 * 60 * 1000 },
  { label: '5 jam lagi', ms: 5 * 60 * 60 * 1000 },
  { label: '1 jam lagi', ms: 60 * 60 * 1000 },
  { label: '30 menit lagi', ms: 30 * 60 * 1000 },
  { label: 'Waktunya sekarang!', ms: 0 }
];

let reminders = [];
try {
  if (fs.existsSync(CONFIG.REMINDERS_FILE)) {
    reminders = JSON.parse(fs.readFileSync(CONFIG.REMINDERS_FILE, 'utf-8'));
  }
} catch (e) { reminders = []; }

function saveReminders() {
  fs.writeFileSync(CONFIG.REMINDERS_FILE, JSON.stringify(reminders, null, 2));
  if (CONFIG.APPS_SCRIPT_URL) {
    fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveReminders', reminders })
    }).catch(() => {});
  }
}

async function syncRemindersFromCloud() {
  if (!CONFIG.APPS_SCRIPT_URL) return;
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getReminders' })
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.reminders)) {
      const map = new Map(reminders.map(r => [r.id, r]));
      data.reminders.forEach(r => map.set(r.id, { ...r, ...map.get(r.id) }));
      reminders = Array.from(map.values());
      fs.writeFileSync(CONFIG.REMINDERS_FILE, JSON.stringify(reminders, null, 2));
      console.log('[Reminders] Synced', reminders.length, 'reminders from Cloud');
    }
  } catch (e) {}
}
syncRemindersFromCloud();

function formatCurrency(n, curr = 'IDR') {
  if (curr === 'AUD') {
    return 'A$ ' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 });
  }
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}
const rupiah = formatCurrency;

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
  if (!mediaUrl) throw new Error('Could not get media URL from Meta: ' + JSON.stringify(metaData));

  const fileRes = await fetch(mediaUrl, {
    headers: {
      'Authorization': `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
      'User-Agent': 'curl/7.64.1'
    }
  });
  if (!fileRes.ok) throw new Error(`Media download HTTP ${fileRes.status}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    base64Data: Buffer.from(arrayBuffer).toString('base64'),
    mimeType: metaData.mime_type || fileRes.headers.get('content-type') || 'image/jpeg'
  };
}

// Ranked Model Cascade: smartest first -> resilient fallbacks (Verified from Google API)
const MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest'
];

// 3. Call Gemini AI with Automatic Smart Fallback
async function callGemini(contents) {
  let lastError = null;

  for (const model of MODEL_CASCADE) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        })
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.warn(`[Gemini Cascade] ${model} returned ${res.status}, trying next model...`);
        lastError = new Error(`Gemini ${model} Error ${res.status}: ${errBody}`);
        continue;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      console.log(`[Gemini Success (${model})]:`, text);
      return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
    } catch (err) {
      console.warn(`[Gemini Cascade] Failed on ${model}: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

// Users persistence: maps phone to { step, name, sheetId, plannerTab, lastSeen, lastAnnouncedVersion }
const USERS_FILE = path.join(__dirname, 'users.json');
const CURRENT_APP_VERSION = '2.2.0'; // Updated with Assignment list, GCal sync, Calendar view, and Undo
const UPDATE_ANNOUNCEMENT = `📢 *PEMBARUAN RARITY v${CURRENT_APP_VERSION} Telah Rilis!* 🚀\n\n` +
  `Halo! Rarity baru saja diperbarui dengan fitur baru:\n` +
  `1️⃣ *Perintah !tugas* → Cek deadline tugas & assignment aktif.\n` +
  `2️⃣ *Google Calendar Link* → Simpan jadwal ke Google Calendar dalam 1 klik.\n` +
  `3️⃣ *Batalkan Entri (!batal / !undo)* → Batalkan catatan transaksi atau pengingat yang salah.\n` +
  `4️⃣ *Kalender Interaktif di Web* → https://erc.my.id/tools/rarity\n\n` +
  `⚠️ *PENTING:* Jika bot tidak bisa menulis ke Google Sheet Anda, pastikan buka Settings (⚙️) di web lalu klik *"Beri Izin Bot WhatsApp"*, atau kirim ulang Sheet ID Anda ke sini:\n` +
  `\`!sheet [ID_GOOGLE_SHEET]\``;

let users = {};
try {
  if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
} catch (e) { users = {}; }

// Load persisted users from central Google Sheet via Apps Script on boot
async function syncUsersFromCloud() {
  if (!CONFIG.APPS_SCRIPT_URL) return;
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getUsers' })
    });
    const data = await res.json();
    if (data.success && data.users) {
      users = { ...data.users, ...users };
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
      console.log('[Users] Synced', Object.keys(users).length, 'users from Cloud Sheet');
    }
  } catch (e) {}
}
syncUsersFromCloud();

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  // Backup user registry to cloud sheet asynchronously so it survives Render restarts
  if (CONFIG.APPS_SCRIPT_URL) {
    fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveUsers', users })
    }).catch(() => {});
  }
}

function getUser(phone) {
  if (!users[phone]) {
    users[phone] = {
      step: 'GREETING',
      name: '',
      sheetId: '',
      currency: 'IDR',
      plannerTab: CONFIG.PLANNER_TAB || 'Budget',
      lastAnnouncedVersion: CURRENT_APP_VERSION,
      createdAt: new Date().toISOString()
    };
    saveUsers();
  }
  users[phone].lastSeen = new Date().toISOString();
  return users[phone];
}

// 4. Append Expense via Apps Script Webhook
async function appendExpenseToSheet(exp, targetSheetId, targetTab) {
  const sheetId = targetSheetId || CONFIG.SPREADSHEET_ID;
  const tab = targetTab || CONFIG.PLANNER_TAB;
  const scriptUrl = CONFIG.APPS_SCRIPT_URL;

  if (!scriptUrl) {
    console.warn('[Sheet] APPS_SCRIPT_URL not configured');
    return { success: false, reason: 'No Apps Script URL' };
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'appendExpense',
        sheetId,
        tab,
        type: exp.type || 'expense',
        date: exp.date || new Date().toISOString().split('T')[0],
        merchant: exp.merchant || 'Umum',
        category: exp.category || 'Lainnya',
        amount: exp.amount || 0,
        notes: exp.notes || ''
      })
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, reason: 'Izin Google Sheet belum dibuka (buka akses "Siapa saja dengan link dapat mengedit")' };
    }
  } catch (err) {
    console.error('[AppsScript Error]:', err.message);
    return { success: false, reason: err.message };
  }
}

// 5. Append Reminder via Apps Script Webhook
async function appendReminderToSheet(rem, targetSheetId) {
  const sheetId = targetSheetId || CONFIG.SPREADSHEET_ID;
  const scriptUrl = CONFIG.APPS_SCRIPT_URL;
  if (!scriptUrl) return;

  try {
    const dt = new Date(rem.timestamp);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    const dateTimeFormatted = `${y}-${m}-${d} ${hh}:${mm}`;

    await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'appendReminder',
        sheetId,
        datetime: dateTimeFormatted,
        name: rem.name,
        category: rem.category,
        notes: `Jam: ${hh}:${mm}${rem.notes ? ' • ' + rem.notes : ''}`
      })
    });
  } catch (err) {
    console.error('[AppsScript Reminder Error]:', err.message);
  }
}

// 6. Delete/Clear Expense row via Apps Script Webhook
async function deleteExpenseFromSheet(row, targetSheetId, targetTab) {
  const sheetId = targetSheetId || CONFIG.SPREADSHEET_ID;
  const tab = targetTab || CONFIG.PLANNER_TAB;
  const scriptUrl = CONFIG.APPS_SCRIPT_URL;
  if (!scriptUrl || !row) return { success: false };

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'deleteExpense',
        sheetId,
        tab,
        row
      })
    });
    return await res.json();
  } catch (err) {
    console.error('[AppsScript Delete Error]:', err.message);
    return { success: false, reason: err.message };
  }
}

// Helper: Generate Google Calendar Web Intent Link
function makeGCalLink(title, timestampMs, notes = '') {
  try {
    const start = new Date(timestampMs);
    const end = new Date(timestampMs + 3600000); // 1 hour event
    const toGCalISO = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dates = `${toGCalISO(start)}/${toGCalISO(end)}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates}&details=${encodeURIComponent(notes)}`;
  } catch {
    return '';
  }
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

        // Check if user hasn't received current app version announcement
        if (user.step === 'READY' && user.lastAnnouncedVersion !== CURRENT_APP_VERSION) {
          user.lastAnnouncedVersion = CURRENT_APP_VERSION;
          saveUsers();
          await sendWhatsAppMessage(from, UPDATE_ANNOUNCEMENT);
        }

        // A. Image Receipt OCR
        if (msgType === 'image') {
          await sendWhatsAppMessage(from, '🔍 Membaca struk dengan AI...');
          try {
            const { base64Data, mimeType } = await downloadMedia(msg.image.id);
            const today = new Date().toISOString().split('T')[0];
            const catList = CONFIG.EXPENSE_CATEGORIES.join(', ');
            const prompt = `Analisis foto struk ini. Ekstrak data dan keluarkan HANYA format JSON murni:
{
  "date": "YYYY-MM-DD (tanggal struk atau ${today} jika tidak ada)",
  "merchant": "Nama Toko / Tempat",
  "amount": Total_bayar_dalam_angka_integer_tanpa_titik,
  "category": "Pilih salah satu: ${catList}",
  "notes": "Barang yang dibeli atau ringkasan"
}`;
            const parsed = await callGemini([{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]);
            console.log('[OCR Result]:', JSON.stringify(parsed));

            parsed.date = parsed.date || today;
            parsed.amount = parseInt(parsed.amount, 10) || 0;
            if (!CONFIG.EXPENSE_CATEGORIES.includes(parsed.category)) parsed.category = 'Lainnya';
            const sheetRes = await appendExpenseToSheet(parsed, user.sheetId, user.plannerTab);

            if (sheetRes.success && sheetRes.row) {
              user.lastEntry = {
                type: 'expense',
                row: sheetRes.row,
                sheetId: user.sheetId,
                tab: user.plannerTab,
                desc: `${parsed.merchant || 'Umum'} (${rupiah(parsed.amount, user.currency)})`
              };
              saveUsers();
            }

            let reply = `🧾 *HASIL STRUK BELANJA*\n📅 Tanggal: ${parsed.date}\n🏪 Toko: ${parsed.merchant || 'Umum'}\n💰 Total: ${rupiah(parsed.amount, user.currency)}\n🏷️ Kategori: ${parsed.category}\n`;
            if (parsed.notes) reply += `📝 Catatan: ${parsed.notes}\n`;
            reply += sheetRes.success ? `\n✅ *Tercatat di Sheet baris ${sheetRes.row}*\n_Ketik "!batal" jika salah mencatat._` : `\n⚠️ Status Sheet: ${sheetRes.reason}`;
            await sendWhatsAppMessage(from, reply);
          } catch (e) {
            console.error('[OCR Error]:', e.message);
            await sendWhatsAppMessage(from, `❌ Gagal memproses struk: ${e.message}`);
          }
          continue;
        }

        // B. Text Message
        if (msgType === 'text') {
          const text = msg.text.body.trim();

          // 1. Explicit Help / Info Commands
          // Help Command
          if (/^(!help|help|\/help|!rarity|info)/i.test(text)) {
            const reply = `👋 *Halo ${user.name || 'di Rarity'}!*\n\n` +
              `Saya asisten keuangan & pengingat WhatsApp terintegrasi Google Sheet.\n` +
              `🌐 *Web App:* https://erc.my.id/tools/rarity\n\n` +
              `📌 *Format & Syntax Chat:*\n` +
              `1️⃣ *Foto Struk Belanja*\n` +
              `   Kirim langsung foto struk/nota. AI membaca item, harga, tanggal, & toko otomatis.\n\n` +
              `2️⃣ *Catat Transaksi Finansial (4 Kategori):*\n` +
              `   • *Pengeluaran*: _Beli [item] [harga] [toko]_\n` +
              `     Contoh: *Beli nasi padang 20rb* atau *Beli bensin 50000 di Shell*\n` +
              `   • *Pemasukan*: _Dapat [item/gaji] [nominal]_\n` +
              `     Contoh: *Dapat gaji bulanan 5jt* atau *Dapat transferan 200rb*\n` +
              `   • *Tabungan*: _Nabung / investasi [nominal] ke [wadah]_\n` +
              `     Contoh: *Nabung 500rb di Bibit* atau *Simpan uang 1jt*\n` +
              `   • *Tagihan*: _Bayar tagihan [item] [nominal]_\n` +
              `     Contoh: *Bayar tagihan wifi 350rb* atau *Bayar listrik 200rb*\n\n` +
              `3️⃣ *Pengingat Agenda & Jadwal*\n` +
              `   • Buat: _Ingatkan [acara/tugas] [waktu]_\n` +
              `     Contoh: *Ingatkan meeting besok jam 2 siang* atau *Ingatkan deadline tugas web tgl 10 jam 23:59*\n` +
              `   • Cek jadwal lengkap: ketik *!jadwal*\n` +
              `   • Cek daftar tugas saja: ketik *!tugas*\n` +
              `   • Selesai: _selesai [nama agenda]_\n\n` +
              `⚙️ *Perintah Sistem:*\n` +
              `• *!tugas* → Lihat daftar tugas & assignment aktif\n` +
              `• *!jadwal* → Lihat seluruh daftar pengingat & agenda aktif\n` +
              `• *!batal* / *!undo* → Batalkan & hapus transaksi/agenda terakhir jika salah\n` +
              `• *!status* → Cek status profil, mata uang, & koneksi Sheet\n` +
              `• *!currency [IDR|AUD]* → Ganti format mata uang\n` +
              `• *!sheet [ID_SHEET]* → Sambungkan Google Sheet pribadi\n` +
              `• *!reset* → Ulangi proses pendaftaran profil`;
            await sendWhatsAppMessage(from, reply);
            continue;
          }

          // 2. Status Command
          if (/^!status/i.test(text)) {
            const sheetMsg = user.sheetId ? `✅ Terhubung ke ID: \`${user.sheetId}\`` : `⚠️ Belum terhubung. Kirim \`!sheet [ID_GOOGLE_SHEET]\``;
            const currMsg = user.currency || 'IDR';
            await sendWhatsAppMessage(from, `👤 *Profil User:*\nNama: ${user.name || 'Belum diatur'}\nMata Uang: *${currMsg}*\nSheet: ${sheetMsg}\n\n_Ganti mata uang: ketik "!currency AUD" atau "!currency IDR"_`);
            continue;
          }

          // 2b. Schedule / Reminders Command
          if (/^(!jadwal|!reminders|!agenda|jadwal|agenda)/i.test(text)) {
            const activeReminders = reminders.filter(r => !r.done && (r.phone === from));
            if (activeReminders.length === 0) {
              await sendWhatsAppMessage(from, `📅 *Jadwal & Agenda Aktif:*\nTidak ada agenda aktif saat ini.\n\n_Buat pengingat baru: "Ingatkan [agenda] [waktu]"_`);
            } else {
              const nowMs = Date.now();
              let msg = `📅 *Jadwal & Agenda Aktif (${activeReminders.length}):*\n\n`;
              activeReminders.sort((a, b) => a.timestamp - b.timestamp).forEach((r, idx) => {
                const dt = new Date(r.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                const diffMs = r.timestamp - nowMs;
                let eta = '';
                if (diffMs > 0) {
                  const hours = Math.floor(diffMs / 3600000);
                  const mins = Math.floor((diffMs % 3600000) / 60000);
                  eta = hours > 0 ? `(dalam ${hours}j ${mins}m)` : `(dalam ${mins}m)`;
                } else {
                  eta = `(sudah lewat)`;
                }
                msg += `${idx + 1}. *${r.name}* [${r.category}]\n   🗓️ ${dt} ${eta}\n`;
              });
              msg += `\n_Ketik "selesai [nama]" untuk menandai beres._`;
              await sendWhatsAppMessage(from, msg);
            }
            continue;
          }

          // 2c. Assignment List Command (!tugas / !assignments)
          if (/^(!tugas|!assignments?|!pr|tugas)/i.test(text)) {
            const activeTasks = reminders.filter(r => !r.done && (r.phone === from) && (r.category === 'Tugas' || /tugas|pr|assignment|proyek/i.test(r.name)));
            if (activeTasks.length === 0) {
              await sendWhatsAppMessage(from, `📚 *Daftar Tugas & Assignment:*\nTidak ada tugas yang sedang aktif! 🎉\n\n_Catat tugas baru: "Ingatkan tugas kalkulus besok jam 23:59"_`);
            } else {
              const nowMs = Date.now();
              let msg = `📚 *Daftar Tugas & Assignment (${activeTasks.length}):*\n\n`;
              activeTasks.sort((a, b) => a.timestamp - b.timestamp).forEach((r, idx) => {
                const dt = new Date(r.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                const diffMs = r.timestamp - nowMs;
                let eta = '';
                if (diffMs > 0) {
                  const hours = Math.floor(diffMs / 3600000);
                  const mins = Math.floor((diffMs % 3600000) / 60000);
                  eta = hours > 0 ? `⏳ *${hours}j ${mins}m lagi*` : `⏳ *${mins}m lagi*`;
                } else {
                  eta = `⚠️ *Sudah lewat deadline!*`;
                }
                msg += `${idx + 1}. *${r.name}*\n   🗓️ Deadline: ${dt} — ${eta}\n`;
                if (r.notes) msg += `   📝 ${r.notes}\n`;
              });
              msg += `\n_Ketik "selesai [nama tugas]" jika sudah dikumpulkan!_`;
              await sendWhatsAppMessage(from, msg);
            }
            continue;
          }

          // 2d. Undo / Delete Previous Entry Command (!batal / !undo / !hapus)
          if (/^(!batal|!undo|!hapus|batalkan|hapus terakhir)/i.test(text)) {
            if (!user.lastEntry) {
              await sendWhatsAppMessage(from, '⚠️ Tidak ada transaksi atau agenda terakhir yang bisa dibatalkan.');
            } else {
              const last = user.lastEntry;
              user.lastEntry = null;
              saveUsers();

              if (last.type === 'expense') {
                const delRes = await deleteExpenseFromSheet(last.row, last.sheetId, last.tab);
                await sendWhatsAppMessage(from, `🗑️ *Transaksi Dibatalkan!*\nBaris ${last.row} (${last.desc}) telah dihapus dari Google Sheet.`);
              } else if (last.type === 'reminder') {
                const remIdx = reminders.findIndex(r => r.id === last.id);
                if (remIdx !== -1) {
                  const deletedName = reminders[remIdx].name;
                  reminders.splice(remIdx, 1);
                  saveReminders();
                  await sendWhatsAppMessage(from, `🗑️ *Pengingat Dibatalkan!*\nAgenda *${deletedName}* telah dihapus.`);
                } else {
                  await sendWhatsAppMessage(from, `🗑️ Pengingat sebelumnya telah dibatalkan.`);
                }
              }
            }
            continue;
          }

          // Currency Command
          if (/^!currency\s*/i.test(text)) {
            const arg = text.replace(/^!currency\s*/i, '').trim().toUpperCase();
            if (arg === 'AUD' || arg === 'IDR') {
              user.currency = arg;
              saveUsers();
              await sendWhatsAppMessage(from, `✅ Mata uang berhasil diubah ke *${arg}*!`);
            } else {
              await sendWhatsAppMessage(from, 'Pilihan mata uang: *!currency IDR* atau *!currency AUD*');
            }
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
              await sendWhatsAppMessage(from, `✅ Google Sheet ID berhasil disimpan:\n\`${extracted}\`\n\nSekarang Anda siap mencatat transaksi & agenda!`);
            } else {
              await sendWhatsAppMessage(from, 'Format Sheet ID tidak valid. Contoh: `!sheet 1le2VC_ASrU1YVebKmuJUyLivPfvKA3kLW5KUUjKSrN4`');
            }
            continue;
          }

          // 4. ONBOARDING STEP: GREETING (Respond normally first, then ask for name)
          if (user.step === 'GREETING') {
            user.step = 'ASK_NAME';
            saveUsers();
            const greetingMsg = `Halo! 👋 Aku *RARITY*, asisten budgeting dan agenda kamu yang terhubung langsung dengan Google Sheets (https://erc.my.id/tools/rarity).\n\nSebelum kita mulai, *siapa nama panggilan Anda?*`;
            await sendWhatsAppMessage(from, greetingMsg);
            continue;
          }

          // 5. ONBOARDING STEP: ASK_NAME
          if (user.step === 'ASK_NAME') {
            user.name = text.trim();
            user.step = 'ASK_SHEET';
            saveUsers();
            const welcome = `Salam kenal, *${user.name}*! 👋\n\n` +
              `🌟 *Langkah 2 dari 2: Hubungkan Google Sheet Anda*\n` +
              `Demi privasi dan keamanan data Anda, Rarity mewajibkan setiap pengguna menghubungkan Google Sheet pribadinya.\n\n` +
              `Cara mudah:\n` +
              `1️⃣ Buka https://erc.my.id/tools/rarity\n` +
              `2️⃣ Buka menu *Settings* (⚙️) lalu buat/salin Sheet ID Anda.\n` +
              `3️⃣ Tempelkan Sheet ID atau link Google Sheet Anda ke sini!\n\n` +
              `Contoh kirim:\n\`1le2VC_ASrU1YVebKmuJUyLivPfvKA3kLW5KUUjKSrN4\``;
            await sendWhatsAppMessage(from, welcome);
            continue;
          }

          // 5. ONBOARDING STEP: ASK_SHEET (Strict: No default fallback allowed)
          if (user.step === 'ASK_SHEET') {
            const extracted = text.match(/[-\w]{25,}/)?.[0];
            if (extracted) {
              user.sheetId = extracted;
              user.step = 'READY';
              saveUsers();
              await sendWhatsAppMessage(from, `🎉 Mantap *${user.name}*! Google Sheet pribadi terhubung:\n\`${extracted}\`\n\nDashboard: https://erc.my.id/tools/rarity\n\n💡 Ketik *!help* sekarang untuk melihat seluruh format chat & contoh penggunaan.`);
            } else {
              await sendWhatsAppMessage(from, `⚠️ Google Sheet ID wajib dihubungkan terlebih dahulu sebelum memakai Rarity.\n\nBuka https://erc.my.id/tools/rarity lalu salin Sheet ID dari menu Settings (⚙️) dan tempel di sini.\n\n_Atau ketik "!sheet [ID_GOOGLE_SHEET]"_`);
            }
            continue;
          }

          // STRICT SHEET GATE: User must have valid sheetId to log data or reminders
          if (!user.sheetId || user.step !== 'READY') {
            await sendWhatsAppMessage(from, `⚠️ *Google Sheet Belum Terhubung*\n\nAnda belum menyambungkan Google Sheet pribadi.\n1. Buka https://erc.my.id/tools/rarity\n2. Salin Sheet ID dari Settings (⚙️)\n3. Kirim ke chat ini:\n\`!sheet [ID_GOOGLE_SHEET]\``);
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

          // 7. Natural Language Classification (Strict with 4 financial types + reminders + chat)
          const now = new Date();
          const wibStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }); // "YYYY-MM-DD HH:mm:ss"
          const [todayISO, timeStrFull] = wibStr.split(' ');
          const timeStr = timeStrFull.slice(0, 5);

          const prompt = `You are RARITY — personal budgeting and agenda assistant for Ercavians, integrated with Google Sheets and https://erc.my.id/tools/rarity.
User message: "${text}". Current time (WIB UTC+7): ${todayISO} ${timeStr}. User name: "${user.name || 'Ercavian'}".

Classify user message into one of these types:
1. Reminder/event/task/agenda with a target time:
   {"type":"reminder","name":"string","datetime":"YYYY-MM-DD HH:mm","category":"${CONFIG.TRACKER_CATEGORIES.join('/')}","notes":"string"}
2. Financial transaction (expenses, income, savings, bills):
   - Pengeluaran / Expense (spending, buying items, meals, shopping):
     {"type":"pengeluaran","date":"YYYY-MM-DD","merchant":"string","amount":integer_numeric,"category":"${CONFIG.EXPENSE_CATEGORIES.join('/')}","notes":"string"}
   - Pemasukan / Income (salary, transfer in, pocket money, bonus):
     {"type":"pemasukan","date":"YYYY-MM-DD","merchant":"string","amount":integer_numeric,"category":"Pemasukan","notes":"string"}
   - Tabungan / Savings (saving money, investing, deposit, bibit/reksadana):
     {"type":"tabungan","date":"YYYY-MM-DD","merchant":"string","amount":integer_numeric,"category":"Tabungan & Investasi","notes":"string"}
   - Tagihan / Bills (recurring bills, wifi, listrik, rent, subscription):
     {"type":"tagihan","date":"YYYY-MM-DD","merchant":"string","amount":integer_numeric,"category":"Tagihan","notes":"string"}
3. Greeting, questions about website/sheet, or general chat:
   {"type":"chat","reply":"short friendly Indonesian reply as RARITY (mention erc.my.id/tools/rarity or !help if relevant)"}
Output JSON only.`;

          try {
            const parsed = await callGemini([{ parts: [{ text: prompt }] }]);
            
            if (parsed.type === 'reminder' && parsed.datetime) {
              const cleanedDt = parsed.datetime.trim().replace(' ', 'T');
              const targetTime = new Date(`${cleanedDt}:00+07:00`).getTime();
              if (isNaN(targetTime)) {
                await sendWhatsAppMessage(from, 'Format waktu belum jelas. Contoh: *Ingatkan ujian kalkulus besok jam 08:00* atau *Ingatkan meeting 30 menit lagi*');
                continue;
              }
              const nowMs = Date.now();
              // Pre-mark all intervals that already elapsed at creation time
              const passedIntervals = INTERVALS.filter(inv => (targetTime - nowMs) < inv.ms).map(inv => inv.label);

              const newRem = {
                id: Date.now(),
                phone: from,
                name: parsed.name || 'Agenda',
                timestamp: targetTime,
                category: parsed.category || 'Lainnya',
                notes: parsed.notes || '',
                done: (targetTime - nowMs) < -60000, // already done if over 1 min ago
                triggered: passedIntervals
              };
              reminders.push(newRem);
              saveReminders();
              appendReminderToSheet(newRem, user.sheetId);

              // Record last entry for undo
              user.lastEntry = {
                type: 'reminder',
                id: newRem.id,
                desc: newRem.name
              };
              saveUsers();

              const gcalUrl = makeGCalLink(newRem.name, targetTime, newRem.notes || newRem.category);
              const formattedDT = new Date(targetTime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
              let reply = `⏰ *PENGINGAT TERSIMPAN*\n📌 *${newRem.name}* [${newRem.category}]\n🗓️ Waktu: *${formattedDT}*\n🔔 Pengingat aktif bertahap.\n\n📅 *Tambah ke Google Calendar:*\n${gcalUrl}\n\n_Ketik "!batal" jika salah atau "selesai ${newRem.name}" jika sudah beres._`;
              await sendWhatsAppMessage(from, reply);
            } else if (['pengeluaran', 'expense', 'pemasukan', 'tabungan', 'tagihan'].includes(parsed.type) && parsed.amount) {
              let headerTitle = '💸 *CATATAN PENGELUARAN*';
              let emojiPrefix = '🏷️';
              if (parsed.type === 'pemasukan') {
                headerTitle = '💰 *CATATAN PEMASUKAN*';
                emojiPrefix = '💵';
                if (!parsed.category || parsed.category === 'Lainnya') parsed.category = 'Pemasukan';
              } else if (parsed.type === 'tabungan') {
                headerTitle = '🏦 *CATATAN TABUNGAN & INVESTASI*';
                emojiPrefix = '📈';
                if (!parsed.category || parsed.category === 'Lainnya') parsed.category = 'Tabungan & Investasi';
              } else if (parsed.type === 'tagihan') {
                headerTitle = '🧾 *CATATAN TAGIHAN*';
                emojiPrefix = '📑';
                if (!parsed.category || parsed.category === 'Lainnya') parsed.category = 'Tagihan';
              } else {
                if (!CONFIG.EXPENSE_CATEGORIES.includes(parsed.category)) parsed.category = 'Lainnya';
              }

              const sheetRes = await appendExpenseToSheet(parsed, user.sheetId, user.plannerTab);
              if (sheetRes.success && sheetRes.row) {
                user.lastEntry = {
                  type: 'expense',
                  row: sheetRes.row,
                  sheetId: user.sheetId,
                  tab: user.plannerTab,
                  desc: `${parsed.merchant || 'Umum'} (${rupiah(parsed.amount, user.currency)})`
                };
                saveUsers();
              }

              let reply = `${headerTitle}\n🏢 Sumber/Toko: ${parsed.merchant || 'Umum'}\n💵 Jumlah: ${rupiah(parsed.amount, user.currency)}\n${emojiPrefix} Kategori: ${parsed.category}\n`;
              reply += sheetRes.success ? `✅ *Tercatat di Sheet baris ${sheetRes.row}*\n_Ketik "!batal" jika salah mencatat._` : `⚠️ Status Sheet: ${sheetRes.reason}`;
              await sendWhatsAppMessage(from, reply);
            } else {
              // Casual chit-chat or unrecognized
              const reply = parsed.reply || `Halo ${user.name || 'Ercavian'}! Aku RARITY, asisten budgeting & agenda kamu. Buka web di https://erc.my.id/tools/rarity atau ketik *!help* untuk panduan lengkap ya!`;
              await sendWhatsAppMessage(from, reply);
            }
          } catch (e) {
            console.error('[Gemini / Parse Error]:', e.message);
            await sendWhatsAppMessage(from, 'Format belum terbaca. Kirim transaksi belanja, pemasukan, tabungan, foto struk, atau ketik *!help* untuk bantuan.');
          }
        }
      }
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => res.send('OK'));

// Web Integration API: check onboarded users list (Protected & Obfuscated)
app.get('/api/users', (req, res) => {
  const token = req.query.key || req.headers['x-admin-key'];
  if (token !== CONFIG.ADMIN_SECRET) {
    return res.status(404).send('Not found');
  }

  res.header('Access-Control-Allow-Origin', '*');
  const safeUsers = {};
  for (const [phone, u] of Object.entries(users)) {
    // Mask phone e.g. 6282163556632 -> 62821****6632
    const maskedPhone = phone.length > 8 ? phone.slice(0, 5) + '****' + phone.slice(-4) : '****';
    // Mask Sheet ID e.g. 1p8b... -> 1p8b****_TEo
    const maskedSheet = u.sheetId && u.sheetId.length > 8 ? u.sheetId.slice(0, 4) + '****' + u.sheetId.slice(-4) : (u.sheetId ? 'Set' : 'None');
    safeUsers[maskedPhone] = {
      name: u.name || 'Anonymous',
      step: u.step,
      sheetConnected: !!u.sheetId,
      sheetId: maskedSheet,
      lastSeen: u.lastSeen
    };
  }
  res.json({ success: true, count: Object.keys(users).length, users: safeUsers });
});

app.listen(PORT, () => console.log(`WhatsApp Cloud API Webhook Server listening on port ${PORT}`));

// Background 5-Stage Reminder Schedule
setInterval(async () => {
  const now = Date.now();
  let changed = false;

  for (const rem of reminders) {
    if (rem.done) continue;
    const diff = rem.timestamp - now;

    // If past due by more than 5 minutes, auto-mark done so it doesn't spam
    if (diff < -5 * 60 * 1000) {
      rem.done = true;
      changed = true;
      continue;
    }

    rem.triggered = rem.triggered || [];

    for (const inv of INTERVALS) {
      // Only fire if currently inside the trigger window [ms - 60s, ms]
      if (diff <= inv.ms && diff > (inv.ms - 60000) && !rem.triggered.includes(inv.label)) {
        rem.triggered.push(inv.label);
        changed = true;
        try {
          const formattedDT = new Date(rem.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
          const msg = `🔔 *PENGINGAT!*\n📌 *${rem.name}* [${rem.category}]\n⏳ *${inv.label}*\n🗓️ Jadwal: ${formattedDT} WIB\n\n_Ketik "selesai ${rem.name}" jika sudah beres._`;
          await sendWhatsAppMessage(rem.phone, msg);
        } catch (err) {
          console.error('Failed to dispatch Cloud API reminder:', err.message);
        }
      }
    }
  }
  if (changed) saveReminders();
}, 30000);
