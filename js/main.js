/* ============================================================
   main.js — UI Global Fikya.id
   Covers: progress bar, footer tahun.

   Dark mode, jam/tanggal, dan search diurus oleh navbar.js
   karena elemen-elemen tersebut hidup di dalam <site-navbar>.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== FOOTER TAHUN ===== */
  const elTahun = document.getElementById('tahun');
  if (elTahun) elTahun.textContent = new Date().getFullYear();

  /* ===== READING PROGRESS BAR ===== */
  /*
    Hanya aktif di halaman artikel/dzikir yang punya #progress-bar.
    Di index.html elemen ini tidak ada, listener tidak dipasang.
  */
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct       = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = `${Math.min(pct, 100)}%`;
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  /* ===== READING TIME ===== */         // ← TAMBAHKAN DI SINI
  const elReadTime = document.getElementById('read-time');
  if (elReadTime) {
    const contentEl = document.querySelector('.dzikir-container') || document.querySelector('main');
    if (contentEl) {
      const text      = contentEl.textContent || '';
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      const minutes   = Math.ceil(wordCount / 200);
      elReadTime.textContent = minutes;
    }
  }

});
