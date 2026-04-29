const WORKER_URL = "https://worker-crimson-smoke-71e0.pembriahmad526.workers.dev/";
let googleAuthData = null;

// 1. Fungsi Baca File JSON
document.getElementById('jsonInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            googleAuthData = JSON.parse(e.target.result);
            document.getElementById('fileInfo').textContent = `✅ Terhubung: ${googleAuthData.client_email}`;
            document.getElementById('fileInfo').classList.remove('hidden');
            document.getElementById('authStatus').innerHTML = '<span class="w-2 h-2 bg-green-500 rounded-full"></span> Terhubung';
            console.log("Auth Data Loaded");
        } catch (err) {
            alert("File JSON nggak valid, cok!");
        }
    };
    reader.readAsText(file);
});

// 2. Fungsi Kirim Request via Cloudflare Worker
async function sendToGoogle(targetUrl, type = 'URL_UPDATED') {
    if (!googleAuthData) {
        alert("Upload file JSON dulu!");
        return;
    }

    const btn = document.getElementById('btnIndex');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        // Kita butuh Access Token. Untuk mempermudah di Client-side, 
        // idealnya token di-generate di Worker. Tapi untuk sekarang, 
        // kita kirim data auth agar Worker yang eksekusi.
        
        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                authData: googleAuthData,
                url: targetUrl,
                type: type
            })
        });

        const resData = await response.json();

        if (response.ok) {
            alert("🔥 Mantap! Link berhasil dikirim ke Google.");
            addToIndexTable(targetUrl, "Success");
        } else {
            throw new Error(resData.error || "Gagal kirim");
        }

    } catch (error) {
        console.error(error);
        alert("Gagal, cok! Cek Console: " + error.message);
        addToIndexTable(targetUrl, "Error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Kirim ke Google";
    }
}

// 3. Update Tabel & Fitur Hapus
function addToIndexTable(url, status) {
    const tbody = document.getElementById('indexList');
    const row = document.createElement('tr');
    row.className = "border-b border-slate-800/50 hover:bg-slate-800/30 transition";
    row.innerHTML = `
        <td class="py-4 text-slate-300 break-all">${url}</td>
        <td class="py-4 text-center">
            <span class="status-badge ${status === 'Success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}">${status}</span>
        </td>
        <td class="py-4 text-right">
            <button onclick="confirmDelete('${url}', this)" class="text-red-400 hover:text-red-300 text-xs">
                <i class="fas fa-trash-alt"></i> Hapus Index
            </button>
        </td>
    `;
    tbody.prepend(row);
}

// Fungsi Hapus Index (Sesuai Request: Sekali Klik di List)
window.confirmDelete = function(url, el) {
    if(confirm(`Hapus index untuk URL ini?\n${url}`)) {
        sendToGoogle(url, 'URL_DELETED');
        el.closest('tr').style.opacity = '0.5';
    }
}

// Event Click Tombol Utama
document.getElementById('btnIndex').addEventListener('click', () => {
    const url = document.getElementById('targetUrl').value;
    if (url) sendToGoogle(url);
});
