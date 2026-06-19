/* ============================================================
   main.js — Shared logic Fikya.id
   Covers: datetime/clock, Hijri calendar, dark mode, search
   ============================================================ */

/* ===== DATA ===== */

const HARI   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN  = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_HIJRI = ['Muharram','Safar','Rabiul Awal','Rabiul Akhir','Jumadil Awal','Jumadil Akhir','Rajab',"Sya'ban",'Ramadan','Syawal','Dzulqaidah','Dzulhijjah'];

/* ===== HIJRI ===== */

function isLatin(str) {
  return /[a-zA-Z]/.test(str);
}

function getFallbackHijri(date) {
  try {
    let y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    if (m < 3) { y--; m += 12; }
    const A  = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    const JD = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
    let l    = JD - 1948440 + 10632;
    const n  = Math.floor((l - 1) / 10631);
    l        = l - 10631 * n + 354;
    const J  = Math.floor((10985 - l) / 5965);
    l        = l - Math.floor((Math.min(J, 1) * (-6 + J * (-10632 + J * ((J + J + 1) * 5519 + 366 * 10631)))) / 10631);
    const i  = Math.floor(l / 30);
    const dd = l - Math.floor(i * 29.5001 + 0.99);
    const mm = ((i + 1) % 12) || 12;
    const yy = n * 30 + J + Math.floor((i + 1) / 13);
    return `${dd} ${BULAN_HIJRI[mm - 1]} ${yy} H`;
  } catch (e) { return '—'; }
}

function getHijriDate(date) {
  try {
    const fmt   = new Intl.DateTimeFormat('id-ID', { calendar: 'islamic-umalqura', day: 'numeric', month: 'long', year: 'numeric' });
    const parts = fmt.formatToParts(date);
    const day   = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year  = parts.find(p => p.type === 'year').value;
    if (!isLatin(month)) return getFallbackHijri(date);
    return `${day} ${month} ${year} H`;
  } catch (e) { return getFallbackHijri(date); }
}

/* ===== CLOCK ===== */

function updateClock() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, '0');
  const mm  = String(now.getMinutes()).padStart(2, '0');
  const ss  = String(now.getSeconds()).padStart(2, '0');

  document.getElementById('nav-jam').textContent   = `${hh}:${mm}:${ss}`;
  document.getElementById('nav-tgl').textContent   = `${HARI[now.getDay()]}, ${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
  document.getElementById('nav-hijri').textContent = getHijriDate(now);
}

updateClock();
setInterval(updateClock, 1000);

/* ===== FOOTER TAHUN ===== */

const elTahun = document.getElementById('tahun');
if (elTahun) elTahun.textContent = new Date().getFullYear();

/* ===== DARK MODE ===== */

const btnDark = document.getElementById('btn-darkmode');

function applyDark(on) {
  document.body.classList.toggle('dark', on);
  btnDark.textContent = on ? '☀️' : '🌙';
  localStorage.setItem('darkmode', on ? '1' : '0');
}

applyDark(localStorage.getItem('darkmode') === '1');

btnDark.addEventListener('click', () => {
  applyDark(!document.body.classList.contains('dark'));
});

/* ===== SEARCH ===== */

const overlay     = document.getElementById('search-overlay');
const searchInput = document.getElementById('search-input');

document.getElementById('btn-search').addEventListener('click', () => {
  overlay.classList.add('active');
  setTimeout(() => searchInput.focus(), 50);
});

document.getElementById('search-close').addEventListener('click', () => {
  overlay.classList.remove('active');
  searchInput.value = '';
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) {
    overlay.classList.remove('active');
    searchInput.value = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') overlay.classList.remove('active');
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    overlay.classList.add('active');
    setTimeout(() => searchInput.focus(), 50);
  }
});
