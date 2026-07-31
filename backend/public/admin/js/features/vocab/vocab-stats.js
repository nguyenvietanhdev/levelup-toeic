// ===================================
// VOCAB STATS MODULE
// Quick Delete, Vocab File Switcher, Activity Log
// ===================================

async function startQuickDelete() {
    const modal = document.getElementById("quick-delete-modal");
    const card = document.getElementById("quick-delete-card");
    const progress = document.getElementById("quick-delete-progress");

    quickDeleteData.allWords = [];
    quickDeleteData.currentIndex = 0;
    quickDeleteData.isRunning = true;
    quickDeleteData.deletedCount = 0;

    modal.style.display = "flex";
    card.innerHTML = `
        <div style="text-align: center;">
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; margin-bottom: 20px;"></i>
            <p style="font-size: 16px; opacity: 0.9;">Đang tải toàn bộ dữ liệu từ vựng...</p>
        </div>
    `;

    try {
        const res = await fetch(`${API_URL}/vocabulary?limit=100000&lang=${encodeURIComponent(vocabCurrentLang || 'en')}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.data)) {
            quickDeleteData.allWords = data.data;

            if (quickDeleteData.allWords.length === 0) {
                alert("Không có từ vựng nào để xóa!");
                stopQuickDelete();
                return;
            }

            progress.textContent = `0/${quickDeleteData.allWords.length}`;
            showNextWord();
        } else {
            alert("Lỗi khi tải dữ liệu từ vựng!");
            stopQuickDelete();
        }
    } catch (error) {
        console.error("Error loading vocabulary for quick delete:", error);
        alert("Lỗi kết nối: Không thể tải dữ liệu từ vựng!");
        stopQuickDelete();
    }
}

function showNextWord() {
    const { allWords, currentIndex } = quickDeleteData;
    const card = document.getElementById("quick-delete-card");
    const progress = document.getElementById("quick-delete-progress");
    const btnKeep = document.getElementById("btn-quick-delete-keep");
    const btnRemove = document.getElementById("btn-quick-delete-remove");

    if (currentIndex >= allWords.length) {
        finishQuickDelete();
        return;
    }

    const word = allWords[currentIndex];
    progress.textContent = `${currentIndex + 1}/${allWords.length}`;

    card.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; font-weight: bold; margin-bottom: 15px; text-shadow: 0 2px 10px rgba(0,0,0,0.2);">
                ${word.en || '-'}
            </div>
            ${word.phonetic ? `<div style="font-size: 18px; opacity: 0.9; margin-bottom: 20px;">/${word.phonetic}/</div>` : ''}
            <div style="background: rgba(255,255,255,0.2); border-radius: 12px; padding: 20px; margin-top: 20px;">
                <div style="font-size: 20px; margin-bottom: 10px;">
                    <strong>Vietnamese:</strong> ${word.vn || '-'}
                </div>
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                ${word.type ? `<span style="background: rgba(255,255,255,0.3); padding: 6px 12px; border-radius: 20px; font-size: 12px;">${word.type}</span>` : ''}
                ${word.part ? `<span style="background: rgba(255,255,255,0.3); padding: 6px 12px; border-radius: 20px; font-size: 12px;">${word.part}</span>` : ''}
            </div>
        </div>
    `;

    btnKeep.onclick = () => handleQuickDeleteKeep();
    btnRemove.onclick = () => handleQuickDeleteRemove(word.en);
}

function handleQuickDeleteKeep() {
    quickDeleteData.currentIndex++;
    showNextWord();
}

async function handleQuickDeleteRemove(wordEn) {
    const card = document.getElementById("quick-delete-card");

    card.innerHTML = `
        <div style="text-align: center;">
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; margin-bottom: 20px;"></i>
            <p style="font-size: 16px; opacity: 0.9;">Đang xóa từ <strong>${wordEn}</strong>...</p>
        </div>
    `;

    try {
        const res = await fetch(withVocabLang(`${API_URL}/vocabulary/${encodeURIComponent(wordEn)}`), {
            method: "DELETE",
        });

        const data = await res.json();

        if (data.success) {
            quickDeleteData.deletedCount++;
            quickDeleteData.allWords.splice(quickDeleteData.currentIndex, 1);
            showNextWord();
        } else {
            alert(`Lỗi khi xóa từ "${wordEn}": ${data.message || 'Unknown error'}`);
            quickDeleteData.currentIndex++;
            showNextWord();
        }
    } catch (error) {
        console.error("Error deleting word:", error);
        alert(`Lỗi kết nối khi xóa từ "${wordEn}"`);
        quickDeleteData.currentIndex++;
        showNextWord();
    }
}

function finishQuickDelete() {
    const card = document.getElementById("quick-delete-card");
    const { deletedCount } = quickDeleteData;

    card.innerHTML = `
        <div style="text-align: center;">
            <i class="fas fa-check-circle" style="font-size: 64px; margin-bottom: 20px; color: #10b981;"></i>
            <h3 style="font-size: 24px; margin-bottom: 10px;">Hoàn thành!</h3>
            <p style="font-size: 16px; opacity: 0.9;">
                Đã xóa <strong>${deletedCount}</strong> từ vựng
            </p>
            <button id="qd-done-btn"
                style="
                    margin-top: 20px;
                    padding: 12px 30px;
                    background: white;
                    color: #667eea;
                    border: none;
                    border-radius: 10px;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 14px;
                "
            >
                <i class="fas fa-sync"></i> Tải lại Dashboard
            </button>
        </div>
    `;

    document.getElementById('qd-done-btn')?.addEventListener('click', () => { stopQuickDelete(); loadDashboard(); });
    quickDeleteData.isRunning = false;
}

function stopQuickDelete() {
    const modal = document.getElementById("quick-delete-modal");
    modal.style.display = "none";
    quickDeleteData.isRunning = false;

    if (quickDeleteData.deletedCount > 0) {
        setTimeout(() => {
            loadVocabulary(vocabCurrentPage, vocabCurrentPart);
            loadVocabularyStats();
            loadRecentActivities();
        }, 100);
    }
}

async function loadVocabularyStats() { /* stats loaded via dashboard summary */ }

async function loadAvailableFiles() {
    const pickerBtn   = document.getElementById('vocab-file-picker-btn');
    const pickerLabel = document.getElementById('vocab-file-picker-label');
    const pickerCards = document.getElementById('vocab-picker-cards');

    if (pickerCards) {
        pickerCards.innerHTML = '<div class="vocab-picker-loading"><i class="fas fa-spinner fa-spin"></i> Đang quét thư mục...</div>';
    }
    if (pickerBtn) pickerBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/vocabulary/files?lang=${encodeURIComponent(vocabCurrentLang || 'en')}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data.success || !data.data?.length) {
            if (pickerCards) pickerCards.innerHTML = '<div class="vocab-picker-loading">Không tìm thấy file nào</div>';
            return;
        }

        if (pickerCards) {
            pickerCards.innerHTML = '';
            const allCard = document.createElement('div');
            allCard.className = `vocab-picker-card${!vocabCurrentSource ? ' active' : ''}`;
            allCard.dataset.source = '';
            allCard.innerHTML = `
                <div class="vocab-picker-card-left">
                    <div class="vocab-picker-card-name">Tất cả</div>
                    <div class="vocab-picker-card-count"><i class="fas fa-book-open" style="font-size:10px;margin-right:3px;"></i>Toàn bộ database</div>
                </div>
                <div class="vocab-picker-card-check"><i class="fas fa-check"></i></div>`;
            allCard.addEventListener('click', () => switchVocabSource('', 'Tất cả', allCard, pickerCards, pickerLabel));
            pickerCards.appendChild(allCard);

            data.data.forEach(file => {
                if (!file.source) return;
                const isActive = file.source === vocabCurrentSource;
                if (isActive && pickerLabel) pickerLabel.textContent = file.displayName || file.source;

                const card = document.createElement('div');
                card.className = `vocab-picker-card${isActive ? ' active' : ''}`;
                card.dataset.source = file.source;
                card.innerHTML = `
                    <div class="vocab-picker-card-left">
                        <div class="vocab-picker-card-name">${file.displayName || file.source}</div>
                        <div class="vocab-picker-card-count"><i class="fas fa-book-open" style="font-size:10px;margin-right:3px;"></i>${file.wordCount.toLocaleString()} từ</div>
                    </div>
                    <div class="vocab-picker-card-check"><i class="fas fa-check"></i></div>`;
                card.addEventListener('click', () => switchVocabSource(file.source, file.displayName || file.source, card, pickerCards, pickerLabel));
                pickerCards.appendChild(card);
            });

            if (!vocabCurrentSource && pickerLabel) pickerLabel.textContent = 'Tất cả';
        }
    } catch (err) {
        console.error('Error loading available files:', err);
        if (pickerCards) pickerCards.innerHTML = '<div class="vocab-picker-loading">⚠ Không thể tải danh sách file</div>';
    } finally {
        if (pickerBtn) pickerBtn.disabled = false;
    }
}

async function switchVocabSource(source, label, clickedCard, pickerCards, pickerLabel) {
    const dropdown = document.getElementById('vocab-file-picker-dropdown');
    if (dropdown) dropdown.style.display = 'none';

    pickerCards.querySelectorAll('.vocab-picker-card').forEach(c => c.classList.remove('active'));
    clickedCard.classList.add('active');
    if (pickerLabel) pickerLabel.textContent = label;

    vocabCurrentSource = source;
    vocabCurrentPart = '';
    vocabCurrentPage = 1;
    vocabSearchTerm = '';

    const searchInput = document.getElementById('vocab-search');
    if (searchInput) searchInput.value = '';

    await loadVocabulary(1, '', source);
    await loadVocabularyStats();
    updateLocalPartFilter();
}

async function switchVocabularyFile(filename) {
    if (!filename || filename === currentVocabFile) return;

    const selector = document.getElementById('vocab-file-selector');

    try {
        selector.disabled = true;

        console.log(`📂 Loading local file: ${filename}`);
        await loadLocalVocabulary(filename);

        initSimpleSearch();

        currentVocabFile = filename;
        currentLocalFile = filename;
        displayLocalVocabulary();

        try {
            const res = await fetch(withVocabLang(`${API_URL}/vocabulary/switch/${encodeURIComponent(filename)}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await res.json();

            if (data.success) {
                currentVocabFile = filename;
                currentLocalFile = filename;
                updateCurrentFileDisplay();

                await loadVocabulary(1, '');
                await loadVocabularyStats();
                await initializeVocabFilters();
                if (typeof initVocabExtraFilters === 'function') await initVocabExtraFilters();
            }
        } catch (apiError) {
            console.warn('API not available, using local data:', apiError.message);
            isOfflineMode = true;
            currentVocabFile = filename;
            currentLocalFile = filename;
            updateCurrentFileDisplay();
            displayLocalVocabulary();
            updateLocalStats();
            updateLocalPartFilter();
        }
    } catch (error) {
        console.error('Error switching file:', error);
        alert(`❌ Lỗi: ${error.message}`);
        selector.value = currentVocabFile;
    } finally {
        selector.disabled = false;
    }
}

function updateCurrentFileDisplay() {
    const display = document.getElementById('current-vocab-file');
    if (display) {
        display.textContent = currentVocabFile;
    }
}

async function loadRecentActivities() {
    const container = document.getElementById('recent-activity-container');

    try {
        const res = await fetch(`${API_URL}/activities?limit=15`);
        const data = await res.json();

        if (data.success && data.data && data.data.length > 0) {
            displayRecentActivities(data.data);
        } else {
            container.innerHTML = `
                <div style="text-align: center; color: #999; padding: 20px; font-size: 13px;">
                    <i class="fas fa-info-circle"></i> Chưa có hoạt động nào được ghi nhận
                </div>
            `;
        }
    } catch (error) {
        console.error("Error loading recent activities:", error);
        if (container) container.innerHTML = `
            <div style="text-align: center; color: #e74c3c; padding: 20px; font-size: 13px;">
                <i class="fas fa-exclamation-triangle"></i> Không thể tải lịch sử hoạt động
            </div>
        `;
    }
}

function displayRecentActivities(activities) {
    const container = document.getElementById('recent-activity-container');
    if (!container) return;

    const getActivityIcon = (type, action) => {
        if (type === 'vocabulary') {
            if (action === 'add') return { icon: 'fa-plus-circle', color: '#10b981' };
            if (action === 'update') return { icon: 'fa-edit', color: '#3b82f6' };
            if (action === 'delete') return { icon: 'fa-trash', color: '#ef4444' };
        } else if (type === 'user') {
            if (action === 'add') return { icon: 'fa-user-plus', color: '#10b981' };
            if (action === 'update') return { icon: 'fa-user-edit', color: '#3b82f6' };
            if (action === 'delete') return { icon: 'fa-user-minus', color: '#ef4444' };
        }
        return { icon: 'fa-info-circle', color: '#999' };
    };

    const getActionText = (type, action, data) => {
        if (type === 'vocabulary') {
            const word = data.word || 'từ vựng';
            const part = data.part ? ` (${data.part})` : '';
            if (action === 'add') return `Thêm từ <strong>${word}</strong>${part}`;
            if (action === 'update') return `Cập nhật từ <strong>${word}</strong>${part}`;
            if (action === 'delete') return `Xóa từ <strong>${word}</strong>${part}`;
        } else if (type === 'user') {
            const username = data.username || 'người dùng';
            const role = data.role ? ` (${data.role})` : '';
            if (action === 'add') return `Thêm tài khoản <strong>${username}</strong>${role}`;
            if (action === 'update') return `Cập nhật tài khoản <strong>${username}</strong>${role}`;
            if (action === 'delete') return `Xóa tài khoản <strong>${username}</strong>${role}`;
        }
        return 'Hoạt động không xác định';
    };

    const getTimeAgo = (timestamp) => {
        const now = new Date();
        const then = new Date(timestamp);
        const seconds = Math.floor((now - then) / 1000);

        if (seconds < 60) return 'vừa xong';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
        return `${Math.floor(seconds / 86400)} ngày trước`;
    };

    let html = '<div style="font-size: 13px;">';

    activities.forEach((activity, index) => {
        const { icon, color } = getActivityIcon(activity.type, activity.action);
        const actionText = getActionText(activity.type, activity.action, activity.data);
        const timeAgo = getTimeAgo(activity.timestamp);

        html += `
            <div style="
                padding: 10px 12px;
                border-bottom: 1px solid #f0f0f0;
                transition: background 0.2s;
                ${index === activities.length - 1 ? 'border-bottom: none;' : ''}
            "
            onmouseover="this.style.background='#f8f9fa'"
            onmouseout="this.style.background='transparent'">
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <div style="flex-shrink: 0; margin-top: 2px;">
                        <i class="fas ${icon}" style="color: ${color}; font-size: 16px;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="color: #333; line-height: 1.4; margin-bottom: 3px;">
                            ${actionText}
                        </div>
                        <div style="color: #999; font-size: 11px; display: flex; align-items: center; gap: 8px;">
                            <span><i class="fas fa-clock" style="font-size: 10px;"></i> ${timeAgo}</span>
                            ${activity.admin ? `<span><i class="fas fa-user-shield" style="font-size: 10px;"></i> ${activity.admin}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}
