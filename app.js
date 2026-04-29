/* ============================================
   GSC VIP MANAGER - APP.JS (FIXED VERSION)
   ============================================ */

// ===== CONFIG =====
const CONFIG = {
    CORS_PROXY: 'https://api.allorigins.win/raw?url=',
    SCOPES: 'https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters.readonly',
    TOKEN_URL: 'https://oauth2.googleapis.com/token',
    INDEXING_API: 'https://indexing.googleapis.com/v3/urlNotifications:publish',
    INSPECTION_API: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    DAILY_LIMIT: 200,
    DELAY_BETWEEN_REQUESTS: 1200
};

let STATE = {
    serviceAccount: null,
    accessToken: null,
    tokenExpiry: 0,
    urls: [],
    quotaUsed: 0,
    quotaDate: new Date().toDateString()
};

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(message, type = 'info') {
    const container = $('logContainer');
    const time = new Date().toLocaleTimeString('id-ID');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
    container.insertBefore(entry, container.firstChild);
    while (container.children.length > 100) container.removeChild(container.lastChild);
    console.log(`[${type.toUpperCase()}]`, message);
}

function proxyUrl(url) {
    return CONFIG.CORS_PROXY + encodeURIComponent(url);
}

function generateId() {
    return 'url_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function saveState() {
    localStorage.setItem('gsc_urls', JSON.stringify(STATE.urls));
    localStorage.setItem('gsc_quota', JSON.stringify({ used: STATE.quotaUsed, date: STATE.quotaDate }));
}

function loadState() {
    try {
        const urls = localStorage.getItem('gsc_urls');
        if (urls) STATE.urls = JSON.parse(urls);
        const quota = localStorage.getItem('gsc_quota');
        if (quota) {
            const q = JSON.parse(quota);
            if (q.date === new Date().toDateString()) {
                STATE.quotaUsed = q.used;
                STATE.quotaDate = q.date;
            } else {
                STATE.quotaUsed = 0;
                STATE.quotaDate = new Date().toDateString();
                saveState();
            }
        }
    } catch (e) {
        log('Failed to load state: ' + e.message, 'error');
    }
}

function updateQuotaUI() {
    const percent = (STATE.quotaUsed / CONFIG.DAILY_LIMIT) * 100;
    $('quotaBar').style.width = Math.min(percent, 100) + '%';
    $('quotaUsed').textContent = STATE.quotaUsed;
    $('quotaLimit').textContent = CONFIG.DAILY_LIMIT;
}

function incrementQuota() {
    STATE.quotaUsed++;
    saveState();
    updateQuotaUI();
}

function checkQuota() {
    if (STATE.quotaUsed >= CONFIG.DAILY_LIMIT) {
        log('Daily quota limit reached!', 'error');
        return false;
    }
    return true;
}

// ===== JWT + ACCESS TOKEN =====
async function getAccessToken() {
    if (!STATE.serviceAccount) throw new Error('Service Account JSON belum diupload!');
    if (STATE.accessToken && Date.now() < STATE.tokenExpiry - 60000) return STATE.accessToken;
    
    log('Generating Access Token via JWT RS256...', 'info');
    
    if (typeof KJUR === 'undefined') {
        throw new Error('Library jsrsasign belum ter-load. Refresh halaman!');
    }
    
    const header = { alg: 'RS256', typ: 'JWT', kid: STATE.serviceAccount.private_key_id };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: STATE.serviceAccount.client_email,
        scope: CONFIG.SCOPES,
        aud: CONFIG.TOKEN_URL,
        exp: now + 3600,
        iat: now
    };
    
    const jwt = KJUR.jws.JWS.sign('RS256', JSON.stringify(header), JSON.stringify(payload), STATE.serviceAccount.private_key);
    log('JWT signed successfully', 'success');
    
    const response = await fetch(proxyUrl(CONFIG.TOKEN_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error('Token request failed: ' + err);
    }
    
    const data = await response.json();
    STATE.accessToken = data.access_token;
    STATE.tokenExpiry = Date.now() + (data.expires_in * 1000);
    log('Access Token OK ✅', 'success');
    return STATE.accessToken;
}

// ===== UPLOAD HANDLER (FIXED & VERBOSE) =====
$('jsonFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    log(`📂 File: ${file.name} (${file.size} bytes)`, 'info');
    
    try {
        const text = await file.text();
        log('✅ File terbaca', 'info');
        
        let json;
        try {
            json = JSON.parse(text);
        } catch (parseErr) {
            throw new Error('JSON tidak valid: ' + parseErr.message);
        }
        log(`✅ JSON valid. Fields: ${Object.keys(json).join(', ')}`, 'info');
        
        if (json.type !== 'service_account') {
            throw new Error(`Type harus "service_account", ditemukan: "${json.type}"`);
        }
        if (!json.private_key) throw new Error('Field "private_key" tidak ada!');
        if (!json.client_email) throw new Error('Field "client_email" tidak ada!');
        
        if (typeof KJUR === 'undefined') {
            throw new Error('jsrsasign gagal load. Cek koneksi internet & refresh!');
        }
        log('✅ jsrsasign ready', 'info');
        
        STATE.serviceAccount = json;
        STATE.accessToken = null;
        
        const status = $('authStatus');
        status.className = 'status-text success';
        status.innerHTML = `✅ Loaded: <strong>${json.client_email}</strong>`;
        log(`Service Account: ${json.client_email}`, 'success');
        
        log('🔄 Testing token generation...', 'info');
        await getAccessToken();
        log('🎉 Authentication berhasil! Siap pakai.', 'success');
        
    } catch (err) {
        const status = $('authStatus');
        status.className = 'status-text error';
        status.innerHTML = `❌ ${err.message}`;
        log('❌ ERROR: ' + err.message, 'error');
        console.error('Full error:', err);
        STATE.serviceAccount = null;
        alert('Error: ' + err.message);
    }
});

// ===== API CALLS =====
async function submitToIndexing(url, type = 'URL_UPDATED') {
    if (!checkQuota()) throw new Error('Quota exceeded');
    const token = await getAccessToken();
    const response = await fetch(proxyUrl(CONFIG.INDEXING_API), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, type: type })
    });
    incrementQuota();
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return await response.json();
}

async function inspectUrl(url) {
    if (!checkQuota()) throw new Error('Quota exceeded');
    const token = await getAccessToken();
    const urlObj = new URL(url);
    const siteUrl = urlObj.origin + '/';
    const response = await fetch(proxyUrl(CONFIG.INSPECTION_API), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: siteUrl })
    });
    incrementQuota();
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    const data = await response.json();
    const verdict = data.inspectionResult?.indexStatusResult?.verdict || 'UNKNOWN';
    const coverageState = data.inspectionResult?.indexStatusResult?.coverageState || '';
    return { verdict, coverage: coverageState, isIndexed: verdict === 'PASS' };
}

async function removeUrlFromIndex(url) {
    return await submitToIndexing(url, 'URL_DELETED');
}

// ===== TABLE =====
function addUrlToTable(url) {
    if (STATE.urls.find(u => u.url === url)) {
        log(`URL sudah ada: ${url}`, 'warning');
        return null;
    }
    const item = {
        id: generateId(), url: url,
        apiStatus: 'pending', apiMessage: 'Belum disubmit',
        indexStatus: 'pending', indexMessage: 'Belum dicek',
        timestamp: Date.now()
    };
    STATE.urls.push(item);
    saveState();
    renderTable();
    return item;
}

function updateUrlItem(id, updates) {
    const item = STATE.urls.find(u => u.id === id);
    if (!item) return;
    Object.assign(item, updates);
    saveState();
    renderTable();
}

function deleteUrl(id) {
    STATE.urls = STATE.urls.filter(u => u.id !== id);
    saveState();
    renderTable();
}

function renderTable() {
    const tbody = $('tableBody');
    if (STATE.urls.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No URLs added yet.</td></tr>`;
        updateStats();
        return;
    }
    tbody.innerHTML = STATE.urls.map((item, idx) => `
        <tr data-id="${item.id}">
            <td>${idx + 1}</td>
            <td class="url-cell"><a href="${item.url}" target="_blank">${item.url}</a></td>
            <td>${renderApiPill(item)}</td>
            <td>${renderIndexPill(item)}</td>
            <td><div class="action-buttons">
                <button class="btn-icon" onclick="checkSingleUrl('${item.id}')">🔍</button>
                <button class="btn-icon" onclick="resubmitUrl('${item.id}')">📤</button>
                <button class="btn-icon delete" onclick="deleteUrl('${item.id}')">🗑️</button>
            </div></td>
        </tr>
    `).join('');
    updateStats();
}

function renderApiPill(item) {
    const map = {
        'success': `<span class="status-pill pill-success">✅ Success</span>`,
        'error': `<span class="status-pill pill-danger" title="${item.apiMessage}">❌ Error</span>`,
        'pending': `<span class="status-pill pill-pending">⏳ Pending</span>`,
        'loading': `<span class="status-pill pill-warning loading">⏳ Processing</span>`
    };
    return map[item.apiStatus] || map.pending;
}

function renderIndexPill(item) {
    const map = {
        'indexed': `<span class="status-pill pill-success">TERINDEX ✅</span>`,
        'not_indexed': `<span class="status-pill pill-danger">BELUM TERINDEX ❌</span>`,
        'pending': `<span class="status-pill pill-pending">⏳ Belum Dicek</span>`,
        'loading': `<span class="status-pill pill-warning loading">🔍 Checking</span>`,
        'error': `<span class="status-pill pill-danger" title="${item.indexMessage}">⚠️ Error</span>`
    };
    return map[item.indexStatus] || map.pending;
}

function updateStats() {
    $('statTotal').textContent = STATE.urls.length;
    $('statIndexed').textContent = STATE.urls.filter(u => u.indexStatus === 'indexed').length;
    $('statNotIndexed').textContent = STATE.urls.filter(u => u.indexStatus === 'not_indexed').length;
    $('statPending').textContent = STATE.urls.filter(u => u.indexStatus === 'pending').length;
}

window.checkSingleUrl = async function(id) {
    const item = STATE.urls.find(u => u.id === id);
    if (!item) return;
    if (!STATE.serviceAccount) return alert('Upload JSON dulu!');
    updateUrlItem(id, { indexStatus: 'loading' });
    try {
        const result = await inspectUrl(item.url);
        updateUrlItem(id, {
            indexStatus: result.isIndexed ? 'indexed' : 'not_indexed',
            indexMessage: result.coverage || result.verdict
        });
        log(`${item.url} → ${result.isIndexed ? 'TERINDEX ✅' : 'BELUM TERINDEX ❌'}`, result.isIndexed ? 'success' : 'warning');
    } catch (err) {
        updateUrlItem(id, { indexStatus: 'error', indexMessage: err.message });
        log(`Error: ${err.message}`, 'error');
    }
};

window.resubmitUrl = async function(id) {
    const item = STATE.urls.find(u => u.id === id);
    if (!item) return;
    if (!STATE.serviceAccount) return alert('Upload JSON dulu!');
    updateUrlItem(id, { apiStatus: 'loading' });
    try {
        await submitToIndexing(item.url, 'URL_UPDATED');
        updateUrlItem(id, { apiStatus: 'success', apiMessage: 'Submitted' });
        log(`Submitted: ${item.url}`, 'success');
    } catch (err) {
        updateUrlItem(id, { apiStatus: 'error', apiMessage: err.message });
        log(`Submit error: ${err.message}`, 'error');
    }
};

window.deleteUrl = deleteUrl;

// ===== EVENT HANDLERS =====
$('submitManualBtn').addEventListener('click', async () => {
    const url = $('manualUrl').value.trim();
    if (!url) return alert('Masukkan URL!');
    if (!STATE.serviceAccount) return alert('Upload JSON dulu!');
    const item = addUrlToTable(url);
    if (!item) return;
    $('manualUrl').value = '';
    await window.resubmitUrl(item.id);
});

$('loadSitemapBtn').addEventListener('click', async () => {
    const sitemapUrl = $('sitemapUrl').value.trim();
    if (!sitemapUrl) return alert('Masukkan URL sitemap!');
    log(`Loading sitemap: ${sitemapUrl}`, 'info');
    try {
        const response = await fetch(proxyUrl(sitemapUrl));
        if (!response.ok) throw new Error('Failed to fetch');
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const sitemapElements = xmlDoc.querySelectorAll('sitemap > loc');
        let allUrls = [];
        if (sitemapElements.length > 0) {
            log(`Sitemap index detected: ${sitemapElements.length} sub-sitemaps`, 'info');
            for (const loc of sitemapElements) {
                try {
                    const subResp = await fetch(proxyUrl(loc.textContent.trim()));
                    const subText = await subResp.text();
                    const subDoc = parser.parseFromString(subText, 'text/xml');
                    subDoc.querySelectorAll('url > loc').forEach(u => allUrls.push(u.textContent.trim()));
                } catch (e) {
                    log(`Sub-sitemap error: ${e.message}`, 'error');
                }
            }
        } else {
            xmlDoc.querySelectorAll('url > loc').forEach(u => allUrls.push(u.textContent.trim()));
        }
        if (allUrls.length === 0) return log('Tidak ada URL ditemukan', 'warning');
        let added = 0;
        allUrls.forEach(url => { if (addUrlToTable(url)) added++; });
        log(`Sitemap loaded: ${added} URL baru (${allUrls.length} total)`, 'success');
        $('sitemapUrl').value = '';
    } catch (err) {
        log(`Sitemap error: ${err.message}`, 'error');
        alert('Error: ' + err.message);
    }
});

$('removeUrlBtn').addEventListener('click', async () => {
    const url = $('removeUrl').value.trim();
    if (!url) return alert('Masukkan URL!');
    if (!STATE.serviceAccount) return alert('Upload JSON dulu!');
    if (!confirm(`Hapus dari index?\n${url}`)) return;
    log(`Removing: ${url}`, 'warning');
    try {
        await removeUrlFromIndex(url);
        log(`Removed: ${url}`, 'success');
        alert('Removal request berhasil!');
        $('removeUrl').value = '';
    } catch (err) {
        log(`Removal error: ${err.message}`, 'error');
        alert('Error: ' + err.message);
    }
});

$('scanAllBtn').addEventListener('click', async () => {
    if (!STATE.serviceAccount) return alert('Upload JSON dulu!');
    if (STATE.urls.length === 0) return alert('Tabel kosong!');
    if (!confirm(`Scan ${STATE.urls.length} URL?`)) return;
    const btn = $('scanAllBtn');
    btn.disabled = true;
    const total = STATE.urls.length;
    let processed = 0;
    showProgress('Scanning Index Status', total);
    log(`=== Scan started: ${total} URLs ===`, 'info');
    for (const item of STATE.urls) {
        if (!checkQuota()) break;
        updateUrlItem(item.id, { indexStatus: 'loading' });
        try {
            const result = await inspectUrl(item.url);
            updateUrlItem(item.id, {
                indexStatus: result.isIndexed ? 'indexed' : 'not_indexed',
                indexMessage: result.coverage || result.verdict
            });
            log(`[${processed + 1}/${total}] ${result.isIndexed ? 'TERINDEX ✅' : 'BELUM ❌'} - ${item.url}`, result.isIndexed ? 'success' : 'warning');
        } catch (err) {
            updateUrlItem(item.id, { indexStatus: 'error', indexMessage: err.message });
            log(`[${processed + 1}/${total}] Error: ${err.message}`, 'error');
        }
        processed++;
        updateProgress(processed, total);
        await sleep(CONFIG.DELAY_BETWEEN_REQUESTS);
    }
    hideProgress();
    btn.disabled = false;
    log(`=== Scan complete: ${processed}/${total} ===`, 'success');
    alert(`Selesai! ${processed} URL diperiksa.`);
});

$('submitAllBtn').addEventListener('click', async () => {
    if (!STATE.serviceAccount) return alert('Upload JSON dulu!');
    if (STATE.urls.length === 0) return alert('Tabel kosong!');
    if (!confirm(`Submit ${STATE.urls.length} URL?`)) return;
    const btn = $('submitAllBtn');
    btn.disabled = true;
    const total = STATE.urls.length;
    let processed = 0;
    showProgress('Submitting URLs', total);
    log(`=== Submit started: ${total} URLs ===`, 'info');
    for (const item of STATE.urls) {
        if (!checkQuota()) break;
        updateUrlItem(item.id, { apiStatus: 'loading' });
        try {
            await submitToIndexing(item.url, 'URL_UPDATED');
            updateUrlItem(item.id, { apiStatus: 'success', apiMessage: 'Submitted' });
            log(`[${processed + 1}/${total}] Submitted: ${item.url}`, 'success');
        } catch (err) {
            updateUrlItem(item.id, { apiStatus: 'error', apiMessage: err.message });
            log(`[${processed + 1}/${total}] Failed: ${err.message}`, 'error');
        }
        processed++;
        updateProgress(processed, total);
        await sleep(CONFIG.DELAY_BETWEEN_REQUESTS);
    }
    hideProgress();
    btn.disabled = false;
    log(`=== Submit complete ===`, 'success');
    alert(`Selesai! ${processed}/${total} diproses.`);
});

$('clearAllBtn').addEventListener('click', () => {
    if (STATE.urls.length === 0) return;
    if (!confirm(`Hapus semua ${STATE.urls.length} URL?`)) return;
    STATE.urls = [];
    saveState();
    renderTable();
    log('Tabel dikosongkan', 'warning');
});

$('exportBtn').addEventListener('click', () => {
    if (STATE.urls.length === 0) return alert('Tabel kosong!');
    const headers = ['No', 'URL', 'API Status', 'API Message', 'Index Status', 'Index Message', 'Timestamp'];
    const rows = STATE.urls.map((item, idx) => [
        idx + 1, item.url, item.apiStatus, item.apiMessage,
        item.indexStatus, item.indexMessage, new Date(item.timestamp).toISOString()
    ]);
    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gsc_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log('CSV exported', 'success');
});

$('resetQuotaBtn').addEventListener('click', () => {
    if (!confirm('Reset counter kuota?')) return;
    STATE.quotaUsed = 0;
    STATE.quotaDate = new Date().toDateString();
    saveState();
    updateQuotaUI();
    log('Quota counter direset', 'info');
});

// ===== PROGRESS BAR =====
function showProgress(text, total) {
    $('progressContainer').classList.remove('hidden');
    $('progressText').textContent = text;
    $('progressCount').textContent = `0/${total}`;
    $('progressBar').style.width = '0%';
}

function updateProgress(current, total) {
    const percent = (current / total) * 100;
    $('progressBar').style.width = percent + '%';
    $('progressCount').textContent = `${current}/${total}`;
}

function hideProgress() {
    setTimeout(() => $('progressContainer').classList.add('hidden'), 1500);
}

// ===== ENTER KEY HANDLERS =====
$('manualUrl').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') $('submitManualBtn').click();
});
$('sitemapUrl').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') $('loadSitemapBtn').click();
});
$('removeUrl').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') $('removeUrlBtn').click();
});

// ===== INIT =====
function init() {
    loadState();
    renderTable();
    updateQuotaUI();
    log('🔥 GSC VIP Manager initialized', 'success');
    log('Upload Service Account JSON untuk mulai', 'info');
    
    if (typeof KJUR === 'undefined') {
        log('⚠️ jsrsasign library gagal dimuat! Refresh halaman.', 'error');
    } else {
        log('✅ jsrsasign ready', 'success');
    }
}

document.addEventListener('DOMContentLoaded', init);

