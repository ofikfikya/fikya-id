/* ============================================================
   dzikir-tools.js — Fitur Copy Button & Back to Top
   Fikya.id — 2026

   Covers:
   1. Tombol copy untuk setiap .dzikir-arabic, .dzikir-latin,
      dan .dzikir-arti dalam setiap .dzikir-card.
      Teks yang disalin adalah teks bersih (tanpa HTML).
   2. Tombol back to top — muncul saat scroll > 300px,
      diletakkan di samping stat tayangan & komentar.

   Tidak ada dependency — vanilla JS murni.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     BAGIAN 1: COPY BUTTONS
     ============================================================ */

  /* Label dan ikon per tipe elemen */
  const COPY_CONFIG = {
    'dzikir-arabic' : { label: 'Salin Arab',    icon: '📋', labelDone: 'Tersalin!', iconDone: '✅' },
    'dzikir-latin'  : { label: 'Salin Latin',   icon: '📋', labelDone: 'Tersalin!', iconDone: '✅' },
    'dzikir-arti'   : { label: 'Salin Terjemah',icon: '📋', labelDone: 'Tersalin!', iconDone: '✅' },
  };

  /*
    Buat satu tombol copy untuk satu elemen target.
    Tombol disisipkan langsung SETELAH elemen target.
  */
  const buildCopyBtn = (targetEl, type) => {
    const cfg = COPY_CONFIG[type];
    const btn = document.createElement('button');
    btn.className    = `dzikir-copy-btn dzikir-copy-btn--${type}`;
    btn.setAttribute('aria-label', cfg.label);
    btn.setAttribute('title', cfg.label);
    btn.innerHTML    = `<span class="dzikir-copy-icon" aria-hidden="true">${cfg.icon}</span><span class="dzikir-copy-label">${cfg.label}</span>`;

    btn.addEventListener('click', async () => {
      /* Ambil teks bersih — hapus teks <br> yang jadi newline di innerText */
      const text = targetEl.innerText.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        /* Fallback untuk browser lama */
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity  = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      /* Feedback visual sementara */
      const iconEl  = btn.querySelector('.dzikir-copy-icon');
      const labelEl = btn.querySelector('.dzikir-copy-label');
      iconEl.textContent  = cfg.iconDone;
      labelEl.textContent = cfg.labelDone;
      btn.classList.add('dzikir-copy-btn--copied');

      setTimeout(() => {
        iconEl.textContent  = cfg.icon;
        labelEl.textContent = cfg.label;
        btn.classList.remove('dzikir-copy-btn--copied');
      }, 2000);
    });

    return btn;
  };

  /*
    Untuk setiap .dzikir-card, cari elemen arab/latin/arti
    lalu sisipkan tombol copy setelahnya.

    Catatan khusus .dzikir-arti--spaced (sebelum separator):
    tombol copy disisipkan sebelum <hr> agar tidak terpisah
    dari konten yang bersangkutan.
  */
  const initCopyButtons = () => {
    document.querySelectorAll('.dzikir-card').forEach((card) => {
      ['dzikir-arabic', 'dzikir-latin', 'dzikir-arti'].forEach((type) => {
        card.querySelectorAll(`.${type}`).forEach((el) => {
          /*
            Hindari menyisipkan tombol pada elemen .dzikir-arti
            yang sebenarnya adalah .dzikir-faedah (tidak ada, tapi
            untuk jaga-jaga dari selector yang overlap).
          */
          if (type === 'dzikir-arti' && el.classList.contains('dzikir-faedah')) return;

          const btn = buildCopyBtn(el, type);

          /*
            Untuk .dzikir-arti--spaced, sisipkan tombol sebelum
            <hr class="dzikir-separator"> berikutnya jika ada,
            agar tombol tetap menempel di bawah terjemahan.
          */
          const nextSibling = el.nextElementSibling;
          if (nextSibling && nextSibling.classList.contains('dzikir-separator')) {
            card.insertBefore(btn, nextSibling);
          } else {
            el.insertAdjacentElement('afterend', btn);
          }
        });
      });
    });
  };

  /* ============================================================
     BAGIAN 2: BACK TO TOP
     Tombol diletakkan di samping .article-stats (tayangan & komentar).
     ============================================================ */

  const initBackToTop = () => {
    const statsEl = document.querySelector('.article-stats');
    if (!statsEl) return;

    /* Buat tombol */
    const btn = document.createElement('button');
    btn.className   = 'dzikir-back-top';
    btn.setAttribute('aria-label', 'Kembali ke atas halaman');
    btn.setAttribute('title', 'Kembali ke atas');
    btn.innerHTML   = '<span aria-hidden="true">↑</span> Ke Atas';

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /*
      Bungkus .article-stats dalam container flex agar tombol
      bisa duduk di samping kanan stats tanpa menggeser layout.
    */
    const wrapper = document.createElement('div');
    wrapper.className = 'dzikir-stats-row';
    statsEl.parentNode.insertBefore(wrapper, statsEl);
    wrapper.appendChild(statsEl);
    wrapper.appendChild(btn);
  };

  /* ============================================================
     INIT
     ============================================================ */

  const init = () => {
    initCopyButtons();
    initBackToTop();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
