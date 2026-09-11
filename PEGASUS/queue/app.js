/*
  PEGASUS Support - Working Queue

  Admin credential:
    Username : quickwork
    Password : PEGASUS008345464

  Firestore collection: "tickets"
  Document shape:
    {
      name, nameLower, subject, description,
      priority: 'low'|'normal'|'high'|'urgent',
      status: 'open'|'progress'|'resolved',
      notes, noteUpdatedAt, ticketNo,
      createdAt, updatedAt
    }

  Required Firestore security rules (Firestore > Rules):
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /tickets/{ticket} {
          allow read, write: if true;
        }
      }
    }

  Required composite index (the user "my tickets" query uses where('nameLower')
  + orderBy('createdAt')): first time a user logs in, the Firestore console shows
  an "index required" error link — click it to create the composite index.
  Collection: tickets | Fields: nameLower (asc) + createdAt (desc).
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

// ---- State ----
let activeStatus = 'all';
let ticketsCache = [];       // full admin list
let userTicketsCache = [];   // current user tickets
let editingId = null;
let currentUser = null;
let currentSession = 'login';
let dbReady = false;

// ---- DOM helpers ----
const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(ts) {
  if (!ts) return '—';
  let d = ts;
  if (typeof ts.toDate === 'function') d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function normalize(name) {
  return String(name || '').trim().toLowerCase();
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

function showLoginError(msg) {
  const el = $('login-error');
  el.textContent = msg;
  el.style.display = 'block';
  if (el.shakeTimer) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  clearTimeout(el.shakeTimer);
  el.shakeTimer = setTimeout(() => {
    el.style.display = 'none';
    el.classList.remove('shake');
    el.shakeTimer = null;
  }, 3000);
}

// ---- Screens ----
function openAdmin() {
  currentSession = 'admin';
  showScreen('admin-screen');
}

function openUser(name) {
  currentUser = name;
  $('user-name').textContent = name;
  showScreen('user-screen');
}

function logout() {
  currentSession = 'login';
  currentUser = null;
  editingId = null;
  activeStatus = 'all';
  ticketsCache = [];
  userTicketsCache = [];
  if (adminUnsub) { adminUnsub(); adminUnsub = null; }
  if (userUnsub) { userUnsub(); userUnsub = null; }
  $('admin-user-input').value = '';
  $('admin-pass-input').value = '';
  $('user-name-input').value = '';
  showScreen('login-screen');
}

// ---- Login bindings ----
document.querySelectorAll('.auth-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    $('user-login').style.display = mode === 'user' ? 'block' : 'none';
    $('admin-login').style.display = mode === 'admin' ? 'block' : 'none';
  });
});

$('user-login-btn').addEventListener('click', () => {
  const name = normalize($('user-name-input').value);
  if (!name) { showLoginError('Please enter your name.'); return; }
  openUser($('user-name-input').value.trim());
  startUserListener(name);
});

$('user-name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('user-login-btn').click();
});

$('admin-login-btn').addEventListener('click', () => {
  const user = $('admin-user-input').value.trim();
  const pass = $('admin-pass-input').value;
  if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
    $('admin-name').textContent = 'Admin';
    openAdmin();
    startAdminListener();
  } else {
    showLoginError('Wrong username or password.');
  }
});

$('admin-pass-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('admin-login-btn').click();
});

$('admin-logout-btn').addEventListener('click', logout);
$('user-logout-btn').addEventListener('click', logout);
$('back-to-site-btn').addEventListener('click', () => window.location.href = '../index.html');
$('back-to-site-btn-2').addEventListener('click', () => window.location.href = '../index.html');

// ---- Admin filters ----
document.querySelectorAll('#admin-filters .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#admin-filters .tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeStatus = btn.dataset.status;
    renderAdminList();
  });
});

$('admin-search').addEventListener('input', renderAdminList);

// ---- Firestore listeners ----
let adminUnsub = null;
let userUnsub = null;

function startAdminListener() {
  if (!dbReady) { toast('Firebase is not configured yet.'); return; }
  if (adminUnsub) return;
  adminUnsub = db.collection('tickets').orderBy('createdAt', 'desc')
    .onSnapshot((snap) => {
      ticketsCache = [];
      snap.forEach((doc) => ticketsCache.push({ id: doc.id, ...doc.data() }));
      renderAdminList();
    }, (err) => {
      console.error(err);
      $('admin-list').innerHTML = '<div class="empty-state">Cannot reach the database. Check Firestore rules / connection.</div>';
    });
}

function startUserListener(name) {
  userTicketsCache = [];
  if (userUnsub) { userUnsub(); userUnsub = null; }
  if (!dbReady) {
    $('user-list').innerHTML = '<div class="empty-state">Firebase is not configured yet.</div>';
    return;
  }
  renderUserList();
  userUnsub = db.collection('tickets')
    .where('nameLower', '==', normalize(name))
    .orderBy('createdAt', 'desc')
    .onSnapshot((snap) => {
      userTicketsCache = [];
      snap.forEach((doc) => userTicketsCache.push({ id: doc.id, ...doc.data() }));
      renderUserList();
    }, (err) => {
      console.error(err);
      $('user-list').innerHTML = '<div class="empty-state">Cannot reach the database right now.</div>';
    });
}

// ---- Admin rendering ----
const STATUS_LABEL = { open: 'Open', progress: 'In Progress', resolved: 'Resolved' };

function statusBadge(status) {
  return `<span class="badge status-${status}">● ${STATUS_LABEL[status] || status}</span>`;
}

function priorityBadge(p) {
  const label = p || 'normal';
  return `<span class="badge priority-${label}">${label}</span>`;
}

function renderAdminList() {
  let list = ticketsCache.slice();
  if (activeStatus !== 'all') {
    list = list.filter((t) => t.status === activeStatus);
  }
  const query = normalize($('admin-search').value);
  if (query) {
    list = list.filter((t) =>
      normalize(t.name).includes(query) ||
      normalize(t.subject).includes(query) ||
      normalize(t.ticketNo || '').includes(query)
    );
  }
  updateAdminStats();

  const container = $('admin-list');
  if (ticketsCache.length === 0) {
    container.innerHTML = '<div class="empty-state">Queue is empty. Add your first ticket boss! 🚀</div>';
    return;
  }
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No tickets match this filter.</div>';
    return;
  }

  container.innerHTML = list.map((t) => `
    <div class="ticket-card">
      <div class="ticket-head">
        <div style="min-width: 0;">
          <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.2rem;">
            <h3 class="ticket-title" style="margin: 0;">${esc(t.subject)}</h3>
            ${statusBadge(t.status)}
            ${priorityBadge(t.priority)}
          </div>
          <p class="ticket-subject" style="margin: 0;">${esc(t.name)}</p>
        </div>
        <span class="ticket-id">${esc(t.ticketNo || '—')}</span>
      </div>
      ${t.description ? `<p class="ticket-desc">${esc(t.description)}</p>` : ''}
      ${t.notes ? `
        <div class="ticket-note">
          <span class="note-label">Admin Note</span>
          ${esc(t.notes)}
          <div style="margin-top:0.35rem; font-size:0.72rem; color: var(--muted);">${fmtDate(t.noteUpdatedAt || t.updatedAt)}</div>
        </div>` : ''}
      <div class="ticket-meta">
        <span class="meta-item">Created: ${fmtDate(t.createdAt)}</span>
        <span class="meta-item">Updated: ${fmtDate(t.updatedAt)}</span>
      </div>
      <div class="ticket-actions">
        <div class="row-grow"></div>
        <select class="input-field status-select" data-status-select="${t.id}">
          <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="progress" ${t.status === 'progress' ? 'selected' : ''}>In Progress</option>
          <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
        </select>
        <button class="action-btn primary" data-edit="${t.id}">Edit</button>
        <button class="action-btn danger" data-delete="${t.id}">Delete</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('[data-status-select]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.statusSelect;
      const newStatus = sel.value;
      db.collection('tickets').doc(id).update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => toast(`Status updated to ${STATUS_LABEL[newStatus]}`));
    });
  });

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openTicketModal(ticketsCache.find((t) => t.id === btn.dataset.edit)));
  });

  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = ticketsCache.find((x) => x.id === btn.dataset.delete);
      if (!t) return;
      if (!confirm(`Delete ticket ${t.ticketNo || ''} for ${t.name}?`)) return;
      db.collection('tickets').doc(t.id).delete()
        .then(() => toast('Ticket deleted.'));
    });
  });
}

function updateAdminStats() {
  const c = (fn) => ticketsCache.filter(fn).length;
  $('stat-total').textContent = ticketsCache.length;
  $('stat-open').textContent = c((t) => t.status === 'open');
  $('stat-progress').textContent = c((t) => t.status === 'progress');
  $('stat-resolved').textContent = c((t) => t.status === 'resolved');
}

// ---- User rendering ----
function renderUserList() {
  const list = userTicketsCache;
  const c = (fn) => list.filter(fn).length;
  $('user-stat-total').textContent = list.length;
  $('user-stat-open').textContent = c((t) => t.status === 'open');
  $('user-stat-progress').textContent = c((t) => t.status === 'progress');
  $('user-stat-resolved').textContent = c((t) => t.status === 'resolved');

  const container = $('user-list');
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No working queue found for you yet. 🕊️</div>';
    return;
  }

  container.innerHTML = list.map((t) => `
    <div class="ticket-card">
      <div class="ticket-head">
        <div style="min-width: 0;">
          <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.2rem;">
            <h3 class="ticket-title" style="margin: 0;">${esc(t.subject)}</h3>
            ${statusBadge(t.status)}
          </div>
          <p class="ticket-subject" style="margin: 0;">${esc(t.ticketNo || '')}</p>
        </div>
        ${priorityBadge(t.priority)}
      </div>
      ${t.description ? `<p class="ticket-desc">${esc(t.description)}</p>` : ''}
      ${t.notes ? `
        <div class="ticket-note">
          <span class="note-label">PEGASUS Admin</span>
          ${esc(t.notes)}
          <div style="margin-top:0.35rem; font-size:0.72rem; color: var(--muted);">${fmtDate(t.noteUpdatedAt || t.updatedAt)}</div>
        </div>` : ''}
      <div class="ticket-meta">
        <span class="meta-item">Created: ${fmtDate(t.createdAt)}</span>
        <span class="meta-item">Updated: ${fmtDate(t.updatedAt)}</span>
      </div>
    </div>`).join('');
}

// ---- Ticket modal (admin add / edit) ----
function openTicketModal(ticket) {
  editingId = ticket ? ticket.id : null;
  $('modal-title').textContent = ticket ? 'Edit Ticket' : 'Add Ticket';
  $('ticket-name').value = ticket ? ticket.name : '';
  $('ticket-subject').value = ticket ? ticket.subject : '';
  $('ticket-desc').value = ticket ? ticket.description : '';
  $('ticket-priority').value = ticket ? ticket.priority : 'normal';
  $('ticket-status').value = ticket ? ticket.status : 'open';
  $('ticket-notes').value = ticket ? ticket.notes : '';
  $('ticket-modal-error').style.display = 'none';
  $('ticket-modal').style.display = 'flex';
}

function closeTicketModal() {
  $('ticket-modal').style.display = 'none';
  editingId = null;
}

$('add-ticket-btn').addEventListener('click', () => openTicketModal(null));
$('modal-close').addEventListener('click', closeTicketModal);
$('ticket-modal').addEventListener('click', (e) => {
  if (e.target === $('ticket-modal')) closeTicketModal();
});

function generateTicketNo() {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 46655);
  const code = now.toString(36).toUpperCase().slice(-4) + rand.toString(36).toUpperCase().padStart(3, '0');
  return 'PS-' + code;
}

$('ticket-save-btn').addEventListener('click', async () => {
  const name = $('ticket-name').value.trim();
  const subject = $('ticket-subject').value.trim();
  const description = $('ticket-desc').value.trim();
  const priority = $('ticket-priority').value;
  const status = $('ticket-status').value;
  const notes = $('ticket-notes').value.trim();

  if (!name || !subject) {
    const errEl = $('ticket-modal-error');
    errEl.textContent = 'Please fill in Name and Subject.';
    errEl.style.display = 'block';
    return;
  }

  const btn = $('ticket-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    if (editingId) {
      const patch = {
        name, subject, description, priority, status, notes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (notes) patch.noteUpdatedAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('tickets').doc(editingId).update(patch);
      toast('Ticket updated.');
    } else {
      await db.collection('tickets').add({
        name,
        nameLower: normalize(name),
        subject,
        description,
        priority,
        status,
        notes,
        ticketNo: generateTicketNo(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        noteUpdatedAt: notes ? firebase.firestore.FieldValue.serverTimestamp() : null
      });
      toast('Ticket added to queue.');
    }
    closeTicketModal();
  } catch (err) {
    console.error(err);
    const errEl = $('ticket-modal-error');
    errEl.textContent = 'Failed to save. ' + (err.message || '');
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Ticket';
  }
});

// ---- Boot ----
function init() {
  setTimeout(() => {
    try {
      firebase.firestore().collection('tickets').limit(1).get();
      dbReady = true;
    } catch (e) {
      dbReady = false;
    }
    showScreen('login-screen');
  }, 1200);
}

init();