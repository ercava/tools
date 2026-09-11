/*
  PEGASUS Support — Admin Queue
  Simple queue management: Name, Number, Status (waiting / ongoing / finished).
  Data lives in Firestore collection "queue".
*/

const ADMIN_USERNAME = "quickwork";
const ADMIN_PASSWORD = atob("UEVHQVNVUzAwODM0NTQ2NA=="); // PEGASUS008345464

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
const FieldValue = firebase.firestore.FieldValue;

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

function shakeError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.display = 'none';
    el.classList.remove('shake');
  }, 3000);
}

// ---- Login ----
$('admin-login-btn').addEventListener('click', login);
$('admin-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('admin-user').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('admin-pass').focus(); });

function login() {
  const user = $('admin-user').value.trim();
  const pass = $('admin-pass').value;
  if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
    showScreen('admin-screen');
    startListener();
  } else {
    shakeError($('login-error'), 'Username atau password salah.');
  }
}

$('logout-btn').addEventListener('click', () => {
  if (unsub) { unsub(); unsub = null; }
  $('admin-user').value = '';
  $('admin-pass').value = '';
  showScreen('login-screen');
});

// ---- Firestore ----
let entries = [];
let unsub = null;

function startListener() {
  if (unsub) return;
  unsub = db.collection('queue').orderBy('number', 'asc').onSnapshot((snap) => {
    entries = [];
    snap.forEach((doc) => entries.push({ id: doc.id, ...doc.data() }));
    renderList();
    renderStats();
  }, (err) => {
    console.error(err);
    $('queue-list').innerHTML = '<div class="empty-state">Gagal memuat data. Cek Firestore rules / koneksi.</div>';
  });
}

function renderStats() {
  $('st-waiting').textContent = entries.filter((e) => e.status === 'waiting').length;
  $('st-ongoing').textContent = entries.filter((e) => e.status === 'ongoing').length;
  $('st-finished').textContent = entries.filter((e) => e.status === 'finished').length;
  if (!$('new-number').value) $('new-number').value = nextNumber();
}

function renderList() {
  const container = $('queue-list');
  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-state">Antrian kosong. Tambahkan antrian pertama di atas.</div>';
    return;
  }
  const sorted = entries.slice().sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  container.innerHTML = sorted.map((e) => `
    <div class="q-item">
      <span class="num">${Number(e.number)}</span>
      <div class="who">
        <div class="nm">${esc(e.name)}</div>
        <div class="ts">${statusTime(e)}</div>
      </div>
      <span class="badge q-${e.status}">${STATUS_LABEL[e.status] || e.status}</span>
      <select data-status="${e.id}">
        <option value="waiting" ${e.status === 'waiting' ? 'selected' : ''}>Menunggu</option>
        <option value="ongoing" ${e.status === 'ongoing' ? 'selected' : ''}>Sedang Dilayani</option>
        <option value="finished" ${e.status === 'finished' ? 'selected' : ''}>Selesai</option>
      </select>
      <button class="icon-btn" data-edit="${e.id}">Edit</button>
      <button class="icon-btn danger" data-del="${e.id}">Hapus</button>
    </div>`).join('');

  container.querySelectorAll('[data-status]').forEach((sel) => {
    sel.addEventListener('change', () => {
      db.collection('queue').doc(sel.dataset.status).update({
        status: sel.value,
        updatedAt: FieldValue.serverTimestamp()
      }).then(() => toast(`Status → ${STATUS_LABEL[sel.value]}`));
    });
  });

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEdit(entries.find((t) => t.id === btn.dataset.edit)));
  });

  container.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const e = entries.find((t) => t.id === btn.dataset.del);
      if (!e) return;
      if (!confirm(`Hapus antrian nomor ${e.number} (${e.name})?`)) return;
      db.collection('queue').doc(e.id).delete().then(() => toast('Antrian dihapus.'));
    });
  });
}

function statusTime(e) {
  const ts = e.updatedAt || e.createdAt;
  if (!ts) return '';
  let d = ts;
  if (typeof ts.toDate === 'function') d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---- Add ----
function nextNumber() {
  const nums = entries.map((e) => Number(e.number) || 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

$('new-number').value = nextNumber();

$('add-btn').addEventListener('click', addEntry);
$('new-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addEntry(); });

function addEntry() {
  const name = $('new-name').value.trim();
  const number = parseInt($('new-number').value, 10);
  if (!name || isNaN(number)) {
    shakeError($('add-error'), 'Isi nama dan nomor antrian.');
    return;
  }
  $('add-btn').disabled = true;
  db.collection('queue').add({
    name,
    nameLower: normalize(name),
    number,
    status: 'waiting',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }).then(() => {
    $('new-name').value = '';
    $('new-number').value = nextNumber();
    toast('Antrian ditambahkan.');
  }).catch((err) => {
    console.error(err);
    shakeError($('add-error'), 'Gagal menambah antrian: ' + (err.message || ''));
  }).finally(() => {
    $('add-btn').disabled = false;
  });
}

// ---- Edit modal ----
let editingId = null;

function openEdit(e) {
  if (!e) return;
  editingId = e.id;
  $('edit-name').value = e.name || '';
  $('edit-number').value = e.number != null ? e.number : '';
  $('edit-status').value = e.status || 'waiting';
  $('edit-modal').style.display = 'flex';
}

$('edit-close').addEventListener('click', () => { $('edit-modal').style.display = 'none'; editingId = null; });
$('edit-modal').addEventListener('click', (ev) => { if (ev.target === $('edit-modal')) { $('edit-modal').style.display = 'none'; editingId = null; } });

$('edit-save').addEventListener('click', () => {
  if (!editingId) return;
  const name = $('edit-name').value.trim();
  const number = parseInt($('edit-number').value, 10);
  const status = $('edit-status').value;
  if (!name || isNaN(number)) {
    shakeError($('add-error'), 'Isi nama dan nomor antrian.');
    return;
  }
  db.collection('queue').doc(editingId).update({
    name,
    nameLower: normalize(name),
    number,
    status,
    updatedAt: FieldValue.serverTimestamp()
  }).then(() => {
    toast('Antrian diperbarui.');
    $('edit-modal').style.display = 'none';
    editingId = null;
  }).catch((err) => {
    console.error(err);
  });
});

// ---- Boot ----
setTimeout(() => showScreen('login-screen'), 1000);