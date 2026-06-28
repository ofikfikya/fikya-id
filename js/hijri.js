/* ============================================================
   hijri.js — Utilitas Kalender Hijriah Fikya.id
   Satu sumber kebenaran untuk semua format tanggal Hijriah.

   Dipakai oleh:
   - navbar.js         (tampilan jam/tanggal di navbar)
   - dzikir-certificate.js (tanggal di sertifikat)

   Cara pakai:
   Muat file ini SEBELUM navbar.js dan dzikir-certificate.js:
     <script src="/js/hijri.js" defer></script>
     <script src="/js/navbar.js" defer></script>

   Lalu panggil fungsi global:
     window.HijriCalendar.format(date)
     → "Jum'at, 4 Muharram 1448 H"

     window.HijriCalendar.formatShort(date)
     → "4 Muharram 1448 H"  (tanpa nama hari, untuk navbar)
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     KONFIGURASI — ubah di sini jika tanggal tidak sesuai
     penetapan hilal resmi di lokasi Anda (Abu Dhabi - UAE).

     HIJRI_OFFSET_DAYS:
       0  = gunakan hasil kalkulasi Intl (default)
      +1  = geser 1 hari ke depan (jika Intl terlalu cepat)
      -1  = geser 1 hari ke belakang (jika Intl terlalu lambat)
  ============================================================ */
  const HIJRI_OFFSET_DAYS = 0;

  /* ============================================================
     NAMA HARI ISLAM
     Index 0 = Ahad (sesuai getDay() 0 = Minggu)
  ============================================================ */
  const HARI_ISLAM = [
    'Al Ahad', 'Al Ithnayn', 'Ath Thulatha', 'Al Arbia', 'Al Khamis', "Al Jumuah", 'As Sabt',
  ];

  /* ============================================================
     NAMA BULAN HIJRIAH
  ============================================================ */
  const BULAN_HIJRI = [
    'Muharram',        /* 1  */
    'Safar',           /* 2  */
    "Rabi'ul Awwal",   /* 3  */
    "Rabi'ul Akhir",   /* 4  */
    'Jumadal Ula',     /* 5  */
    'Jumadal Akhirah', /* 6  */
    'Rajab',           /* 7  */
    "Sya'ban",         /* 8  */
    'Ramadhan',        /* 9  */
    'Syawwal',         /* 10 */
    "Dzulqa'dah",      /* 11 */
    'Dzulhijjah',      /* 12 */
  ];

  /* ============================================================
     HELPER — parse Intl ke bagian-bagian terpisah
  ============================================================ */
  const getParts = (date) => {
    const adjusted = new Date(date);
    adjusted.setDate(adjusted.getDate() + HIJRI_OFFSET_DAYS);

    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day  : 'numeric',
      month: 'numeric',
      year : 'numeric',
    }).formatToParts(adjusted);

    const parts = {};
    fmt.forEach(p => { parts[p.type] = p.value; });

    return {
      hari  : HARI_ISLAM[date.getDay()],
      tgl   : parts.day  || '',
      bulan : BULAN_HIJRI[parseInt(parts.month || '1', 10) - 1] || '',
      tahun : (parts.year || '').replace(/[^0-9]/g, ''),
    };
  };

  /* ============================================================
     API PUBLIK
  ============================================================ */
  const HijriCalendar = {

    /*
      format(date) — format lengkap dengan nama hari
      Contoh: "Jum'at, 4 Muharram 1448 H"
      Dipakai oleh: dzikir-certificate.js
    */
    format(date) {
      try {
        const { hari, tgl, bulan, tahun } = getParts(date);
        return `${hari}, ${tgl} ${bulan} ${tahun} H`;
      } catch (e) {
        return '';
      }
    },

    /*
      formatShort(date) — format pendek tanpa nama hari
      Contoh: "4 Muharram 1448 H"
      Dipakai oleh: navbar.js
    */
    formatShort(date) {
      try {
        const { tgl, bulan, tahun } = getParts(date);
        return `${tgl} ${bulan} ${tahun} H`;
      } catch (e) {
        return '';
      }
    },

    /*
      offset — nilai offset yang sedang aktif (readonly)
      Berguna untuk debugging di console browser.
    */
    get offset() {
      return HIJRI_OFFSET_DAYS;
    },
  };

  /* Ekspos ke window agar bisa diakses file lain */
  window.HijriCalendar = HijriCalendar;

})();
