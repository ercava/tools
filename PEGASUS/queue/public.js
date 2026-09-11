/*
  PEGASUS Support — Public Queue
  Reads Firestore collection "queue" and renders the live board.

  Queue payment (QRIS Rp20.000 = 20 ribu) reuses the method from the cekai7
  project: decode the static QRIS in qris.jpeg, inject the amount tag (54)
  to build a dynamic QRIS, then render it with qrcode-generator.

  Firestore rules (Firestore > Rules):
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /queue/{entry} {
          allow read, write: if true;
        }
      }
    }
*/

const WA_NUMBER = "628216356632";
const PAY_AMOUNT = 20000; // Rp20.000 (20 ribu)

const firebaseConfig = {
  apiKey: "AIzaSyDWQzXQfCXWhNQ6zCoEIhRj689-xLAgslA",
  authDomain: "first-ones-105e2.firebaseapp.com",
  projectId: "first-ones-105e2",
  storageBucket: "first-ones-105e2.firebasestorage.app",
  messagingSenderId: "139579434966",
  appId: "1:139579434966:web:e44d7a92e450243bc32677",
  measurementId: "G-5SP090GHKE"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---- Helpers ----
const $ = (id) => document.getElementById(id);

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const STATUS_LABEL = { waiting: 'Menunggu', ongoing: 'Sedang Dilayani', finished: 'Selesai' };
const STATUS_DOT = { waiting: '●', ongoing: '●', finished: '●' };

function statusBadge(status) {
  return `<span class="badge q-${status}">${STATUS_DOT[status] || ''} ${STATUS_LABEL[status] || status}</span>`;
}

function fmtRP(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
  }).format(n);
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ---- QRIS (method from cekai7 / App.tsx) ----
const crc16 = (str) => {
  let crc = 0xFFFF;
  const strlen = str.length;
  for (let c = 0; c < strlen; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

const generateDynamicQris = (staticQris, amount) => {
  if (staticQris.length < 4) throw new Error('Invalid static QRIS data.');
  const qrisWithoutCrc = staticQris.substring(0, staticQris.length - 4);
  const step1 = qrisWithoutCrc.replace('010211', '010212');
  const parts = step1.split('5802ID');
  if (parts.length !== 2) throw new Error("QRIS data is not in the expected format (missing '5802ID').");
  const amountStr = String(parseInt(amount, 10));
  const amountTag = '54' + String(amountStr.length).padStart(2, '0') + amountStr;
  const payload = [parts[0], amountTag, '5802ID', parts[1]].join('');
  return payload + crc16(payload);
};

let staticQris = null;
function loadStaticQris() {
  const img = new Image();
  img.src = 'qris.jpeg';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          staticQris = code.data;
        } else {
          console.error('Could not find QR code in qris.jpeg image.');
        }
      }
    } catch (err) {
      console.error('Error decoding QRIS:', err);
    }
  };
  img.onerror = () => console.error('Failed to load qris.jpeg image.');
}

function renderQris() {
  const box = $('qr-box');
  if (!staticQris) {
    box.innerHTML = '<div class="qr-placeholder">QRIS tidak dapat dimuat. Hubungi admin via WhatsApp.</div>';
    return;
  }
  try {
    const qrString = generateDynamicQris(staticQris, String(PAY_AMOUNT));
    box.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(qrString);
    qr.make();
    box.innerHTML = qr.createImgTag(8, 4);
    const img = box.querySelector('img');
    if (img) {
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.imageRendering = 'pixelated';
    }
  } catch (err) {
    console.error('Failed to render QR Code:', err);
    box.innerHTML = '<div class="qr-placeholder">QRIS tidak dapat dibuat. Hubungi admin via WhatsApp.</div>';
  }
}

// ---- Queue data ----
let entries = [];

db.collection('queue').orderBy('number', 'asc').onSnapshot((snap) => {
  entries = [];
  snap.forEach((doc) => entries.push({ id: doc.id, ...doc.data() }));
  renderBoard();
}, (err) => {
  console.error(err);
  $('now-serving-number').textContent = '—';
  toast('Gagal memuat antrian. Cek koneksi / Firestore.');
});

function renderBoard() {
  const ongoing = entries.filter((e) => e.status === 'ongoing').sort((a, b) => a.number - b.number)[0];
  const waiting = entries.filter((e) => e.status === 'waiting').sort((a, b) => a.number - b.number);

  $('now-serving-number').textContent = ongoing ? ongoing.number : '—';
  $('now-serving-name').textContent = ongoing ? esc(ongoing.name) : 'Tidak ada yang dilayani saat ini';

  const chips = $('waiting-chips');
  chips.innerHTML = waiting.slice(0, 12).map((e) =>
    `<span class="waiting-chip">${Number(e.number)}</span>`
  ).join('');
  if (waiting.length > 12) {
    chips.innerHTML += `<span class="waiting-more">+${waiting.length - 12} lagi</span>`;
  }
  if (waiting.length === 0 && ongoing) {
    chips.innerHTML = '<span class="waiting-more">Tidak ada yang menunggu</span>';
  }
}

// ---- Lookup ----
$('lookup-btn').addEventListener('click', lookup);
$('lookup-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(); });

function lookup() {
  const input = normalize($('lookup-name').value);
  const errEl = $('lookup-error');
  if (!input) {
    errEl.textContent = 'Masukkan nama kamu dulu.';
    errEl.style.display = 'block';
    return;
  }

  const matches = entries
    .filter((e) => normalize(e.name) === input)
    .sort((a, b) => (b.createdAt ? (b.createdAt.seconds || 0) : 0) - (a.createdAt ? (a.createdAt.seconds || 0) : 0));

  if (matches.length === 0) {
    errEl.textContent = 'Nama tidak ditemukan dalam antrian. Cek ejaan atau hubungi admin via WhatsApp.';
    errEl.style.display = 'block';
    $('result-container').innerHTML = '';
    return;
  }

  errEl.style.display = 'none';
  const ent = matches[0];
  const latest = matches[0];
  renderResult(latest);
}

function renderResult(ent) {
  const finished = ent.status === 'finished';
  const container = $('result-container');

  const statusNote = finished
    ? 'Antrian kamu sudah selesai! Silakan lanjutkan ke pembayaran di bawah ini ya.'
    : ent.status === 'ongoing'
      ? 'Nomor kamu sedang dilayani sekarang. Mohon tunggu panggilan admin.'
      : 'Kamu masih dalam antrian. Mohon tunggu sampai nomormu dipanggil.';

  container.innerHTML = `
    <div class="card result-card">
      <p class="result-name">${esc(ent.name)}</p>
      <p class="result-number">Nomor Antrian <b>${Number(ent.number)}</b></p>
      <div style="display:flex; justify-content:center; margin-bottom:0.5rem;">${statusBadge(ent.status)}</div>
      <p class="status-note">${statusNote}</p>
      <a class="wa-btn" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Halo admin PEGASUS, saya mau tanya soal antrian saya. Nama: ' + ent.name + ', Nomor: ' + ent.number)}" target="_blank" rel="noopener">
        Tanya sesuatu? Chat WhatsApp
      </a>
    </div>
    ${finished ? `
      <div class="card payment-card" style="display:block;">
        <h3 style="text-align:center; border:none;">Pembayaran :)</h3>
        <p class="pay-amount" style="text-align:center;">${fmtRP(PAY_AMOUNT)}</p>
        <p class="pay-caption" style="text-align:center;">
          Scan QRIS di bawah untuk membayar layanan antrian kamu.<br>
          Bisa pakai GoPay, OVO, DANA, LinkAja, ShopeePay, atau aplikasi bank.
        </p>
        <div class="qr-box" id="qr-box"><div class="qr-placeholder">Menyiapkan QRIS...</div></div>
        <p class="pay-caption" style="text-align:center;">Setelah bayar, kirim bukti transfer ke admin ya!</p>
        <a class="wa-btn" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Halo admin PEGASUS, saya sudah bayar. Nama: ' + ent.name + ', Nomor: ' + ent.number)}" target="_blank" rel="noopener">
          Sudah bayar — Kirim bukti ke WhatsApp
        </a>
      </div>` : ''}
  `;

  if (finished) renderQris();
}

// ---- Boot ----
function init() {
  loadStaticQris();
  setTimeout(() => showScreen('main-screen'), 1000);
}
init();