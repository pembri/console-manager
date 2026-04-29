// Konfigurasi API & Proxy
const PROXY_URL = "https://corsproxy.io/?"; 
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_API = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SEARCH_CONSOLE_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

let googleAuth = null;
let db = JSON.parse(localStorage.getItem('sai_console_db')) || [];
let dailyQuota = parseInt(localStorage.getItem('sai_quota')) || 200;

// 1. Inisialisasi Tampilan
document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    updateQuotaUI();
});

// 2. Handle Upload JSON
document.getElementById('jsonInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            googleAuth = JSON.parse(e.target.result);
            document.getElementById('authStatus').textContent = "Connected: " + googleAuth.client_email;
            document.getElementById('authStatus').className = "text-green-500 font-bold";
            document.getElementById('fileInfo').textContent = "Key Aktif: " + googleAuth.project_id;
            document.getElementById('fileInfo').classList.remove('hidden');
        } catch (err) {
            alert("File JSON Corrupt, Cok!");
        }
    };
    reader.readAsText(file);
});

// 3. Fungsi Utama: Minta Index (Tunggal & Massal)
async function submitIndexing(url, type = 'URL_UPDATED') {
    if (!googleAuth) return alert("Upload JSON dulu, Bangsat!");
    if (dailyQuota <= 0) return alert("Kuota abis! Ganti akun JSON atau tunggu besok.");

    showLoader(`Mengirim ${url}...`);
    
    try {
        const token = await generateToken();
        const res = await fetch(PROXY_URL + encodeURIComponent(INDEXING_API), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url, type: type })
        });

        const data = await res.json();
        
        if (res.ok) {
            saveToDB(url, 'Success');
            dailyQuota--;
            updateQuotaUI();
        } else {
            saveToDB(url, 'Error: ' + (data.error.message || 'API Reject'));
        }
    } catch (err) {
        saveToDB(url, 'Failed: Proxy Error');
    }
    hideLoader();
    renderTable();
}

// 4. Fitur Cek Status Terindex (URL Inspection)
async function checkGoogleStatus(url, index) {
    if (!googleAuth) return alert("JSON mana?");
    showLoader("Nanya ke Google...");

    try {
        const token = await generateToken();
        const res = await fetch(PROXY_URL + encodeURIComponent(SEARCH_CONSOLE_API), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                inspectionUrl: url,
                siteUrl: new URL(url).origin + "/"
            })
        });

        const data = await res.json();
        const resultStatus = data.inspectionResult?.indexStatusResult?.verdict || "UNKNOWN";
        
        // Update status di DB lokal
        db[index].googleStatus = resultStatus === "PASS" ? "TERINDEX ✅" : "BELUM ❌";
        localStorage.setItem('sai_console_db', JSON.stringify(db));
    } catch (err) {
        db[index].googleStatus = "CEK GAGAL";
    }
    hideLoader();
    renderTable();
}

// 5. Fungsi Generator Token (Otak JWT)
async function generateToken() {
    // Header & Payload
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const payload = btoa(JSON.stringify({
        iss: googleAuth.client_email,
        sub: googleAuth.client_email,
        aud: GOOGLE_TOKEN_URL,
        scope: "https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/searchconsole.readonly",
        iat, exp
    })).replace(/=/g, "");

    // Karena kita di Browser, proses signing butuh library atau bantuan eksternal
    // Untuk mempermudah tanpa Cloudflare, kita kirim mentah ke OAuth Exchange
    // NOTE: Versi ini asumsikan penggunaan helper signing atau proxy exchange
    const response = await fetch(PROXY_URL + encodeURIComponent(GOOGLE_TOKEN_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${payload}.SIGNATURE_PLACEHOLDER`
    });
    const d = await response.json();
    return d.access_token; 
}

// 6. UI Helpers
function saveToDB(url, status) {
    db.unshift({ url, status, googleStatus: 'Belum Dicek', date: new Date().toLocaleString() });
    localStorage.setItem('sai_console_db', JSON.stringify(db));
}

function renderTable() {
    const list = document.getElementById('indexList');
    list.innerHTML = db.map((item, i) => `
        <tr class="hover:bg-slate-800/50 transition">
            <td class="px-6 py-4 truncate max-w-xs">${item.url}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 rounded ${item.status === 'Success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${item.status}</span>
            </td>
            <td class="px-6 py-4 text-center font-bold text-orange-400">${item.googleStatus}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
                <button onclick="checkGoogleStatus('${item.url}', ${i})" class="bg-blue-600 px-3 py-1 rounded text-[10px]">CEK GOOGLE</button>
                <button onclick="deleteRow(${i})" class="text-red-500"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function updateQuotaUI() {
    document.getElementById('quotaCount').textContent = `${dailyQuota}/200`;
    document.getElementById('quotaBar').style.width = `${(dailyQuota / 200) * 100}%`;
    localStorage.setItem('sai_quota', dailyQuota);
}

function showLoader(txt) { 
    document.getElementById('loaderText').textContent = txt;
    document.getElementById('loader').classList.remove('hidden'); 
}
function hideLoader() { document.getElementById('loader').classList.add('hidden'); }

window.deleteRow = (i) => { db.splice(i, 1); localStorage.setItem('sai_console_db', JSON.stringify(db)); renderTable(); };
window.clearHistory = () => { if(confirm("Hapus semua list?")) { db = []; localStorage.clear(); location.reload(); }};

// Event Listeners Tombol
document.getElementById('btnIndex').addEventListener('click', () => {
    const url = document.getElementById('targetUrl').value;
    if(url) submitIndexing(url);
});

document.getElementById('btnDelete').addEventListener('click', () => {
    const url = document.getElementById('deleteUrl').value;
    if(url) submitIndexing(url, 'URL_DELETED');
});
