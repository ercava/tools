const ADMIN_PASSWORD = atob("aWxvdmVtb2xseXNvbXVjaA==");

const firebaseConfig = {
    apiKey: "AIzaSyDWVwkUjjI-T_fS175Xkb7YaVhM_9t7AOY",
    authDomain: "molly-b6edc.firebaseapp.com",
    projectId: "molly-b6edc",
    storageBucket: "molly-b6edc.firebasestorage.app",
    messagingSenderId: "1062639113218",
    appId: "1:1062639113218:web:c649cffa3750733188c31b",
    measurementId: "G-39LHRN7ZLJ"
};

// Initialize Firebase using Global Compat object
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const modalWrapper = document.getElementById('modal-wrapper');
const dialog = document.getElementById('comment-dialog');
const SelectionBox = document.createElement('div');
SelectionBox.className = 'selection-box';

let isDrawing = false;
let startX, startY;
let currentRect = null; // {x, y, w, h} in percentages
let currentMedia = null;
let unsubscribe = null; // Firebase listener
let condolencesUnsubscribe = null;
let pendingDeleteId = null;
let isAdmin = false;

const BAD_WORDS = ['badword1', 'badword2', 'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'bastard', 'hell', 'dick', 'porn', 'xxx', 'nude', 'nsfw'];

// --- Firebase Fetch and Render for In-Image Comments --- //

window.addEventListener('mediaOpened', (e) => {
    currentMedia = e.detail;
    if (unsubscribe) unsubscribe();
    
    document.querySelectorAll('.comment-box').forEach(el => el.remove());
    
    unsubscribe = db.collection("comments")
        .where("media", "==", currentMedia)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    renderComment(change.doc.data(), change.doc.id);
                }
            });
        });
});

window.addEventListener('mediaClosed', () => {
    if (unsubscribe) unsubscribe();
    currentMedia = null;
    if (dialog) dialog.style.display = 'none';
    if(SelectionBox.parentNode) SelectionBox.parentNode.removeChild(SelectionBox);
});

function renderComment(data, id) {
    if(document.getElementById(`comment-${id}`)) return; // Already exists

    const box = document.createElement('div');
    box.id = `comment-${id}`;
    box.className = 'comment-box';
    box.style.left = `${data.x}%`;
    box.style.top = `${data.y}%`;
    box.style.width = `${data.width}%`;
    box.style.height = `${data.height}%`;

    const tooltip = document.createElement('div');
    tooltip.className = 'comment-tooltip';
    tooltip.innerHTML = `<strong>${escapeHtml(data.name)}</strong>${escapeHtml(data.text)}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'admin-delete-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.style.display = isAdmin ? 'block' : 'none';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (!isAdmin) return;
        db.collection("comments").doc(id).delete().then(() => {
            const el = document.getElementById(`comment-${id}`);
            if (el) el.remove();
        }).catch((err) => {
            alert("Failed to delete: " + err.message);
        });
    };

    box.appendChild(tooltip);
    box.appendChild(deleteBtn);
    modalWrapper.appendChild(box);
}

// --- Drawing UI logic --- //

modalWrapper.addEventListener('mousedown', (e) => {
    if (e.target.closest('.comment-box')) return;
    if (dialog && dialog.style.display === 'flex') return;
    if (e.target.tagName !== 'IMG' && e.target.tagName !== 'VIDEO') return;

    e.preventDefault();

    const rect = modalWrapper.getBoundingClientRect();
    isDrawing = true;
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    SelectionBox.style.left = `${startX}px`;
    SelectionBox.style.top = `${startY}px`;
    SelectionBox.style.width = `0px`;
    SelectionBox.style.height = `0px`;
    modalWrapper.appendChild(SelectionBox);
});

modalWrapper.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    const rect = modalWrapper.getBoundingClientRect();
    const currentX = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const currentY = Math.min(Math.max(0, e.clientY - rect.top), rect.height);

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    SelectionBox.style.left = `${x}px`;
    SelectionBox.style.top = `${y}px`;
    SelectionBox.style.width = `${w}px`;
    SelectionBox.style.height = `${h}px`;
});

modalWrapper.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    const rect = modalWrapper.getBoundingClientRect();
    const pixelLeft = parseFloat(SelectionBox.style.left);
    const pixelTop = parseFloat(SelectionBox.style.top);
    const pixelWidth = parseFloat(SelectionBox.style.width);
    const pixelHeight = parseFloat(SelectionBox.style.height);

    if (pixelWidth > 10 && pixelHeight > 10) {
        currentRect = {
            x: (pixelLeft / rect.width) * 100,
            y: (pixelTop / rect.height) * 100,
            width: (pixelWidth / rect.width) * 100,
            height: (pixelHeight / rect.height) * 100
        };
        if (dialog) {
            dialog.style.display = 'flex';
            document.getElementById('comment-name').focus();
        }
    } else {
        if (SelectionBox.parentNode) SelectionBox.parentNode.removeChild(SelectionBox);
    }
});

// --- Condolences Section Logic --- //

function initCondolences() {
    const listEl = document.getElementById('condolences-list');
    if (!listEl) return;

    if (condolencesUnsubscribe) condolencesUnsubscribe();

    condolencesUnsubscribe = db.collection("condolences")
        .orderBy("createdAt", "desc")
        .onSnapshot((snapshot) => {
            if (snapshot.empty) {
                listEl.innerHTML = `
                    <span class="ticker-item empty">No condolences yet — leave the first one above.</span>
                `;
                return;
            }

            const items = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const safeName = escapeHtml(data.name || 'Anonymous');
                const safeMsg = escapeHtml(data.message || '');
                const deleteBtn = isAdmin ? `<button class="ticker-del-btn" onclick="app.deleteCondolence('${doc.id}')">&times;</button>` : '';
                items.push(`<span class="ticker-item" id="condolence-${doc.id}"><strong>${safeName}:</strong> ${safeMsg} ${deleteBtn}</span>`);
            });

            // Duplicate items so infinite marquee scrolls seamlessly
            const content = items.join('<span class="ticker-bullet">✦</span>');
            listEl.innerHTML = `${content}<span class="ticker-bullet">✦</span>${content}`;
        }, (error) => {
            console.error("Error loading condolences:", error);
            if (listEl) {
                listEl.innerHTML = '<span class="ticker-item empty">Failed to load condolences.</span>';
            }
        });
}

// --- Global window.app actions --- //

window.app = {
    toggleLogin: (e) => {
        if (e) e.preventDefault();
        if (isAdmin) {
            isAdmin = false;
            document.getElementById('admin-toggle').textContent = 'login as me';
            document.getElementById('pending-panel').style.display = 'none';
            updateAdminButtonsVisibility();
        } else {
            document.getElementById('admin-dialog').style.display = 'flex';
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
        }
    },
    login: () => {
        const password = document.getElementById('admin-password').value;
        if (password !== ADMIN_PASSWORD) {
            alert('Incorrect password');
            return;
        }
        isAdmin = true;
        document.getElementById('admin-dialog').style.display = 'none';
        document.getElementById('admin-toggle').textContent = 'logout';
        updateAdminButtonsVisibility();
        loadMessages();
    },
    closeAdminDialog: () => {
        document.getElementById('admin-dialog').style.display = 'none';
        pendingDeleteId = null;
    },
    togglePendingPanel: () => {
        const panel = document.getElementById('pending-panel');
        if (isAdmin) {
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
            if (panel.style.display === 'flex') {
                panel.classList.remove('collapsed');
                loadMessages();
            }
        }
    },
    togglePanel: () => {
        const panel = document.getElementById('pending-panel');
        panel.classList.toggle('collapsed');
    },
    switchTab: (tab) => {
        loadMessages();
    },
    closePendingPanel: () => {
        document.getElementById('pending-panel').style.display = 'none';
    },
    toggleContact: (e) => {
        if (e) e.preventDefault();
        document.getElementById('contact-dialog').style.display = 'flex';
        document.getElementById('contact-name').value = '';
        document.getElementById('contact-message').value = '';
    },
    closeContactDialog: () => {
        document.getElementById('contact-dialog').style.display = 'none';
    },
    sendMessage: async () => {
        const name = document.getElementById('contact-name').value.trim();
        const message = document.getElementById('contact-message').value.trim();
        
        if (!name || !message) {
            alert('Please fill in all fields');
            return;
        }
        
        if (containsBadWords(name) || containsBadWords(message)) {
            alert('Please use appropriate language.');
            return;
        }
        
        document.getElementById('contact-dialog').style.display = 'none';
        
        try {
            await db.collection("admin_messages").add({
                name: name,
                message: message,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert('Message sent!');
        } catch (e) {
            console.error("Error sending message: ", e);
            alert("Failed to send message: " + e.message);
        }
    },
    cancelComment: () => {
        if (dialog) dialog.style.display = 'none';
        if (SelectionBox.parentNode) SelectionBox.parentNode.removeChild(SelectionBox);
        const nameEl = document.getElementById('comment-name');
        const textEl = document.getElementById('comment-text');
        if (nameEl) nameEl.value = '';
        if (textEl) textEl.value = '';
        currentRect = null;
    },
    saveComment: async () => {
        const nameNode = document.getElementById('comment-name');
        const textNode = document.getElementById('comment-text');
        
        const name = nameNode.value.trim();
        const text = textNode.value.trim();

        if (!name || !text || !currentRect || !currentMedia) return;
        
        if (containsBadWords(name) || containsBadWords(text)) {
            alert('Please use appropriate language.');
            return;
        }

        if (dialog) dialog.style.display = 'none';

        try {
            await db.collection("comments").add({
                media: currentMedia,
                name: name,
                text: text,
                x: currentRect.x,
                y: currentRect.y,
                width: currentRect.width,
                height: currentRect.height,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            nameNode.value = '';
            textNode.value = '';
            if (SelectionBox.parentNode) SelectionBox.parentNode.removeChild(SelectionBox);
            currentRect = null;
        } catch (e) {
            console.error("Error adding comment: ", e);
            alert("Failed to save comment. Reason: " + e.message);
            if (dialog) dialog.style.display = 'flex';
        }
    },
    openCondolenceDialog: (e) => {
        if (e) e.preventDefault();
        const condolenceDialog = document.getElementById('condolence-dialog');
        if (condolenceDialog) {
            condolenceDialog.style.display = 'flex';
            document.getElementById('condolence-name').value = '';
            document.getElementById('condolence-text').value = '';
            document.getElementById('condolence-name').focus();
        }
    },
    closeCondolenceDialog: () => {
        const condolenceDialog = document.getElementById('condolence-dialog');
        if (condolenceDialog) {
            condolenceDialog.style.display = 'none';
        }
    },
    submitCondolence: async () => {
        const nameInput = document.getElementById('condolence-name');
        const textInput = document.getElementById('condolence-text');
        const name = nameInput.value.trim();
        const text = textInput.value.trim();

        if (!name) {
            alert('Please enter your name.');
            nameInput.focus();
            return;
        }
        if (!text) {
            alert('Please enter your condolence message.');
            textInput.focus();
            return;
        }

        if (containsBadWords(name) || containsBadWords(text)) {
            alert('Please use appropriate language.');
            return;
        }

        const condolenceDialog = document.getElementById('condolence-dialog');
        condolenceDialog.style.display = 'none';

        try {
            await db.collection("condolences").add({
                name: name,
                message: text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            nameInput.value = '';
            textInput.value = '';
        } catch (e) {
            console.error("Error posting condolence:", e);
            alert("Failed to post condolence: " + e.message);
            condolenceDialog.style.display = 'flex';
        }
    },
    deleteCondolence: async (docId) => {
        if (!isAdmin) return;
        if (!confirm("Are you sure you want to delete this condolence message?")) return;
        try {
            await db.collection("condolences").doc(docId).delete();
        } catch (e) {
            console.error("Error deleting condolence:", e);
            alert("Failed to delete: " + e.message);
        }
    }
};

function updateAdminButtonsVisibility() {
    document.querySelectorAll('.admin-delete-btn').forEach(btn => {
        btn.style.display = isAdmin ? 'block' : 'none';
    });
    // Re-render condolences to show/hide delete buttons
    initCondolences();
}

function loadMessages() {
    if (!isAdmin) return;
    
    const panel = document.getElementById('pending-panel');
    if (panel) panel.style.display = 'flex';
    
    const list = document.getElementById('messages-list');
    const msgCount = document.getElementById('msg-count');
    if (!list) return;
    
    list.innerHTML = '<p style="color: #94a3b8;">Loading...</p>';
    
    db.collection("admin_messages")
        .orderBy("createdAt", "desc")
        .get()
        .then((snapshot) => {
            let unreadCount = 0;
            
            if (snapshot.empty) {
                list.innerHTML = '<p style="color: #94a3b8;">No messages</p>';
                if (msgCount) msgCount.style.display = 'none';
                return;
            }
            
            list.innerHTML = '';
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (!data.read) unreadCount++;
                
                const item = document.createElement('div');
                item.className = 'message-item';
                item.innerHTML = `
                    <strong>${escapeHtml(data.name)}</strong>
                    <small>${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'Just now'}</small>
                    <p>${escapeHtml(data.message)}</p>
                    <div class="pending-actions">
                        <button style="background: #22c55e; color: white;" onclick="app.markRead('${doc.id}')">Mark Read</button>
                        <button style="background: #ef4444; color: white;" onclick="app.deleteMessage('${doc.id}')">Delete</button>
                    </div>
                `;
                list.appendChild(item);
            });
            
            if (msgCount) {
                if (unreadCount > 0) {
                    msgCount.textContent = unreadCount;
                    msgCount.style.display = 'inline';
                } else {
                    msgCount.style.display = 'none';
                }
            }
        })
        .catch((e) => {
            list.innerHTML = '<p style="color: #ef4444;">Error loading messages</p>';
        });
}

window.app.markRead = async (docId) => {
    try {
        await db.collection("admin_messages").doc(docId).update({ read: true });
        loadMessages();
    } catch (e) {
        console.error("Error marking read: ", e);
    }
};

window.app.deleteMessage = async (docId) => {
    try {
        await db.collection("admin_messages").doc(docId).delete();
        loadMessages();
    } catch (e) {
        console.error("Error deleting message: ", e);
    }
};

function escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function containsBadWords(text) {
    const lower = text.toLowerCase();
    return BAD_WORDS.some(word => lower.includes(word));
}

// Initialize Condolences Listener on Page Load
initCondolences();
