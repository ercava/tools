// State
let currentUser = null;
let currentMode = null; // 'training' or 'to'
let activeExam = null; 
let historyList = JSON.parse(localStorage.getItem('ercavianUtbkHistory') || '[]');

const appDiv = document.getElementById('app');

window.onload = () => {
    renderLogin();
};

async function handleLogin(e) {
    if(e) e.preventDefault();
    const nisnInput = document.getElementById('nisn').value.trim();
    if(!nisnInput) return showError('NISN tidak boleh kosong');
    
    // Simulate loading
    const btn = document.querySelector('#login-form .btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Memeriksa...';
    btn.disabled = true;

    try {
        const response = await fetch('nisn.csv');
        if(!response.ok) throw new Error("Gagal mengambil nisn.csv");
        const csvData = await response.text();
        const rows = csvData.split('\n').map(r => r.split(','));
        
        let found = false;
        for(let row of rows) {
            if(row.length >= 2) {
                const csvNisn = parseInt(row[0].trim(), 10);
                const inputNisn = parseInt(nisnInput, 10);
                if(csvNisn === inputNisn) {
                    currentUser = { nisn: row[0].trim(), name: row[1].trim() };
                    found = true;
                    break;
                }
            }
        }
        
        if(found) {
            renderDashboard();
        } else {
            showError('NISN tidak valid atau tidak terdaftar.');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        showError('Gagal memuat DB NISN. ' + err.message + '. (Jalankan via Live Server atau python -m http.server)');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function showError(msg) {
    const errEl = document.getElementById('login-error');
    if(errEl) {
        errEl.textContent = msg;
        errEl.className = 'error-message visible';
    }
}

function handleLogout() {
    currentUser = null;
    renderLogin();
}

// ----------------- RENDERERS ----------------- //

function renderHeader() {
    return `
        <div class="header">
            <div class="user-info">${currentUser.name} <span>(${currentUser.nisn})</span></div>
            <button class="logout" onclick="handleLogout()">Keluar Sistem</button>
        </div>
    `;
}

function renderLogin() {
    appDiv.innerHTML = `
        <div class="page active" id="login-page">
            <div class="glass-panel">
                <h1 style="font-size: 2.2rem; margin-bottom: 2rem;">Ercavian<br/>UTBK Simulator</h1>
                <p>Silakan masuk menggunakan Nomor Induk Siswa Nasional (NISN) Anda.</p>
                <form id="login-form">
                    <input type="number" id="nisn" placeholder="Contoh: 0083546486" required>
                    <div id="login-error" class="error-message"></div>
                    <button type="submit" class="btn">Masuk</button>
                </form>
            </div>
        </div>
    `;
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

function renderDashboard() {
    appDiv.innerHTML = `
        ${renderHeader()}
        <div class="page active" id="dashboard-page">
            <div class="cards" style="margin-top: 0;">
                <div class="mode-card" onclick="renderTrainingSetup()">
                    <h3>Training Mode</h3>
                    <p>Pilih satu dari subtes yang tersedia. Latih soal tanpa batasan waktu untuk pendalaman materi.</p>
                </div>
                <div class="mode-card" onclick="renderTOSetup()">
                    <h3>Try Out Mode</h3>
                    <p>Simulasi utuh dengan aturan waktu aktual. Diacak berdasarkan standar SNPMB 2025.</p>
                </div>
                <div class="mode-card" onclick="renderHistory()">
                    <h3>Riwayat Tes</h3>
                    <p>Pantau progres dari seluruh skor Try Out dan Latihan yang telah Anda selesaikan.</p>
                </div>
            </div>
        </div>
    `;
}

// ----------------- TRAINING MODE ----------------- //
function renderTrainingSetup() {
    appDiv.innerHTML = `
        ${renderHeader()}
        <div class="page active">
            <h2>Setup Training Mode</h2>
            <p>Pilih subtes yang ingin dilatih. Anda akan diberikan 5 butir soal tanpa batas waktu.</p>
            <div class="setup-container">
                <div class="options-grid">
                    ${SUBTESTS.map(st => `
                        <div class="option-card" onclick="startTraining('${st.id}')">
                            <h4>${st.name}</h4>
                            <p>Tipe: ${st.type} &bull; Soal: 5 Item</p>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-secondary" onclick="renderDashboard()">Kembali ke Dashboard</button>
            </div>
        </div>
    `;
}

function startTraining(subtestId) {
    const stConfig = SUBTESTS.find(s => s.id === subtestId);
    let availableQs = mockQuestions.filter(q => q.subtestId === subtestId);
    
    availableQs.sort(() => 0.5 - Math.random());
    const selectedQs = availableQs.slice(0, 5);
    
    const examQuestions = selectedQs.map(q => ({
        ...q,
        userAnswer: null
    }));

    activeExam = {
        mode: 'Training',
        startTime: Date.now(),
        subtestsQueue: [{ config: stConfig, questions: examQuestions }],
        currentSubtestIndex: 0,
        currentQuestionIndex: 0,
        isFinished: false,
        timerInterval: null
    };

    renderExam();
}

// ----------------- TRY OUT MODE ----------------- //
function renderTOSetup() {
    appDiv.innerHTML = `
        ${renderHeader()}
        <div class="page active">
            <h2>Persiapan Try Out Akbar</h2>
            <div class="glass-panel" style="padding: 2rem; max-width: 800px; width: 100%; text-align: left;">
                <h3 style="margin-bottom: 1rem;">Sistem Pengujian Aktual 2025</h3>
                <ul style="margin-bottom: 1.5rem; line-height: 1.6; padding-left: 1.2rem; color: var(--text-secondary);">
                    <li>Setiap siswa akan mendapatkan paket soal diacak.</li>
                    <li>Sistem ini <b>mengacak urutan subtes</b> secara individual.</li>
                    <li>Seluruh Tes Potensi Skolastik (TPS) akan dikerjakan terlebih dahulu, dilanjutkan dengan Tes Literasi (TL).</li>
                    <li>Waktu akan berjalan otomatis untuk masing-masing subtes.</li>
                </ul>
                <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                    <button class="btn btn-secondary" onclick="renderDashboard()">Batal</button>
                    <button class="btn" onclick="startTO()">Start Try Out</button>
                </div>
            </div>
        </div>
    `;
}

function startTO() {
    let tps = SUBTESTS.filter(s => s.type === 'TPS');
    let tl = SUBTESTS.filter(s => s.type === 'TL');

    tps.sort(() => 0.5 - Math.random());
    tl.sort(() => 0.5 - Math.random());

    const queueConfig = [...tps, ...tl];
    
    const subtestsQueue = queueConfig.map(st => {
        let qs = mockQuestions.filter(q => q.subtestId === st.id);
        qs.sort(() => 0.5 - Math.random());
        qs = qs.slice(0, st.numQuestions);
        return {
            config: st,
            questions: qs.map(q => ({ ...q, userAnswer: null })),
            remainingSeconds: st.duration * 60
        };
    });

    activeExam = {
        mode: 'TryOut',
        startTime: Date.now(),
        subtestsQueue: subtestsQueue.filter(s => s.questions.length > 0),
        currentSubtestIndex: 0,
        currentQuestionIndex: 0,
        isFinished: false,
        timerInterval: null
    };

    if(activeExam.subtestsQueue.length > 0) {
        startTimer();
    }
    
    renderExam();
}

// ----------------- EXAM INTERFACE ----------------- //

function startTimer() {
    if(activeExam.mode === 'Training') return;

    if(activeExam.timerInterval) clearInterval(activeExam.timerInterval);
    
    activeExam.timerInterval = setInterval(() => {
        let currentBlock = activeExam.subtestsQueue[activeExam.currentSubtestIndex];
        currentBlock.remainingSeconds--;
        
        let timerEl = document.getElementById('exam-timer');
        if(timerEl) {
            let m = Math.floor(currentBlock.remainingSeconds / 60);
            let s = currentBlock.remainingSeconds % 60;
            timerEl.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
        
        if(currentBlock.remainingSeconds <= 0) {
            clearInterval(activeExam.timerInterval);
            finishCurrentSubtest();
        }
    }, 1000);
}

function setAnswer(ansId) {
    let sub = activeExam.subtestsQueue[activeExam.currentSubtestIndex];
    let q = sub.questions[activeExam.currentQuestionIndex];
    q.userAnswer = ansId;
    renderExamContentOnly();
    renderSidebarOnly();
}

function renderSidebarOnly() {
    let sub = activeExam.subtestsQueue[activeExam.currentSubtestIndex];
    let html = '';
    sub.questions.forEach((q, idx) => {
        let classes = 'q-box';
        if(idx === activeExam.currentQuestionIndex) classes += ' active';
        if(q.userAnswer) classes += ' answered';
        html += `<div class="${classes}" onclick="jumpQuestion(${idx})">${idx + 1}</div>`;
    });
    document.getElementById('sidebar-grid-container').innerHTML = html;
}

function renderExamContentOnly() {
    let sub = activeExam.subtestsQueue[activeExam.currentSubtestIndex];
    let q = sub.questions[activeExam.currentQuestionIndex];
    
    if(!q) {
        document.getElementById('exam-question-area').innerHTML = '<div style="padding: 2rem;">Pertanyaan tidak tersedia dalam database.</div>';
        return;
    }

    let optsHtml = q.options.map(opt => {
        let isSel = (q.userAnswer === opt.id) ? 'selected' : '';
        return `
            <label class="answer-label ${isSel}">
                <input type="radio" name="q_opt" value="${opt.id}" ${isSel ? 'checked' : ''} onchange="setAnswer('${opt.id}')">
                <span style="font-weight:600; width: 30px;">${opt.id}.</span> <span>${opt.text}</span>
            </label>
        `;
    }).join('');

    document.getElementById('exam-question-area').innerHTML = `
        <div class="question-header">${sub.config.name} (Soal ${activeExam.currentQuestionIndex + 1} dari ${sub.questions.length})</div>
        <div class="question-text">${q.text}</div>
        <div class="answers">${optsHtml}</div>
    `;

    document.getElementById('btn-prev').disabled = activeExam.currentQuestionIndex === 0;
    
    const isLastQ = activeExam.currentQuestionIndex === (sub.questions.length - 1);
    const isLastSubtest = activeExam.currentSubtestIndex === (activeExam.subtestsQueue.length - 1);
    
    let nextBtn = document.getElementById('btn-next');
    if(isLastQ) {
        if(isLastSubtest) {
            nextBtn.textContent = 'Selesai Ujian';
            nextBtn.onclick = finishExam;
            nextBtn.className = 'btn';
        } else {
            nextBtn.textContent = 'Subtes Berikutnya';
            nextBtn.onclick = finishCurrentSubtest;
            nextBtn.className = 'btn';
        }
    } else {
        nextBtn.textContent = 'Selanjutnya';
        nextBtn.onclick = nextQuestion;
        nextBtn.className = 'btn btn-secondary';
    }
}

function jumpQuestion(idx) {
    activeExam.currentQuestionIndex = idx;
    renderExamContentOnly();
    renderSidebarOnly();
}
function nextQuestion() {
    let sub = activeExam.subtestsQueue[activeExam.currentSubtestIndex];
    if(activeExam.currentQuestionIndex < sub.questions.length - 1) {
        activeExam.currentQuestionIndex++;
        renderExamContentOnly();
        renderSidebarOnly();
    }
}
function prevQuestion() {
    if(activeExam.currentQuestionIndex > 0) {
        activeExam.currentQuestionIndex--;
        renderExamContentOnly();
        renderSidebarOnly();
    }
}

function finishCurrentSubtest() {
    if(activeExam.currentSubtestIndex < activeExam.subtestsQueue.length - 1) {
        activeExam.currentSubtestIndex++;
        activeExam.currentQuestionIndex = 0;
        if(activeExam.mode === 'TryOut') {
            startTimer();
        }
        renderExam();
    } else {
        finishExam();
    }
}

function finishExam() {
    if(activeExam.timerInterval) clearInterval(activeExam.timerInterval);
    activeExam.isFinished = true;
    calculateScores();
    renderResults();
}

function calculateScores() {
    activeExam.results = [];
    let totalScore = 0;
    
    activeExam.subtestsQueue.forEach(sub => {
        let correctCount = 0;
        sub.questions.forEach(q => {
            let difficultyWeight = Math.random() * 20 + 10;
            // Evaluasi jawaban
            if(q.userAnswer === q.correctOption) {
                correctCount += difficultyWeight;
            } else if (q.userAnswer) {
                // partial points for simulation logic? No, zero for wrong.
            }
        });
        
        let normalized = 200 + (correctCount * 12); 
        if(normalized > 1000) normalized = 1000;
        if(normalized < 200) normalized = isNaN(normalized) ? 200 : 250 + Math.random()*50;
        
        normalized = Math.round(normalized);

        activeExam.results.push({
            subtestName: sub.config.name,
            score: normalized
        });
        totalScore += normalized;
    });

    activeExam.finalAverage = activeExam.results.length ? Math.round(totalScore / activeExam.results.length) : 0;

    historyList.push({
        id: Date.now(),
        date: new Date().toLocaleString('id-ID'),
        mode: activeExam.mode,
        results: activeExam.results,
        finalScore: activeExam.finalAverage
    });
    localStorage.setItem('ercavianUtbkHistory', JSON.stringify(historyList));
}

function renderExam() {
    if(!activeExam || activeExam.subtestsQueue.length === 0) {
        appDiv.innerHTML = `<div class="page active"><p>Soal tidak tersedia.</p><button class="btn" onclick="renderDashboard()">Kembali</button></div>`;
        return;
    }

    let sub = activeExam.subtestsQueue[activeExam.currentSubtestIndex];
    let timerHtml = '';
    
    if(activeExam.mode === 'TryOut') {
        let m = Math.floor(sub.remainingSeconds / 60);
        let s = sub.remainingSeconds % 60;
        timerHtml = `<div class="timer" id="exam-timer">${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}</div>`;
    } else {
        timerHtml = `<div class="timer" style="color: var(--text-secondary); font-size: 1rem;">Tanpa Waktu</div>`;
    }

    appDiv.innerHTML = `
        <div class="page active" style="align-items: flex-start; max-width: 1200px;">
            <div class="exam-header glass-panel">
                <div>
                    <h2 style="margin:0; font-size: 1.25rem;">${sub.config.name}</h2>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">Bagian ${activeExam.currentSubtestIndex + 1} dari ${activeExam.subtestsQueue.length} &bull; Mode: ${activeExam.mode}</div>
                </div>
                ${timerHtml}
            </div>

            <div class="exam-layout">
                <div class="sidebar-panel glass-panel">
                    <h3>Navigasi Soal</h3>
                    <div class="sidebar-grid" id="sidebar-grid-container"></div>
                </div>

                <div class="exam-content-panel glass-panel">
                    <div id="exam-question-area" style="min-height: 400px;"></div>
                    <div class="exam-footer">
                        <button class="btn btn-secondary" id="btn-prev" onclick="prevQuestion()" style="flex:0;">Kembali</button>
                        <button class="btn" id="btn-next" onclick="nextQuestion()" style="flex:0;">Selanjutnya</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    renderSidebarOnly();
    renderExamContentOnly();
}

// ----------------- RESULTS & HISTORY ----------------- //

function renderResults() {
    appDiv.innerHTML = `
        ${renderHeader()}
        <div class="page active">
            <h2>Hasil ${activeExam.mode === 'TryOut' ? 'Try Out' : 'Latihan'}</h2>
            <div class="glass-panel data-container" style="padding: 2rem; max-width: 700px; padding-bottom: 2rem;">
                ${activeExam.results.map(r => `
                    <div class="data-item" style="margin-bottom: 0.5rem; background: transparent; border-bottom: 1px solid var(--border-color); border-radius: 0;">
                        <h4>${r.subtestName}</h4>
                        <div class="score" style="font-size: 1.25rem;">${Math.round(r.score)}</div>
                    </div>
                `).join('')}
                
                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <button class="btn btn-secondary" onclick="renderDashboard()">Kembali Dashboard</button>
                    <button class="btn" onclick="renderReview()">Lihat Pembahasan Lengkap</button>
                </div>
            </div>
        </div>
    `;
}

function renderReview() {
    let html = `
        ${renderHeader()}
        <div class="page active" style="max-width: 1000px; padding-bottom: 4rem;">
            <h2>Pembahasan & Review Soal</h2>
            <p>Silakan tinjau jawaban Anda.</p>
            <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                <button class="btn btn-secondary" onclick="renderResults()">Kembali ke Skor</button>
                <button class="btn" onclick="renderDashboard()">Selesai & Ke Dashboard</button>
            </div>
    `;

    activeExam.subtestsQueue.forEach((sub) => {
        html += `<div class="glass-panel" style="width: 100%; padding: 2rem; display: flex; flex-direction: column; gap: 2rem; margin-bottom: 2rem;">
                 <h3 style="border-bottom: 2px solid var(--border-color); padding-bottom: 1rem;">${sub.config.name}</h3>`;
        
        sub.questions.forEach((q, qIdx) => {
            let userAns = q.userAnswer || '-Kosong-';
            let correctAns = q.correctOption;
            let isCorrect = userAns === correctAns;
            
            let color = isCorrect ? '#16a34a' : '#dc2626';
            let badge = '';
            if(!q.userAnswer) { 
                color = '#737373'; 
                badge = '<span style="padding: 0.25rem 0.5rem; background: #e5e5e5; border-radius: 4px; color: #525252; font-size: 0.8rem;">KOSONG</span>'; 
            } else if (isCorrect) {
                badge = '<span style="padding: 0.25rem 0.5rem; background: #dcfce7; border-radius: 4px; color: #16a34a; font-size: 0.8rem;">BENAR</span>';
            } else {
                badge = '<span style="padding: 0.25rem 0.5rem; background: #fee2e2; border-radius: 4px; color: #dc2626; font-size: 0.8rem;">SALAH</span>';
            }

            html += `
                <div style="margin-bottom: 0; padding: 1.5rem; background: transparent; border: 1px solid var(--border-color); border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
                        <div style="font-weight: 500;">Soal ${qIdx + 1}</div>
                        <div>${badge}</div>
                    </div>
                    <div style="margin-bottom: 1.5rem; color: var(--text-primary); line-height: 1.6;">${q.text}</div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            `;

            q.options.forEach(opt => {
                let optBg = 'transparent';
                let optBorder = 'var(--border-color)';
                let optWeight = 'normal';
                
                if (opt.id === correctAns) {
                    optBg = '#dcfce7'; 
                    optBorder = '#22c55e';
                    optWeight = '600';
                } else if (opt.id === userAns && !isCorrect) {
                    optBg = '#fee2e2'; 
                    optBorder = '#ef4444';
                }
                
                html += `
                    <div style="padding: 1rem 1.25rem; background: ${optBg}; border: 1px solid ${optBorder}; border-radius: 6px; font-weight: ${optWeight}; color: var(--text-primary);">
                        <strong>${opt.id}.</strong> ${opt.text}
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    });

    html += `
            <button class="btn" style="width: auto; padding: 1rem 3rem;" onclick="renderDashboard()">Kembali ke Dashboard</button>
        </div>
    `;
    appDiv.innerHTML = html;
}

function renderHistory() {
    const listHtml = historyList.length === 0 
        ? '<div style="text-align:center; padding: 2rem; color: var(--text-secondary);">Belum ada riwayat simulasi.</div>'
        : historyList.slice().reverse().map(h => `
            <div class="data-item">
                <div class="left">
                    <h4>${h.mode === 'TryOut' ? 'Try Out Simulasi' : 'Training Mode'}</h4>
                    <div class="date">${h.date}</div>
                </div>
                <div class="score-box">
                    <div class="score">${h.finalScore || 'Selesai'}</div>
                    <div class="subtext">Skor Rata-rata</div>
                </div>
            </div>
        `).join('');

    appDiv.innerHTML = `
        ${renderHeader()}
        <div class="page active">
            <h2>Riwayat Evaluasi Simulasi Anda</h2>
            <div class="data-container">
                ${listHtml}
                <button class="btn btn-secondary" style="margin-top:1rem; width: auto; align-self: center;" onclick="renderDashboard()">Kembali ke Home</button>
            </div>
        </div>
    `;
}
