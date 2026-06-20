/* ============================================================
   comments.js — Sistem komentar & statistik Fikya.id
   Covers: postId dari URL, view counter, statistik,
           form komentar, tampil komentar, cache localStorage,
           validasi, XSS protection, cooldown
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== 1. KONFIGURASI ===== */

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz2AQEhvZTYJjnoTkk1JhHhMdfLinKonWYN0JAyXWnswP0QExe-RdiFZXGr1g87Tx1DuQ/exec';

  const CONFIG = {
    maxNama      : 50,       // karakter maksimal nama
    maxKomentar  : 1000,     // karakter maksimal komentar
    cooldownSecs : 60,       // detik cooldown antar komentar
    cacheTTL     : 5 * 60 * 1000, // 5 menit dalam milidetik
  };

  /* ===== 2. AMBIL POST ID DARI URL ===== */
  /*
    Contoh:
    /blog/dzikir-pagi.html → postId = "dzikir-pagi"
    /blog/cara-memasak.html → postId = "cara-memasak"
  */

  const getPostId = () => {
    const path     = window.location.pathname;
    const filename = path.split('/').pop();          // "dzikir-pagi.html"
    return filename.replace(/\.html?$/i, '');        // "dzikir-pagi"
  };

  const postId = getPostId();

  if (!postId) {
    console.warn('comments.js: postId tidak ditemukan, sistem komentar dinonaktifkan.');
    return;
  }

  /* ===== 3. CACHE HELPER ===== */

  const cache = {
    set(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify({
          data,
          ts: Date.now(),
        }));
      } catch(e) { /* localStorage penuh atau diblokir */ }
    },

    get(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts > CONFIG.cacheTTL) {
          localStorage.removeItem(key);
          return null;
        }
        return parsed.data;
      } catch(e) { return null; }
    },

    clear(key) {
      try { localStorage.removeItem(key); } catch(e) {}
    },
  };

  const CACHE_KEY_STATS    = `stats_${postId}`;
  const CACHE_KEY_COMMENTS = `comments_${postId}`;

  /* ===== 4. KEAMANAN — ESCAPE HTML ===== */
  /*
    Tidak menggunakan innerHTML untuk data pengguna.
    Semua teks pengguna ditampilkan via textContent.
    Fungsi ini hanya untuk keperluan sanitasi tambahan.
  */

  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const sanitize = (str) => String(str).trim();

  /* ===== 5. ELEMENT REFERENCES ===== */

  const elViews        = document.getElementById('stat-views');
  const elCommentCount = document.getElementById('stat-comments');
  const elCommentsList = document.getElementById('comments-list');
  const elForm         = document.getElementById('comment-form');
  const elNama         = document.getElementById('comment-nama');
  const elIsi          = document.getElementById('comment-isi');
  const elNamaCount    = document.getElementById('nama-count');
  const elIsiCount     = document.getElementById('isi-count');
  const elSubmitBtn    = document.getElementById('comment-submit');
  const elFormMsg      = document.getElementById('form-message');

  /* ===== 6. JSONP HELPER ===== */
  /*
    Google Apps Script tidak mengirim CORS header yang konsisten
    pada GET request karena redirect. Solusi: gunakan JSONP.
    Script tag tidak terkena batasan CORS.
    Untuk POST (addComment), gunakan mode no-cors + form-encoded.
  */

  const jsonp = (url) => {
    return new Promise((resolve, reject) => {
      const cbName = `_jsonp_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, 10000);

      const cleanup = () => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timeout);
      };

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      script.src = `${url}&callback=${cbName}`;
      script.onerror = () => {
        cleanup();
        reject(new Error('JSONP gagal memuat script'));
      };
      document.head.appendChild(script);
    });
  };

  /* ===== 7. VIEW COUNTER ===== */
  /*
    Gunakan localStorage untuk mencegah duplikasi view
    dari browser yang sama saat refresh.
    Key: viewed_postId
  */

  const VIEW_KEY = `viewed_${postId}`;

  const sendView = async () => {
    if (localStorage.getItem(VIEW_KEY)) return; // sudah pernah dibuka

    try {
      await jsonp(`${APPS_SCRIPT_URL}?action=addView&postId=${encodeURIComponent(postId)}`);
      localStorage.setItem(VIEW_KEY, '1');
    } catch(e) {
      console.warn('comments.js: gagal mengirim view.', e);
    }
  };

  /* ===== 8. AMBIL DAN TAMPILKAN STATISTIK ===== */

  const renderStats = (stats) => {
    if (elViews)        elViews.textContent        = (stats.views    || 0).toLocaleString('id-ID');
    if (elCommentCount) elCommentCount.textContent = (stats.comments || 0).toLocaleString('id-ID');
  };

  const fetchStats = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = cache.get(CACHE_KEY_STATS);
      if (cached) { renderStats(cached); return; }
    }

    try {
      const data = await jsonp(`${APPS_SCRIPT_URL}?action=getStats&postId=${encodeURIComponent(postId)}`);
      if (data.status === 'ok') {
        cache.set(CACHE_KEY_STATS, data);
        renderStats(data);
      }
    } catch(e) {
      console.warn('comments.js: gagal mengambil statistik.', e);
    }
  };

  /* ===== 9. AMBIL DAN TAMPILKAN KOMENTAR ===== */

  const formatTanggal = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleDateString('id-ID', {
        day   : 'numeric',
        month : 'long',
        year  : 'numeric',
      });
    } catch(e) { return ''; }
  };

  const getInisial = (nama) => {
    const parts = sanitize(nama).split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

  const renderKomentar = (list) => {
    if (!elCommentsList) return;

    elCommentsList.innerHTML = '';

    if (!list || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'comments-empty';

      const icon = document.createElement('span');
      icon.className = 'empty-icon';
      icon.textContent = '💬';

      const msg = document.createElement('p');
      msg.textContent = 'Belum ada komentar. Jadilah yang pertama!';

      empty.appendChild(icon);
      empty.appendChild(msg);
      elCommentsList.appendChild(empty);
      return;
    }

    list.forEach((item) => {
      /* Card */
      const card = document.createElement('div');
      card.className = 'comment-card';

      /* Header */
      const header = document.createElement('div');
      header.className = 'comment-header';

      /* Avatar */
      const avatar = document.createElement('div');
      avatar.className = 'comment-avatar';
      avatar.textContent = getInisial(item.nama || '?');

      /* Meta */
      const meta = document.createElement('div');
      meta.className = 'comment-meta';

      const nama = document.createElement('div');
      nama.className = 'comment-name';
      nama.textContent = sanitize(item.nama); // textContent — aman dari XSS

      const tanggal = document.createElement('div');
      tanggal.className = 'comment-date';
      tanggal.textContent = formatTanggal(item.timestamp);

      meta.appendChild(nama);
      meta.appendChild(tanggal);
      header.appendChild(avatar);
      header.appendChild(meta);

      /* Body */
      const body = document.createElement('div');
      body.className = 'comment-body';
      body.textContent = sanitize(item.komentar); // textContent — aman dari XSS

      card.appendChild(header);
      card.appendChild(body);
      elCommentsList.appendChild(card);
    });
  };

  const fetchKomentar = async (forceRefresh = false) => {
    if (!elCommentsList) return;

    if (!forceRefresh) {
      const cached = cache.get(CACHE_KEY_COMMENTS);
      if (cached) { renderKomentar(cached); return; }
    }

    /* Tampilkan loading */
    elCommentsList.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'comments-loading';
    loading.textContent = 'Memuat komentar...';
    elCommentsList.appendChild(loading);

    try {
      const data = await jsonp(`${APPS_SCRIPT_URL}?action=getComments&postId=${encodeURIComponent(postId)}`);
      if (data.status === 'ok') {
        cache.set(CACHE_KEY_COMMENTS, data.comments);
        renderKomentar(data.comments);
      }
    } catch(e) {
      console.warn('comments.js: gagal mengambil komentar.', e);
      elCommentsList.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'comments-empty';
      errEl.textContent = 'Gagal memuat komentar. Coba refresh halaman.';
      elCommentsList.appendChild(errEl);
    }
  };

  /* ===== 10. CHARACTER COUNTER ===== */

  const updateCount = (input, countEl, max) => {
    if (!input || !countEl) return;
    const len = input.value.length;
    countEl.textContent = `${len} / ${max}`;
    countEl.classList.toggle('over-limit', len > max);
  };

  if (elNama) {
    elNama.addEventListener('input', () => updateCount(elNama, elNamaCount, CONFIG.maxNama));
  }

  if (elIsi) {
    elIsi.addEventListener('input', () => updateCount(elIsi, elIsiCount, CONFIG.maxKomentar));
  }

  /* ===== 11. TAMPILKAN PESAN FORM ===== */

  const showMsg = (tipe, teks) => {
    if (!elFormMsg) return;
    elFormMsg.className = `form-message ${tipe}`;
    elFormMsg.textContent = teks;
    setTimeout(() => {
      elFormMsg.className = 'form-message';
      elFormMsg.textContent = '';
    }, 5000);
  };

  /* ===== 12. COOLDOWN KOMENTAR ===== */
  /*
    Mencegah spam: satu komentar per 60 detik per postId.
    Key localStorage: comment_cooldown_postId
  */

  const COOLDOWN_KEY = `comment_cooldown_${postId}`;

  const isCooldownActive = () => {
    try {
      const ts = localStorage.getItem(COOLDOWN_KEY);
      if (!ts) return false;
      const elapsed = (Date.now() - parseInt(ts, 10)) / 1000;
      return elapsed < CONFIG.cooldownSecs;
    } catch(e) { return false; }
  };

  const getCooldownSisa = () => {
    try {
      const ts      = localStorage.getItem(COOLDOWN_KEY);
      const elapsed = (Date.now() - parseInt(ts, 10)) / 1000;
      return Math.ceil(CONFIG.cooldownSecs - elapsed);
    } catch(e) { return 0; }
  };

  const setCooldown = () => {
    try { localStorage.setItem(COOLDOWN_KEY, Date.now().toString()); } catch(e) {}
  };

  /* ===== 13. KIRIM KOMENTAR ===== */

  /*
    POST ke Google Apps Script menggunakan mode: 'no-cors' +
    Content-Type: application/x-www-form-urlencoded.
    Dengan no-cors, browser tidak memblokir request meski tidak
    ada CORS header — trade-off: response tidak bisa dibaca,
    sehingga kita asumsikan sukses jika tidak ada network error.

    INTEGRASI CLOUDFLARE TURNSTILE:
    Setelah mengaktifkan Turnstile di Cloudflare Dashboard:
    1. Tambahkan widget di HTML sebelum tombol submit:
       <div class="cf-turnstile" data-sitekey="SITE_KEY_ANDA"></div>
    2. Uncomment baris berikut untuk mengambil token:
       const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value;
       if (!turnstileToken) { showMsg('error', 'Verifikasi Turnstile gagal.'); return; }
    3. Tambahkan turnstileToken ke payload di bawah
    4. Verifikasi token di Apps Script (Code.gs) sebelum menyimpan komentar
  */

  if (elForm) {
    elForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      /* Cek cooldown */
      if (isCooldownActive()) {
        showMsg('cooldown', `Tunggu ${getCooldownSisa()} detik sebelum mengirim komentar lagi.`);
        return;
      }

      const nama     = sanitize(elNama?.value || '');
      const komentar = sanitize(elIsi?.value  || '');

      /* Validasi */
      if (!nama) {
        showMsg('error', 'Nama tidak boleh kosong.');
        elNama?.focus();
        return;
      }

      if (nama.length > CONFIG.maxNama) {
        showMsg('error', `Nama maksimal ${CONFIG.maxNama} karakter.`);
        elNama?.focus();
        return;
      }

      if (!komentar) {
        showMsg('error', 'Komentar tidak boleh kosong.');
        elIsi?.focus();
        return;
      }

      if (komentar.length > CONFIG.maxKomentar) {
        showMsg('error', `Komentar maksimal ${CONFIG.maxKomentar} karakter.`);
        elIsi?.focus();
        return;
      }

      /* Disable tombol saat proses */
      if (elSubmitBtn) {
        elSubmitBtn.disabled    = true;
        elSubmitBtn.textContent = 'Mengirim...';
      }

      try {
        /*
          Gunakan mode: 'no-cors' + form-encoded agar tidak diblokir CORS.
          Apps Script perlu baca via e.parameter, bukan e.postData.
          Maka di Code.gs, doPost harus baca dari e.parameter juga
          (lihat catatan di bawah).
        */
        const payload = new URLSearchParams({
          action   : 'addComment',
          postId,
          nama     : escapeHtml(nama),
          komentar : escapeHtml(komentar),
        });

        await fetch(APPS_SCRIPT_URL, {
          method  : 'POST',
          mode    : 'no-cors',
          body    : payload,
        });

        /*
          Dengan no-cors, response selalu opaque (tidak bisa dibaca).
          Kita asumsikan sukses jika tidak ada network error.
        */
        setCooldown();
        showMsg('success', 'Komentar berhasil dikirim! Menunggu persetujuan admin.');
        elForm.reset();
        if (elNamaCount) elNamaCount.textContent = `0 / ${CONFIG.maxNama}`;
        if (elIsiCount)  elIsiCount.textContent  = `0 / ${CONFIG.maxKomentar}`;

        /* Refresh stats (hapus cache lama) */
        cache.clear(CACHE_KEY_STATS);
        await fetchStats(true);

      } catch(e) {
        console.warn('comments.js: gagal mengirim komentar.', e);
        showMsg('error', 'Gagal terhubung ke server. Periksa koneksi internet Anda.');
      } finally {
        if (elSubmitBtn) {
          elSubmitBtn.disabled    = false;
          elSubmitBtn.textContent = 'Kirim Komentar';
        }
      }
    });
  }

  /* ===== 14. INIT ===== */

  sendView();
  fetchStats();
  fetchKomentar();

});
