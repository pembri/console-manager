// Pakai Proxy yang berbeda buat cadangan
const PROXY_URL = "https://api.allorigins.win/raw?url="; 
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_API = "https://indexing.googleapis.com/v3/urlNotifications:publish";

let googleAuth = null;
let db = JSON.parse(localStorage.getItem('sai_console_db')) || [];
let dailyQuota = parseInt(localStorage.getItem('sai_quota')) || 200;

// Handle Upload JSON
document.getElementById('jsonInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            googleAuth = JSON.parse(e.target.result);
            if(!googleAuth.private_key) throw new Error("JSON Gak Lengkap!");
            
            document.getElementById('authStatus').textContent = "Connected: " + googleAuth.client_email;
            document.getElementById('authStatus').className = "text-green-500 font-bold";
            document.getElementById('fileInfo').textContent = "✅ JSON Valid & Terpasang";
            document.getElementById('fileInfo').classList.remove('hidden');
        } catch (err) {
            alert("File JSON lo rusak atau bukan dari Google Cloud, Cok!");
        }
    };
    reader.readAsText(file);
});

// Fungsi Generate Token (Cara Client-Side)
async function generateToken() {
    // Karena kita tanpa server, kita butuh JWT yang bener.
    // Tapi Google OAuth butuh signature RS256 yang susah di JS biasa.
    // Solusi: Kita pakai help API buat tuker JSON jadi Token.
    
    // Jika gagal, ini adalah part paling rawan karena browser gak punya library crypto RS256 bawaan yang simpel.
    throw new Error("Browser butuh 'Secret Bridge'. Coba pakai Cloudflare Worker tadi atau pasang library Crypto.");
}

// Fungsi Submit
async function submitIndexing(url, type = 'URL_UPDATED') {
    if (!googleAuth) return alert("JSON-nya mana bangsat? Upload dulu!");
    
    showLoader(`Mencoba kirim: ${url}`);
    
    try {
        // Cek apakah JSON lo beneran punya private_key
        console.log("Memproses URL:", url);
        
        // Update status ke tabel (Pending)
        saveToDB(url, 'Pending');
        renderTable();

        alert("Cok, dengerin: Browser (JS biasa) nggak bisa bikin tanda tangan digital (RS256) buat Google tanpa library tambahan. Lo mau gue kasih kode versi Library atau kita balik benerin Cloudflare Worker?");

    } catch (err) {
        alert("Error: " + err.message);
    }
    hideLoader();
}

// UI Function sisanya tetep sama...
