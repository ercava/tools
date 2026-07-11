/* ========================================
   ERCAVA SEARCH — Client-Side Search App
   ======================================== */

(function () {
    'use strict';

    // ---- State ----
    let allData = { students: [], news: [], lostfound: [], competitions: [], teachers: [], quotes: [] };
    let fuseInstances = {};
    let activeCategory = 'all';
    let searchTimeout = null;

    // ---- DOM References ----
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const searchHint = document.getElementById('search-hint');
    const resultsContainer = document.getElementById('results-container');
    const resultsHeader = document.getElementById('results-header');
    const resultsCount = document.getElementById('results-count');
    const resultsTime = document.getElementById('results-time');
    const welcomeState = document.getElementById('welcome-state');
    const noResultsState = document.getElementById('no-results-state');
    const badgeCount = document.getElementById('badge-count');
    const modal = document.getElementById('detail-modal');
    const modalBody = document.getElementById('modal-body');
    const modalClose = document.getElementById('modal-close');

    // ---- Initialize ----
    function init() {
        decodeData();
        setupFuse();
        setupEventListeners();
        updateBadge();
    }

    // ---- Decode Base64 Data ----
    function decodeData() {
        try {
            if (typeof window.__SEARCH_DATA === 'string') {
                const decoded = atob(window.__SEARCH_DATA);
                // Handle UTF-8 properly
                const bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) {
                    bytes[i] = decoded.charCodeAt(i);
                }
                const text = new TextDecoder('utf-8').decode(bytes);
                allData = JSON.parse(text);
            }
        } catch (e) {
            console.error('Failed to decode search data:', e);
        }
    }

    // ---- Setup Fuse.js ----
    function setupFuse() {
        const fuseOptions = {
            threshold: 0.35,
            distance: 100,
            minMatchCharLength: 2,
            includeScore: true,
            includeMatches: true,
        };

        fuseInstances.students = new Fuse(allData.students || [], {
            ...fuseOptions,
            keys: [
                { name: 'name', weight: 0.4 },
                { name: 'nickname', weight: 0.3 },
                { name: 'class', weight: 0.15 },
                { name: 'roles', weight: 0.1 },
                { name: 'utbk_prodi', weight: 0.05 },
            ],
        });

        fuseInstances.news = new Fuse(allData.news || [], {
            ...fuseOptions,
            keys: [
                { name: 'title', weight: 0.5 },
                { name: 'content', weight: 0.3 },
                { name: 'date', weight: 0.1 },
                { name: 'category', weight: 0.1 },
            ],
        });

        fuseInstances.lostfound = new Fuse(allData.lostfound || [], {
            ...fuseOptions,
            keys: [
                { name: 'item', weight: 0.4 },
                { name: 'description', weight: 0.3 },
                { name: 'location', weight: 0.15 },
                { name: 'contact', weight: 0.15 },
            ],
        });

        fuseInstances.competitions = new Fuse(allData.competitions || [], {
            ...fuseOptions,
            keys: [
                { name: 'name', weight: 0.3 },
                { name: 'competition', weight: 0.3 },
                { name: 'achievement', weight: 0.2 },
                { name: 'level', weight: 0.1 },
                { name: 'year', weight: 0.1 },
            ],
        });

        fuseInstances.teachers = new Fuse(allData.teachers || [], {
            ...fuseOptions,
            keys: [
                { name: 'name', weight: 0.5 },
                { name: 'subject', weight: 0.3 },
                { name: 'role', weight: 0.2 },
            ],
        });

        fuseInstances.quotes = new Fuse(allData.quotes || [], {
            ...fuseOptions,
            keys: [
                { name: 'text', weight: 0.6 },
                { name: 'author', weight: 0.4 },
            ],
        });
    }

    // ---- Event Listeners ----
    function setupEventListeners() {
        // Search input
        searchInput.addEventListener('input', function () {
            const val = this.value.trim();
            searchClear.style.display = val.length > 0 ? 'flex' : 'none';

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => performSearch(val), 180);
        });

        // Clear button
        searchClear.addEventListener('click', function () {
            searchInput.value = '';
            searchClear.style.display = 'none';
            showWelcome();
        });

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function () {
                document.querySelector('.tab.active').classList.remove('active');
                this.classList.add('active');
                activeCategory = this.dataset.category;

                const val = searchInput.value.trim();
                if (val.length >= 2) {
                    performSearch(val);
                }
            });
        });

        // Modal
        modalClose.addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) {
            if (e.target === this) closeModal();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeModal();
        });

        // Keyboard shortcut — focus search on "/"
        document.addEventListener('keydown', function (e) {
            if (e.key === '/' && document.activeElement !== searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    // ---- Search ----
    function performSearch(query) {
        if (query.length < 2) {
            showWelcome();
            return;
        }

        const startTime = performance.now();
        let results = [];

        const categories = activeCategory === 'all'
            ? Object.keys(fuseInstances)
            : [activeCategory];

        categories.forEach(cat => {
            if (fuseInstances[cat]) {
                const catResults = fuseInstances[cat].search(query, { limit: 50 });
                catResults.forEach(r => {
                    results.push({
                        category: cat,
                        item: r.item,
                        score: r.score,
                        matches: r.matches,
                    });
                });
            }
        });

        // Sort by score (lower = better match)
        results.sort((a, b) => a.score - b.score);

        // Limit total results
        results = results.slice(0, 80);

        const elapsed = (performance.now() - startTime).toFixed(1);
        renderResults(results, elapsed);
    }

    // ---- Render ----
    function renderResults(results, elapsed) {
        // Clear existing cards (not the empty states)
        const cards = resultsContainer.querySelectorAll('.result-card');
        cards.forEach(c => c.remove());

        if (results.length === 0) {
            welcomeState.style.display = 'none';
            noResultsState.style.display = 'flex';
            resultsHeader.style.display = 'none';
            return;
        }

        welcomeState.style.display = 'none';
        noResultsState.style.display = 'none';
        resultsHeader.style.display = 'flex';
        resultsCount.textContent = `${results.length} hasil`;
        resultsTime.textContent = `${elapsed}ms`;

        const fragment = document.createDocumentFragment();
        results.forEach((r, idx) => {
            const card = createCard(r, idx);
            fragment.appendChild(card);
        });
        resultsContainer.appendChild(fragment);
    }

    function createCard(result, index) {
        const { category, item } = result;
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.animationDelay = `${Math.min(index * 30, 300)}ms`;

        const renderer = cardRenderers[category];
        if (renderer) {
            card.innerHTML = renderer(item);
            card.addEventListener('click', () => openModal(category, item));
        }

        return card;
    }

    // ---- Card Renderers ----
    const cardRenderers = {
        students(s) {
            const initials = getInitials(s.name);
            const rolesHtml = (s.roles || []).slice(0, 3).map(r =>
                `<span class="tag">${escapeHtml(r)}</span>`
            ).join('');
            const utbkInfo = s.utbk_prodi ? `<div class="card-meta-item">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3z"/></svg>
                ${escapeHtml(s.utbk_prodi)}${s.utbk_ptn ? ' — ' + escapeHtml(s.utbk_ptn) : ''}
            </div>` : '';

            return `
                <div class="card-header">
                    <div class="card-avatar student">${initials}</div>
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(s.name)}</div>
                        <div class="card-subtitle">${escapeHtml(s.class || '')}${s.grade ? ' · ' + escapeHtml(s.grade) : ''}${s.nickname ? ' · ' + escapeHtml(s.nickname) : ''}</div>
                    </div>
                    <span class="card-category-badge student">Siswa</span>
                </div>
                <div class="card-meta">
                    ${s.advisor_pa ? `<div class="card-meta-item">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
                        PA: ${escapeHtml(s.advisor_pa)}
                    </div>` : ''}
                    ${s.birthday ? `<div class="card-meta-item">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        ${escapeHtml(s.birthday)}
                    </div>` : ''}
                    ${utbkInfo}
                </div>
                ${rolesHtml ? `<div class="card-tags">${rolesHtml}</div>` : ''}
            `;
        },

        news(n) {
            return `
                <div class="card-header">
                    <div class="card-avatar news">📰</div>
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(n.title || 'Untitled')}</div>
                        <div class="card-subtitle">${escapeHtml(n.date || '')}${n.category ? ' · ' + escapeHtml(n.category) : ''}</div>
                    </div>
                    <span class="card-category-badge news">Berita</span>
                </div>
                ${n.content ? `<div class="card-meta"><div class="card-meta-item" style="color: var(--text-secondary)">${escapeHtml(truncate(n.content, 150))}</div></div>` : ''}
            `;
        },

        lostfound(lf) {
            const statusClass = lf.status === 'Found' ? 'found' : lf.status === 'Searching' ? 'searching' : 'lost';
            return `
                <div class="card-header">
                    <div class="card-avatar lostfound">${lf.type === 'lost' ? '🔍' : '📦'}</div>
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(lf.item || 'Unknown Item')}</div>
                        <div class="card-subtitle">${escapeHtml(lf.location || '')}${lf.date ? ' · ' + escapeHtml(lf.date) : ''}</div>
                    </div>
                    <span class="card-category-badge lostfound">${escapeHtml(lf.type || 'L&F')}</span>
                </div>
                <div class="card-meta">
                    ${lf.status ? `<div class="card-meta-item"><span class="status-badge ${statusClass}">${escapeHtml(lf.status)}</span></div>` : ''}
                    ${lf.contact ? `<div class="card-meta-item">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
                        ${escapeHtml(lf.contact)}
                    </div>` : ''}
                </div>
                ${lf.description ? `<div class="card-meta" style="margin-top: 8px"><div class="card-meta-item" style="color: var(--text-secondary)">${escapeHtml(truncate(lf.description, 120))}</div></div>` : ''}
            `;
        },

        competitions(c) {
            return `
                <div class="card-header">
                    <div class="card-avatar competition">🏆</div>
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(c.name || c.competition || 'Lomba')}</div>
                        <div class="card-subtitle">${escapeHtml(c.competition || '')}${c.level ? ' · ' + escapeHtml(c.level) : ''}${c.year ? ' · ' + escapeHtml(c.year) : ''}</div>
                    </div>
                    <span class="card-category-badge competition">Lomba</span>
                </div>
                <div class="card-meta">
                    ${c.achievement ? `<div class="card-meta-item">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                        ${escapeHtml(c.achievement)}
                    </div>` : ''}
                    ${c.participants ? `<div class="card-meta-item">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
                        ${escapeHtml(c.participants)}
                    </div>` : ''}
                </div>
            `;
        },

        teachers(t) {
            const initials = getInitials(t.name);
            return `
                <div class="card-header">
                    <div class="card-avatar teacher">${initials}</div>
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(t.name || '')}</div>
                        <div class="card-subtitle">${escapeHtml(t.subject || '')}${t.role ? ' · ' + escapeHtml(t.role) : ''}</div>
                    </div>
                    <span class="card-category-badge teacher">Guru</span>
                </div>
            `;
        },

        quotes(q) {
            return `
                <div class="card-header">
                    <div class="card-avatar quote">💬</div>
                    <div class="card-info">
                        <div class="card-name" style="font-style: italic; font-size: var(--font-size-md)">"${escapeHtml(truncate(q.text, 200))}"</div>
                        <div class="card-subtitle">${q.author ? '— ' + escapeHtml(q.author) : ''}</div>
                    </div>
                    <span class="card-category-badge quote">Quote</span>
                </div>
            `;
        },
    };

    // ---- Modal ----
    function openModal(category, item) {
        const renderer = modalRenderers[category];
        if (renderer) {
            modalBody.innerHTML = renderer(item);
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    const modalRenderers = {
        students(s) {
            const details = [
                ['Nama Lengkap', s.name],
                ['Panggilan', s.nickname],
                ['Jenis Kelamin', s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : s.gender],
                ['Kelas', s.class],
                ['Angkatan', s.grade],
                ['Tanggal Lahir', s.birthday],
                ['Zodiak', s.zodiac ? `${s.zodiac_icon || ''} ${s.zodiac}` : ''],
                ['Hari Lahir', s.hari_lahir],
                ['Status', s.status],
                ['Hubungan', s.relationship],
                ['Instagram', s.instagram],
                ['Alamat', s.address],
                ['Pekerjaan', s.job],
                ['PA / Wali Kelas', s.advisor_pa],
                ['Guru Asuh', s.guru_asuh],
                ['WA Guru Asuh', s.guru_asuh_wa],
                ['Jurusan Kuliah', s.major],
                ['Universitas', s.university],
                ['UTBK — PTN', s.utbk_ptn],
                ['UTBK — Prodi', s.utbk_prodi],
            ].filter(([, v]) => v && v.toString().trim());

            const rolesHtml = (s.roles || []).map(r => `<span class="tag">${escapeHtml(r)}</span>`).join('');

            return `
                <div class="modal-section">
                    <div class="modal-header-name">${escapeHtml(s.name)}</div>
                    <div class="modal-header-subtitle">${escapeHtml(s.class || '')}${s.grade ? ' · Angkatan ' + escapeHtml(s.grade) : ''}</div>
                </div>
                <div class="modal-section">
                    <div class="modal-section-title">Informasi Pribadi</div>
                    ${details.map(([label, value]) =>
                        `<div class="modal-detail-row">
                            <span class="modal-detail-label">${escapeHtml(label)}</span>
                            <span class="modal-detail-value">${escapeHtml(String(value))}</span>
                        </div>`
                    ).join('')}
                </div>
                ${rolesHtml ? `<div class="modal-section">
                    <div class="modal-section-title">Jabatan & Organisasi</div>
                    <div class="card-tags" style="padding-top: 4px">${rolesHtml}</div>
                </div>` : ''}
            `;
        },

        news(n) {
            return `
                <div class="modal-section">
                    <div class="modal-header-name">${escapeHtml(n.title || 'Untitled')}</div>
                    <div class="modal-header-subtitle">${escapeHtml(n.date || '')}${n.category ? ' · ' + escapeHtml(n.category) : ''}</div>
                </div>
                ${n.content ? `<div class="modal-section">
                    <div class="modal-section-title">Konten</div>
                    <p style="color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.7">${escapeHtml(n.content)}</p>
                </div>` : ''}
            `;
        },

        lostfound(lf) {
            const details = [
                ['Barang', lf.item],
                ['Tipe', lf.type],
                ['Status', lf.status],
                ['Lokasi', lf.location],
                ['Tanggal', lf.date],
                ['Kontak', lf.contact],
                ['Deskripsi', lf.description],
            ].filter(([, v]) => v && v.toString().trim());

            return `
                <div class="modal-section">
                    <div class="modal-header-name">${escapeHtml(lf.item || 'Unknown')}</div>
                    <div class="modal-header-subtitle">${escapeHtml(lf.type || '')} · ${escapeHtml(lf.status || '')}</div>
                </div>
                <div class="modal-section">
                    <div class="modal-section-title">Detail</div>
                    ${details.map(([label, value]) =>
                        `<div class="modal-detail-row">
                            <span class="modal-detail-label">${escapeHtml(label)}</span>
                            <span class="modal-detail-value">${escapeHtml(String(value))}</span>
                        </div>`
                    ).join('')}
                </div>
            `;
        },

        competitions(c) {
            const details = [
                ['Nama Lomba', c.competition],
                ['Peserta', c.name || c.participants],
                ['Pencapaian', c.achievement],
                ['Level', c.level],
                ['Tahun', c.year],
            ].filter(([, v]) => v && v.toString().trim());

            return `
                <div class="modal-section">
                    <div class="modal-header-name">${escapeHtml(c.competition || c.name || 'Lomba')}</div>
                    <div class="modal-header-subtitle">${escapeHtml(c.level || '')}${c.year ? ' · ' + escapeHtml(c.year) : ''}</div>
                </div>
                <div class="modal-section">
                    <div class="modal-section-title">Detail Lomba</div>
                    ${details.map(([label, value]) =>
                        `<div class="modal-detail-row">
                            <span class="modal-detail-label">${escapeHtml(label)}</span>
                            <span class="modal-detail-value">${escapeHtml(String(value))}</span>
                        </div>`
                    ).join('')}
                </div>
            `;
        },

        teachers(t) {
            const details = [
                ['Nama', t.name],
                ['Mata Pelajaran', t.subject],
                ['Jabatan', t.role],
                ['NIP', t.nip],
            ].filter(([, v]) => v && v.toString().trim());

            return `
                <div class="modal-section">
                    <div class="modal-header-name">${escapeHtml(t.name || '')}</div>
                    <div class="modal-header-subtitle">${escapeHtml(t.subject || '')}</div>
                </div>
                <div class="modal-section">
                    <div class="modal-section-title">Informasi Guru</div>
                    ${details.map(([label, value]) =>
                        `<div class="modal-detail-row">
                            <span class="modal-detail-label">${escapeHtml(label)}</span>
                            <span class="modal-detail-value">${escapeHtml(String(value))}</span>
                        </div>`
                    ).join('')}
                </div>
            `;
        },

        quotes(q) {
            return `
                <div class="modal-section" style="text-align: center; padding: var(--space-2xl) 0">
                    <div style="font-size: 48px; margin-bottom: var(--space-lg); opacity: 0.3">❝</div>
                    <p style="font-family: var(--font-heading); font-size: var(--font-size-xl); font-style: italic; color: var(--text-primary); line-height: 1.6; margin-bottom: var(--space-lg)">${escapeHtml(q.text)}</p>
                    ${q.author ? `<p style="color: var(--text-secondary); font-size: var(--font-size-md)">— ${escapeHtml(q.author)}</p>` : ''}
                </div>
            `;
        },
    };

    // ---- Helpers ----
    function showWelcome() {
        const cards = resultsContainer.querySelectorAll('.result-card');
        cards.forEach(c => c.remove());
        welcomeState.style.display = 'flex';
        noResultsState.style.display = 'none';
        resultsHeader.style.display = 'none';
        searchHint.style.opacity = '1';
    }

    function updateBadge() {
        let total = 0;
        Object.values(allData).forEach(arr => {
            if (Array.isArray(arr)) total += arr.length;
        });
        badgeCount.textContent = `${total} records`;
    }

    function getInitials(name) {
        if (!name) return '?';
        const parts = name.split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function truncate(str, len) {
        if (!str) return '';
        if (str.length <= len) return str;
        return str.substring(0, len) + '…';
    }

    // ---- Boot ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
