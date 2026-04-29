/* ============================================================
   SAI ROOTS CONSOLE MANAGER - CORE LOGIC (APP.JS)
   ============================================================ */

const BASE_URL = "https://sairootsmusic.com";
const PIN_RAHASIA = "220599";
let gasUrl = "";
let isScanning = false;

// 1. Inisiasi Awal (Cek apakah URL GAS pernah disimpan di browser)
window.onload = () => {
    const savedUrl = localStorage.getItem('gas_url');
    if (savedUrl) {
        document.getElementById('input-url').value = savedUrl;
    }
};

// 2. FUNGSI LOGIN & AUTENTIKASI
function prosesLogin() {
    const pin = document.getElementById('input-pin').value;
    const url = document.getElementById('input-url').value;
    const msg = document.getElementById('login-msg');

    if (!pin || !url) {
        tampilkanPesanError("PIN dan URL Script wajib diisi!");
        return;
    }

    if (pin !== PIN_RAHASIA) {
        tampilkanPesanError("PIN Salah! Akses ditolak.");
        return;
    }

    // Login Sukses
    gasUrl = url;
    localStorage.setItem('gas_url', gasUrl); // Simpan otomatis URL-nya
    
    // Pindah ke Halaman Dashboard
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
}

function tampilkanPesanError(text) {
    const msg = document.getElementById('login-msg');
    msg.innerText = text;
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
}

function logout() {
    if (confirm("Yakin ingin mengunci kembali sistem dan keluar?")) {
        location.reload(); // Refresh halaman akan kembali ke menu login
    }
}

// 3. KONTROL POP-UP (MODALS)
function bukaPopup(id) {
    document.getElementById(id).classList.remove('hidden');
}

function tutupPopup(id) {
    document.getElementById(id).classList.add('hidden');
    
    // Reset log teks ketika ditutup agar bersih saat dibuka lagi
    if(id === 'popup-minta-indeks') document.getElementById('log-minta-indeks').innerText = "Menunggu perintah...";
    if(id === 'popup-uji-url') document.getElementById('log-uji-url').innerText = "Menunggu perintah...";
    if(id === 'popup-sitemap') document.getElementById('log-sitemap').innerText = "Menunggu perintah...";
}

// 4. MESIN API (Pengirim Perintah Real-Time ke Google Script)
async function executeApi(targetUrl, action, logId) {
    const logEl = document.getElementById(logId);
    if (!gasUrl) return alert("URL Server GAS tidak valid.");

    // Animasi Progres Real-Time
    logEl.innerText = "Membuka koneksi ke server Google...\n⏳ Sedang memproses, mohon tunggu...";
    
    try {
        const response = await fetch(`${gasUrl}?action=${action}&url=${encodeURIComponent(targetUrl)}`);
        const result = await response.json();
        
        if (result.success) {
            logEl.innerText = "✅ BERHASIL MEMPROSES PERMINTAAN!\n\n[Respons Server Google]:\n" + JSON.stringify(result.data, null, 2);
        } else {
            logEl.innerText = "❌ GAGAL:\n" + result.error;
        }
    } catch (err) {
        logEl.innerText = "⚠️ ERROR KONEKSI:\nPastikan koneksi internet stabil dan URL GAS benar.\nDetail: " + err.message;
    }
}

// 5. EKSEKUSI TOMBOL MANUAL (Dari dalam Pop-up)
function jalankanMintaIndeks() {
    const url = document.getElementById('input-minta-url').value;
    if (!url) return alert("URL harus diisi!");
    executeApi(url, 'update', 'log-minta-indeks');
}

function jalankanUjiUrl() {
    const url = document.getElementById('input-uji-url').value;
    if (!url) return alert("URL harus diisi!");
    executeApi(url, 'check', 'log-uji-url');
}

function jalankanSitemap() {
    const sitemapPath = document.getElementById('input-sitemap').value;
    if (!sitemapPath) return alert("Tuliskan nama sitemap (contoh: sitemap.xml)!");
    executeApi(sitemapPath, 'sitemap', 'log-sitemap');
}

// 6. SISTEM SCAN DATABASE OTOMATIS (Membaca file database.js SAI Roots)
async function mulaiScanDatabase() {
    if (isScanning) return alert("Sistem masih melakukan proses scan, harap tunggu...");
    
    const listTersedia = document.getElementById('list-tersedia');
    const listBelum = document.getElementById('list-belum');
    
    listTersedia.innerHTML = '<p class="text-xs text-yellow-500 text-center mt-10"><i class="fas fa-spinner fa-spin mr-2"></i>Menarik dan menguji data database...</p>';
    listBelum.innerHTML = '<p class="text-xs text-yellow-500 text-center mt-10"><i class="fas fa-spinner fa-spin mr-2"></i>Menarik dan menguji data database...</p>';

    isScanning = true;

    try {
        // Ambil isi database.js langsung dari website utama kamu
        const response = await fetch(BASE_URL + '/database.js');
        const textData = await response.text();
        
        // Membongkar JSON dari database.js menggunakan teknik evaluasi persis seperti di CMS kamu
        const dbMatch = textData.match(/const sairootsDB = ([\s\S]*?);\s*\/\//);
        const db = eval('(' + dbMatch[1] + ')');
        
        let allUrls = [];
        db.articles.forEach(a => allUrls.push({ url: `${BASE_URL}/article/${a.id}`, title: a.title }));
        db.lyrics.forEach(a => allUrls.push({ url: `${BASE_URL}/lyric/${a.id}`, title: a.title }));
        db.discography.forEach(a => allUrls.push({ url: `${BASE_URL}/discography/${a.id}`, title: a.title }));

        listTersedia.innerHTML = '';
        listBelum.innerHTML = '';

        // Looping Uji URL Satu per Satu
        for (let i = 0; i < allUrls.length; i++) {
            const item = allUrls[i];
            await prosesUjiOtomatis(item.url, item.title, i);
        }

        isScanning = false;
        alert("Pemeriksaan Database Selesai!");

    } catch (error) {
        isScanning = false;
        listTersedia.innerHTML = '<p class="text-red-500 text-xs text-center mt-10">Gagal mengambil data dari database.js</p>';
        listBelum.innerHTML = '<p class="text-red-500 text-xs text-center mt-10">Gagal mengambil data dari database.js</p>';
        console.error("Error Scan DB:", error);
    }
}

// 7. PROSES PEMILAHAN TERINDEKS (✓) DAN BELUM (X)
async function prosesUjiOtomatis(url, title, indexId) {
    try {
        const response = await fetch(`${gasUrl}?action=check&url=${encodeURIComponent(url)}`);
        const result = await response.json();
        
        let isPassed = false;
        if (result && result.success && result.data && result.data.inspectionResult) {
            // Jika status Google mengembalikan kata "PASS", artinya sudah terindeks
            isPassed = result.data.inspectionResult.indexStatusResult.verdict === "PASS";
        }

        const elemenId = `url-item-${indexId}`;

        if (isPassed) {
            // URL TERSUDIA (TERINDEKS)
            document.getElementById('list-tersedia').innerHTML += `
                <div id="${elemenId}" class="url-item p-3 border border-green-900/40 rounded-lg flex justify-between items-center bg-black/40">
                    <div class="overflow-hidden pr-2">
                        <h4 class="text-xs font-bold text-green-400 truncate"><i class="fas fa-check-circle mr-1"></i> ${title}</h4>
                        <p class="text-[9px] text-gray-500 truncate mt-1">${url}</p>
                    </div>
                    <button onclick="hapusUrlSaja('${url}', '${elemenId}')" class="btn-delete-index bg-red-900/60 text-white text-[9px] px-3 py-2 rounded font-bold uppercase tracking-wide shrink-0 border border-red-800/50">
                        <i class="fas fa-trash-alt mr-1"></i> Hapus
                    </button>
                </div>
            `;
        } else {
            // URL BELUM TERINDEKS
            document.getElementById('list-belum').innerHTML += `
                <div class="url-item p-3 border border-red-900/40 rounded-lg flex justify-between items-center bg-black/40">
                    <div class="overflow-hidden pr-2">
                        <h4 class="text-xs font-bold text-red-400 truncate"><i class="fas fa-times mr-1"></i> ${title}</h4>
                        <p class="text-[9px] text-gray-500 truncate mt-1">${url}</p>
                    </div>
                    <span class="text-[9px] text-red-500 font-bold border border-red-900/40 px-2 py-1 rounded bg-red-900/10 shrink-0 uppercase">Belum</span>
                </div>
            `;
        }
    } catch (e) {
        console.error("Gagal menguji otomatis url: " + url, e);
    }
}

// 8. FUNGSI MENGHAPUS SATU URL SPESIFIK (Dari List Tersedia)
async function hapusUrlSaja(url, elemenId) {
    if (!confirm(`TINDAKAN PERMANEN!\nYakin ingin meminta Google MENGHAPUS url ini dari pencarian (selama 6 bulan)?\n\n${url}`)) {
        return;
    }
    
    const btn = document.querySelector(`#${elemenId} button`);
    const teksAsli = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Proses...`;
    btn.disabled = true;

    try {
        const response = await fetch(`${gasUrl}?action=delete&url=${encodeURIComponent(url)}`);
        const result = await response.json();
        
        if (result && result.success) {
            alert("✅ Permintaan Hapus Indeks berhasil dikirim ke Google!");
            // Hilangkan URL dari list Tersedia
            document.getElementById(elemenId).remove();
        } else {
            alert("❌ Gagal menghapus URL.\nSilakan uji manual di menu pop-up untuk melihat log error.");
            btn.innerHTML = teksAsli;
            btn.disabled = false;
        }
    } catch (e) {
        alert("⚠️ Terjadi kesalahan jaringan saat mencoba menghapus.");
        btn.innerHTML = teksAsli;
        btn.disabled = false;
    }
}
