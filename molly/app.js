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

const IMGBB_API_KEY = "46762a5e6eda82914445ffc478d66ca5";

const modalWrapper = document.getElementById('modal-wrapper');
const dialog = document.getElementById('comment-dialog');
const SelectionBox = document.createElement('div');
SelectionBox.className = 'selection-box';

let isDrawing = false;
let startX, startY;
let currentRect = null; // {x, y, w, h} in percentages
let currentMedia = null;
let unsubscribe = null; // Firebase listener
let pendingDeleteId = null;
let isAdmin = false;
let pendingFile = null;

const BAD_WORDS = ['badword1', 'badword2', 'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'bastard', 'hell', 'dick', 'porn', 'xxx', 'nude', 'nsfw'];

// --- Firebase Fetch and Render --- //

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

// --- Load Approved Uploads to Gallery --- //

function loadApprovedUploads() {
    db.collection("approved_uploads")
        .orderBy("createdAt", "desc")
        .get()
        .then((snapshot) => {
            if (snapshot.empty) {
                console.log("No approved uploads found");
                return;
            }
            snapshot.forEach((doc) => {
                addToGallery(doc.data().url, doc.id);
            });
        })
        .catch((e) => {
            console.error("Error loading approved uploads:", e);
        });
    
    db.collection("approved_uploads")
        .orderBy("createdAt", "desc")
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    addToGallery(change.doc.data().url, change.doc.id);
                }
            });
        }, (e) => {
            console.error("Snapshot error:", e);
        });
}

function addToGallery(url, id) {
    if (document.querySelector(`[data-upload-id="${id}"]`)) return;
    
    const gallery = document.getElementById('gallery');
    const item = document.createElement('div');
    item.className = 'item';
    item.setAttribute('data-upload-id', id);
    
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = url;
    img.onclick = () => openModal(img);
    
    item.appendChild(img);
    gallery.appendChild(item);
}

loadApprovedUploads();

window.addEventListener('mediaClosed', () => {
    if (unsubscribe) unsubscribe();
    currentMedia = null;
    dialog.style.display = 'none';
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
    // Only draw if target is the image/video or the wrapper itself
    if (e.target.closest('.comment-box')) return;
    if (dialog.style.display === 'flex') return;
    if (e.target.tagName !== 'IMG' && e.target.tagName !== 'VIDEO') return;

    // Prevent default drag behaviors natively
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
    // Convert to percentages so it scales properly
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
        // Show dialog
        dialog.style.display = 'flex';
        document.getElementById('comment-name').focus();
    } else {
        // Too small, ignore
        if (SelectionBox.parentNode) SelectionBox.parentNode.removeChild(SelectionBox);
    }
});

// --- Saving Logic (Global window.app) --- //

window.app = {
    toggleLogin: (e) => {
        e.preventDefault();
        if (isAdmin) {
            isAdmin = false;
            document.getElementById('admin-toggle').textContent = '● Login';
            document.getElementById('pending-panel').style.display = 'none';
            updateDeleteButtonsVisibility();
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
        document.getElementById('admin-toggle').textContent = '● Logout';
        updateDeleteButtonsVisibility();
        loadPendingUploads();
        loadMessages();
    },
    closeAdminDialog: () => {
        document.getElementById('admin-dialog').style.display = 'none';
        pendingDeleteId = null;
    },
    confirmDelete: async () => {
        if (!pendingDeleteId) return;
        
        const commentId = pendingDeleteId;
        document.getElementById('admin-dialog').style.display = 'none';
        
        try {
            await db.collection("comments").doc(commentId).delete();
            const el = document.getElementById(`comment-${commentId}`);
            if (el) el.remove();
        } catch (e) {
            console.error("Error deleting document: ", e);
            alert("Failed to delete comment: " + e.message);
        }
        
        pendingDeleteId = null;
    },
    toggleUpload: (e) => {
        e.preventDefault();
        document.getElementById('upload-dialog').style.display = 'flex';
        document.getElementById('upload-name').value = '';
        document.getElementById('upload-caption').value = '';
        document.getElementById('upload-input').value = '';
        document.getElementById('upload-preview').style.display = 'none';
        pendingFile = null;
    },
    closeUploadDialog: () => {
        document.getElementById('upload-dialog').style.display = 'none';
        pendingFile = null;
    },
    previewUpload: (input) => {
        if (input.files && input.files[0]) {
            pendingFile = input.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('upload-preview');
                preview.src = e.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(pendingFile);
        }
    },
    submitUpload: async () => {
        if (!pendingFile) {
            alert('Please select an image');
            return;
        }
        
        const name = document.getElementById('upload-name').value.trim();
        if (!name) {
            alert('Please enter your name');
            return;
        }
        
        const caption = document.getElementById('upload-caption').value.trim();
        
        document.getElementById('upload-dialog').style.display = 'none';
        
        try {
            const formData = new FormData();
            formData.append('image', pendingFile);
            formData.append('key', IMGBB_API_KEY);
            
            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error?.message || 'Upload failed');
            }
            
            const url = result.data.url;
            
            await db.collection("pending_uploads").add({
                url: url,
                name: name,
                caption: caption,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            alert('Upload submitted for moderation. It will appear after admin approval.');
        } catch (e) {
            console.error("Error uploading: ", e);
            alert("Failed to upload: " + e.message);
        }
        
        pendingFile = null;
    },
    togglePendingPanel: () => {
        const panel = document.getElementById('pending-panel');
        if (isAdmin) {
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
            if (panel.style.display === 'flex') {
                panel.classList.remove('collapsed');
                loadPendingUploads();
                loadMessages();
            }
        }
    },
    togglePanel: () => {
        const panel = document.getElementById('pending-panel');
        panel.classList.toggle('collapsed');
    },
    switchTab: (tab) => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
        
        const uploadsList = document.getElementById('pending-list');
        const messagesList = document.getElementById('messages-list');
        
        if (tab === 'uploads') {
            uploadsList.style.display = 'block';
            messagesList.style.display = 'none';
        } else {
            uploadsList.style.display = 'none';
            messagesList.style.display = 'block';
            loadMessages();
        }
    },
    closePendingPanel: () => {
        document.getElementById('pending-panel').style.display = 'none';
    },
    toggleContact: (e) => {
        e.preventDefault();
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
        dialog.style.display = 'none';
        if (SelectionBox.parentNode) SelectionBox.parentNode.removeChild(SelectionBox);
        document.getElementById('comment-name').value = '';
        document.getElementById('comment-text').value = '';
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

        dialog.style.display = 'none';

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
            document.getElementById('comment-name').value = '';
            document.getElementById('comment-text').value = '';
            if (SelectionBox.parentNode) SelectionBox.parentNode.removeChild(SelectionBox);
            currentRect = null;
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("Failed to save comment. Reason: " + e.message);
            dialog.style.display = 'flex';
        }
    }
};

function updateDeleteButtonsVisibility() {
    document.querySelectorAll('.admin-delete-btn').forEach(btn => {
        btn.style.display = isAdmin ? 'block' : '';
    });
}

function loadPendingUploads() {
    if (!isAdmin) return;
    
    document.getElementById('pending-panel').style.display = 'block';
    const list = document.getElementById('pending-list');
    list.innerHTML = '<p style="color: #94a3b8;">Loading...</p>';
    
    db.collection("pending_uploads")
        .orderBy("createdAt", "desc")
        .get()
        .then((snapshot) => {
            if (snapshot.empty) {
                list.innerHTML = '<p style="color: #94a3b8;">No pending uploads</p>';
                return;
            }
            
            list.innerHTML = '';
            snapshot.forEach((doc) => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = 'pending-item';
                item.innerHTML = `
                    <img src="${escapeHtml(data.url)}" alt="Pending upload">
                    <p><strong>${escapeHtml(data.name)}</strong></p>
                    <p>${escapeHtml(data.caption || '(no caption)')}</p>
                    <div class="pending-actions">
                        <button style="background: #22c55e; color: white;" onclick="app.approveUpload('${doc.id}', '${escapeHtml(data.url)}')">Approve</button>
                        <button style="background: #ef4444; color: white;" onclick="app.rejectUpload('${doc.id}')">Reject</button>
                    </div>
                `;
                list.appendChild(item);
            });
        })
        .catch((e) => {
            list.innerHTML = '<p style="color: #ef4444;">Error loading uploads</p>';
        });
}

window.app.approveUpload = async (docId, url) => {
    try {
        await db.collection("approved_uploads").add({
            url: url,
            caption: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection("pending_uploads").doc(docId).delete();
        loadPendingUploads();
    } catch (e) {
        console.error("Error approving upload: ", e);
        alert("Failed to approve: " + e.message);
    }
};

window.app.rejectUpload = async (docId) => {
    try {
        await db.collection("pending_uploads").doc(docId).delete();
        loadPendingUploads();
    } catch (e) {
        console.error("Error rejecting upload: ", e);
        alert("Failed to reject: " + e.message);
    }
};

function loadMessages() {
    if (!isAdmin) return;
    
    const list = document.getElementById('messages-list');
    const msgCount = document.getElementById('msg-count');
    
    db.collection("admin_messages")
        .orderBy("createdAt", "desc")
        .get()
        .then((snapshot) => {
            let unreadCount = 0;
            
            if (snapshot.empty) {
                list.innerHTML = '<p style="color: #94a3b8;">No messages</p>';
                msgCount.style.display = 'none';
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
            
            if (unreadCount > 0) {
                msgCount.textContent = unreadCount;
                msgCount.style.display = 'inline';
            } else {
                msgCount.style.display = 'none';
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
