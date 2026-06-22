/* ============================================================
   comments.js — Sistem komentar & statistik Fikya.id
   Covers: postId dari URL, view counter, statistik,
           form komentar, tampil komentar, cache localStorage,
           validasi, XSS protection, cooldown,
           skeleton loading, toast notification
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== 1. KONFIGURASI ===== */

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz2AQEhvZTYJjnoTkk1JhHhMdfLinKonWYN0JAyXWnswP0QExe-RdiFZXGr1g87Tx1DuQ/exec';

  const CONFIG = {
    maxNama      : 50,
    maxKomentar  : 1000,
    cooldownSecs : 60,
    cacheTTL     : 60 * 1000,   // 1 menit
    fetchTimeout : 10 * 1000,   // 10 detik
    toastDuration: 4000,        // durasi toast tampil (ms)
  };

  /* ===== 2. AMBIL POST ID DARI URL ===== */

  const getPostId = () => {
    const path     = window.location.pathname;
    const filename = path.split('/').pop();
    return filename.replace(/\.html?$/i, '');
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
        localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
      } catch(e) {}
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

  /* ===== 4. SANITASI ===== */

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

  /* ===== 6. TOAST NOTIFICATION ===== */
  /*
    PERBAIKAN: Ganti form-message statis dengan toast di pojok
    kanan bawah — tidak menggeser layout, lebih modern.
    Toast dibuat dinamis dan dihapus dari DOM setelah animasi selesai.
  */

  const TOAST_ICONS = {
    success : '✅',
    error   : '❌',
    cooldown: '⏳',
  };

  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastContainer);
  }

  const showToast = (tipe, teks) => {
    const toast = document.createElement('div');
    toast.className = `toast toast--${tipe}`;
    toast.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = TOAST_ICONS[tipe] || 'ℹ️';

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = teks;

    toast.appendChild(icon);
    toast.appendChild(text);
    toastContainer.appendChild(toast);

    /* Trigger animasi masuk */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast--visible'));
    });

    /* Animasi keluar lalu hapus dari DOM */
    const hide = () => {
      toast.classList.add('toast--hiding');
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };

    setTimeout(hide, CONFIG.toastDuration);
  };

  /* ===== 7. JSONP HELPER ===== */

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

      window[cbName] = (data) => { cleanup(); resolve(data); };
      script.src = `${url}&callback=${cbName}`;
      script.onerror = () => { cleanup(); reject(new Error('JSONP gagal memuat script')); };
      document.head.appendChild(script);
    });
  };

  /* ===== 8. FETCH DENGAN TIMEOUT ===== */

  const fetchWithTimeout = (url, timeoutMs) => {
    return Promise.race([
      jsonp(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      ),
    ]);
  };

  /* ===== 9. VIEW COUNTER ===== */

  const VIEW_KEY = `viewed_${postId}`;

  const sendView = async () => {
    if (localStorage.getItem(VIEW_KEY)) return;
    try {
      await jsonp(`${APPS_SCRIPT_URL}?action=addView&postId=${encodeURIComponent(postId)}`);
      localStorage.setItem(VIEW_KEY, '1');
    } catch(e) {
      console.warn('comments.js: gagal mengirim view.', e);
    }
  };

  /* ===== 10. STATISTIK ===== */

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
      if (data.status === 'ok') { cache.set(CACHE_KEY_STATS, data); renderStats(data); }
    } catch(e) {
      console.warn('comments.js: gagal mengambil statistik.', e);
    }
  };

  /* ===== 11. KOMENTAR ===== */

  const formatTanggal = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch(e) { return ''; }
  };

  const getInisial = (nama) => {
    const parts = sanitize(nama).split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

  /* PERBAIKAN: skeleton loading — 3 kartu placeholder beranimasi */
  const renderSkeleton = () => {
    if (!elCommentsList) return;
    elCommentsList.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'comments-loading';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-label', 'Memuat komentar...');

    for (let i = 0; i < 3; i++) {
      container.innerHTML += `
        <div class="skeleton-card">
          <div class="skeleton-header">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-meta">
              <div class="skeleton-line skeleton-line--name"></div>
              <div class="skeleton-line skeleton-line--date"></div>
            </div>
          </div>
          <div class="skeleton-line skeleton-line--body1"></div>
          <div class="skeleton-line skeleton-line--body2"></div>
        </div>
      `;
    }

    elCommentsList.appendChild(container);
  };

  const renderKomentar = (list) => {
    if (!elCommentsList) return;
    elCommentsList.innerHTML = '';

    if (!list || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'comments-empty';
      empty.setAttribute('role', 'status');

      const icon = document.createElement('span');
      icon.className = 'empty-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '💬';

      const msg = document.createElement('p');
      msg.textContent = 'Belum ada komentar. Jadilah yang pertama!';

      empty.appendChild(icon);
      empty.appendChild(msg);
      elCommentsList.appendChild(empty);
      return;
    }

    list.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'comment-card';

      const header = document.createElement('div');
      header.className = 'comment-header';

      const avatar = document.createElement('div');
      avatar.className = 'comment-avatar';
      avatar.textContent = getInisial(item.nama || '?');

      const meta = document.createElement('div');
      meta.className = 'comment-meta';

      const nama = document.createElement('div');
      nama.className = 'comment-name';
      nama.textContent = sanitize(item.nama);

      const tanggal = document.createElement('div');
      tanggal.className = 'comment-date';
      tanggal.textContent = formatTanggal(item.timestamp);

      meta.appendChild(nama);
      meta.appendChild(tanggal);
      header.appendChild(avatar);
      header.appendChild(meta);

      const body = document.createElement('div');
      body.className = 'comment-body';
      body.textContent = sanitize(item.komentar);

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

    cache.clear(CACHE_KEY_COMMENTS);

    /* PERBAIKAN: tampilkan skeleton, bukan teks "Memuat komentar..." */
    renderSkeleton();

    try {
      const data = await fetchWithTimeout(
        `${APPS_SCRIPT_URL}?action=getComments&postId=${encodeURIComponent(postId)}`,
        CONFIG.fetchTimeout
      );

      if (data.status === 'ok') {
        cache.set(CACHE_KEY_COMMENTS, data.comments);
        renderKomentar(data.comments);
      }
    } catch(e) {
      console.warn('comments.js: gagal mengambil komentar.', e);
      elCommentsList.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'comments-empty';
      errEl.textContent = e.message === 'Request timeout'
        ? 'Server lambat merespons. Coba refresh halaman.'
        : 'Gagal memuat komentar. Periksa koneksi internet Anda.';
      elCommentsList.appendChild(errEl);
    }
  };

  /* ===== 12. CHARACTER COUNTER ===== */

  const updateCount = (input, countEl, max) => {
    if (!input || !countEl) return;
    const len = input.value.length;
    countEl.textContent = `${len} / ${max}`;
    countEl.classList.toggle('over-limit', len > max);
  };

  if (elNama) elNama.addEventListener('input', () => updateCount(elNama, elNamaCount, CONFIG.maxNama));
  if (elIsi)  elIsi.addEventListener('input',  () => updateCount(elIsi,  elIsiCount,  CONFIG.maxKomentar));

  /* ===== 13. COOLDOWN ===== */

  const COOLDOWN_KEY = `comment_cooldown_${postId}`;

  const isCooldownActive = () => {
    try {
      const ts = localStorage.getItem(COOLDOWN_KEY);
      if (!ts) return false;
      return (Date.now() - parseInt(ts, 10)) / 1000 < CONFIG.cooldownSecs;
    } catch(e) { return false; }
  };

  const getCooldownSisa = () => {
    try {
      const ts = localStorage.getItem(COOLDOWN_KEY);
      return Math.ceil(CONFIG.cooldownSecs - (Date.now() - parseInt(ts, 10)) / 1000);
    } catch(e) { return 0; }
  };

  const setCooldown = () => {
    try { localStorage.setItem(COOLDOWN_KEY, Date.now().toString()); } catch(e) {}
  };

  /* ===== 14. KIRIM KOMENTAR ===== */

  if (elForm) {
    elForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (isCooldownActive()) {
        showToast('cooldown', `Tunggu ${getCooldownSisa()} detik sebelum mengirim komentar lagi.`);
        return;
      }

      const nama     = sanitize(elNama?.value || '');
      const komentar = sanitize(elIsi?.value  || '');

      if (!nama) {
        showToast('error', 'Nama tidak boleh kosong.');
        elNama?.focus();
        return;
      }

      if (nama.length > CONFIG.maxNama) {
        showToast('error', `Nama maksimal ${CONFIG.maxNama} karakter.`);
        elNama?.focus();
        return;
      }

      if (!komentar) {
        showToast('error', 'Komentar tidak boleh kosong.');
        elIsi?.focus();
        return;
      }

      if (komentar.length > CONFIG.maxKomentar) {
        showToast('error', `Komentar maksimal ${CONFIG.maxKomentar} karakter.`);
        elIsi?.focus();
        return;
      }

      const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value;
      if (!turnstileToken) {
        showToast('error', 'Selesaikan verifikasi keamanan (Turnstile) terlebih dahulu.');
        return;
      }

      if (elSubmitBtn) {
        elSubmitBtn.disabled    = true;
        elSubmitBtn.textContent = 'Mengirim...';
      }

      try {
        const payload = new URLSearchParams({
          action: 'addComment', postId, nama, komentar, turnstileToken,
        });

        await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: payload });

        setCooldown();
        showToast('success', 'Komentar berhasil dikirim! Menunggu persetujuan admin.');
        elForm.reset();
        if (elNamaCount) elNamaCount.textContent = `0 / ${CONFIG.maxNama}`;
        if (elIsiCount)  elIsiCount.textContent  = `0 / ${CONFIG.maxKomentar}`;

        cache.clear(CACHE_KEY_STATS);
        await fetchStats(true);

      } catch(e) {
        console.warn('comments.js: gagal mengirim komentar.', e);
        showToast('error', 'Gagal terhubung ke server. Periksa koneksi internet Anda.');
      } finally {
        if (elSubmitBtn) {
          elSubmitBtn.disabled    = false;
          elSubmitBtn.textContent = 'Kirim Komentar';
        }
        if (window.turnstile) {
          try { window.turnstile.reset(); } catch(e) {}
        }
      }
    });
  }

  /* ===== 15. INIT ===== */

  sendView();
  fetchStats();
  fetchKomentar(true);

});
