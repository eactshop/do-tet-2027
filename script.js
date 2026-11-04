/* =========================================================
 * TẾT 2027 LANDING PAGE – script.js
 * Vanilla JS, không framework. Toàn bộ cấu hình nằm trong CONFIG bên dưới.
 * ========================================================= */
(function () {
  'use strict';

  /* =======================================================
   * 1. CONFIG – CHỈ CẦN SỬA Ở ĐÂY
   * ===================================================== */
  const CONFIG = {
    // URL Web App của Google Apps Script (Deploy > Web app > copy URL kết thúc bằng /exec).
    // Đây là nơi DUY NHẤT chứa URL – không hardcode ở chỗ khác.
    API_URL: 'https://script.google.com/macros/s/AKfycbxXXbIadJaKODe70ucQP7xAPaOI5DBcUBGq8C6xGa-RUrk5TCVg00o5NuCqgS6Ph7QC/exec',

    // Khi chưa dán API_URL hợp lệ: true = giả lập đặt hàng thành công (để xem demo),
    // false = báo lỗi. Nhớ chuyển false (hoặc dán URL thật) trước khi chạy quảng cáo.
    DEMO_MODE_WHEN_NO_API: true,

    REQUEST_TIMEOUT_MS: 20000,
    SOURCE: 'TetLandingPage2027',

    // Tham số URL chứa tên chiến dịch / nhóm quảng cáo (lấy tham số đầu tiên có giá trị).
    // Trong Facebook Ads → Quảng cáo → Tham số URL, dán:
    // utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}
    TRACKING: {
      campaign: ['utm_campaign', 'campaign_name'],
      adset: ['utm_adset', 'adset_name', 'utm_term'],
    },

    SHOP: {
      name: 'Tết Decor House',
      hotline: '0869829725',      // Số hotline (gọi điện)
      zalo: '0869829725',         // Số Zalo
      email: 'hotro@tetdecor.vn',
      address: 'Hà Nội, Việt Nam',
    },

    // Số liệu hiển thị – thay bằng số liệu thật của shop
    STATS: { rating: 5.0, reviews: 128, sold: 1250 },

    // Countdown flash sale: bật/tắt bằng enabled
    // Mỗi lần khách mở trang, đồng hồ đếm ngược từ durationMinutes về 0
    COUNTDOWN: {
      enabled: true,
      durationMinutes: 15,
      urgentMinutes: 3,                     // dưới mốc này đồng hồ nhấp nháy mạnh hơn
      label: 'FLASH SALE TẾT – Ưu đãi kết thúc sau',
      endedLabel: 'Flash sale đã kết thúc – vẫn còn giá ưu đãi!',
      hideWhenEnded: false,
    },

    // Dữ liệu địa chỉ: provinces.open-api.vn
    // 'v2' = địa giới mới 2 cấp (Tỉnh → Phường/Xã, hiệu lực từ 01/07/2025) – KHUYẾN NGHỊ
    // 'v1' = địa giới cũ 3 cấp (Tỉnh → Quận/Huyện → Phường/Xã)
    // Nếu nguồn chính lỗi, hệ thống tự thử nguồn còn lại, cuối cùng dùng danh sách 34 tỉnh dự phòng.
    ADDRESS: {
      MODE: 'v1',
      BASE_V2: 'https://provinces.open-api.vn/api/v2',
      BASE_V1: 'https://provinces.open-api.vn/api',
      TIMEOUT_MS: 10000,
    },

    MAX_QUANTITY: 99,
  };

  /* =======================================================
   * 2. UTILITIES
   * ===================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const formatVND = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';
  const escapeHTML = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad2 = (n) => String(n).padStart(2, '0');

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function isApiConfigured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(CONFIG.API_URL.trim());
  }

  function randomHex(bytes) {
    if (window.crypto && window.crypto.getRandomValues) {
      return Array.from(window.crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let s = '';
    for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return s;
  }

  /** Mã tham chiếu duy nhất phía client – dùng làm idempotency key chống tạo đơn trùng */
  function generateClientOrderRef() {
    return ('TET2027-' + Date.now().toString(36) + '-' + randomHex(6)).toUpperCase();
  }

  /**
   * Tên chiến dịch / nhóm quảng cáo lấy từ URL (Facebook Ads). Lưu vào sessionStorage
   * để vẫn giữ được nếu khách tải lại trang mà URL đã mất tham số.
   */
  const AdTracking = (() => {
    const KEY = 'tet2027_ad_tracking';
    const params = new URLSearchParams(location.search);
    const pick = (names) => names.map((n) => (params.get(n) || '').trim()).find(Boolean) || '';
    const fromUrl = { campaign: pick(CONFIG.TRACKING.campaign), adset: pick(CONFIG.TRACKING.adset) };
    let data = fromUrl;
    try {
      if (fromUrl.campaign || fromUrl.adset) sessionStorage.setItem(KEY, JSON.stringify(fromUrl));
      else data = JSON.parse(sessionStorage.getItem(KEY) || 'null') || fromUrl;
    } catch (e) { /* storage bị chặn – dùng giá trị từ URL */ }
    return { campaign: String(data.campaign || '').slice(0, 200), adset: String(data.adset || '').slice(0, 200) };
  })();

  function scrollToEl(target) {
    const el = typeof target === 'string' ? $(target) : target;
    if (el) el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /* =======================================================
   * 3. ẢNH MINH HỌA (SVG tự sinh)
   * Thay bằng ảnh thật: sửa mảng `images` trong PRODUCTS, ví dụ
   *   images: ['images/de-do-1.jpg', 'images/de-do-2.jpg']
   * ===================================================== */
  const Art = (() => {
    const R = '#D90000', RD = '#A80000', G = '#FFD700', GD = '#E0A800';
    const uri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const f = (n) => Number(n).toFixed(1);

    const blossom = (x, y, r = 12, c = G, center = RD) => {
      let p = '';
      for (let i = 0; i < 5; i++) {
        const a = ((i * 72 - 90) * Math.PI) / 180;
        p += `<circle cx="${f(x + Math.cos(a) * r)}" cy="${f(y + Math.sin(a) * r)}" r="${f(r * 0.72)}" fill="${c}"/>`;
      }
      return `<g>${p}<circle cx="${x}" cy="${y}" r="${f(r * 0.42)}" fill="${center}"/></g>`;
    };

    const cloud = (x, y, s = 1, o = 0.3) =>
      `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${GD}" stroke-width="4" stroke-linecap="round" opacity="${o}"><path d="M0 30 a18 18 0 1 1 18 18 h80 a14 14 0 1 0 -14 -14"/><path d="M50 0 a10 10 0 1 1 10 10 h50"/></g>`;

    const branch = (x, y, s = 1, fc = G, flip = false) =>
      `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M0 0 C60 -20 120 -10 190 -70 M80 -18 C100 -50 130 -60 150 -100 M140 -42 C170 -32 200 -22 232 -32" stroke="#6B3A1E" stroke-width="7" fill="none" stroke-linecap="round"/>${blossom(190, -72, 13, fc)}${blossom(150, -102, 11, fc)}${blossom(232, -32, 12, fc)}${blossom(112, -30, 10, fc)}${blossom(60, -13, 9, fc)}</g>`;

    const lantern = (x, y, s = 1) =>
      `<g transform="translate(${x} ${y}) scale(${s})"><line x1="0" y1="-70" x2="0" y2="-34" stroke="${GD}" stroke-width="3"/><rect x="-15" y="-36" width="30" height="9" rx="3" fill="${G}"/><ellipse cx="0" cy="0" rx="36" ry="31" fill="${R}" stroke="${G}" stroke-width="3"/><path d="M-21 -25 Q-33 0 -21 25 M0 -31 V31 M21 -25 Q33 0 21 25" stroke="${G}" stroke-width="2" fill="none" opacity=".85"/><rect x="-15" y="27" width="30" height="9" rx="3" fill="${G}"/><path d="M-7 36 V66 M0 36 V72 M7 36 V66" stroke="${G}" stroke-width="2.5"/></g>`;

    const goat = (x, y, s = 1, flip = false, body = R) =>
      `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">
        <path d="M-58 -8 Q-82 -22 -72 -36" stroke="${G}" stroke-width="6" fill="none" stroke-linecap="round"/>
        <rect x="-42" y="18" width="13" height="44" rx="6" fill="${RD}"/><rect x="-18" y="22" width="13" height="42" rx="6" fill="${RD}"/>
        <rect x="14" y="22" width="13" height="42" rx="6" fill="${RD}"/><rect x="36" y="18" width="13" height="44" rx="6" fill="${RD}"/>
        <rect x="-42" y="54" width="13" height="8" rx="3" fill="${G}"/><rect x="-18" y="56" width="13" height="8" rx="3" fill="${G}"/>
        <rect x="14" y="56" width="13" height="8" rx="3" fill="${G}"/><rect x="36" y="54" width="13" height="8" rx="3" fill="${G}"/>
        <ellipse cx="0" cy="0" rx="62" ry="40" fill="${body}" stroke="${G}" stroke-width="4"/>
        <path d="M-34 2 q12 -18 24 0 t24 0 t24 0" stroke="${G}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M-26 18 q10 -12 20 0 t20 0" stroke="${G}" stroke-width="2.5" fill="none" opacity=".8" stroke-linecap="round"/>
        <path d="M40 -24 L56 -40" stroke="${body}" stroke-width="22" stroke-linecap="round"/>
        <circle cx="66" cy="-46" r="27" fill="${body}" stroke="${G}" stroke-width="4"/>
        <path d="M56 -68 C38 -104 84 -116 82 -82" stroke="${G}" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M72 -68 C70 -100 106 -102 100 -74" stroke="${GD}" stroke-width="7" fill="none" stroke-linecap="round"/>
        <ellipse cx="46" cy="-56" rx="12" ry="6" fill="${RD}" transform="rotate(-25 46 -56)"/>
        <circle cx="74" cy="-50" r="4" fill="${G}"/>
        <path d="M76 -24 L80 0 L88 -24Z" fill="${G}"/>
        ${blossom(52, -70, 6, G, R)}
      </g>`;

    const fan = (x, y, s = 1, rot = 0) => {
      const pt = (deg, r) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
      const [ax, ay] = pt(-150, 104), [bx, by] = pt(-30, 104);
      let ribs = '';
      for (let i = 0; i <= 8; i++) {
        const [px, py] = pt(-150 + i * 15, 100);
        ribs += `<line x1="0" y1="0" x2="${f(px)}" y2="${f(py)}" stroke="${G}" stroke-width="2.5"/>`;
      }
      return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 L${f(ax)} ${f(ay)} A104 104 0 0 1 ${f(bx)} ${f(by)} Z" fill="${R}" stroke="${G}" stroke-width="4"/>${ribs}<path d="M${f(ax * 0.55)} ${f(ay * 0.55)} A57 57 0 0 1 ${f(bx * 0.55)} ${f(by * 0.55)}" stroke="${G}" stroke-width="3" fill="none"/>${blossom(0, -78, 10, G, RD)}<circle r="9" fill="${G}"/><path d="M0 8 V40" stroke="${G}" stroke-width="3"/><circle cy="44" r="5" fill="${R}"/></g>`;
    };

    const scroll = (x, y, words, s = 1) => {
      const h = words.length * 46 + 40;
      const text = words.map((w, i) => `<text x="0" y="${52 + i * 46}" text-anchor="middle" font-family="Be Vietnam Pro, Arial, sans-serif" font-size="24" font-weight="800" fill="${G}">${w}</text>`).join('');
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-44" y="0" width="88" height="${h}" rx="6" fill="${R}" stroke="${G}" stroke-width="4"/><rect x="-36" y="8" width="72" height="${h - 16}" rx="4" fill="none" stroke="${G}" stroke-width="1.5" stroke-dasharray="4 4"/><rect x="-54" y="-12" width="108" height="16" rx="8" fill="${RD}"/><rect x="-54" y="${h - 4}" width="108" height="16" rx="8" fill="${RD}"/>${text}</g>`;
    };

    const garland = (y, items = 7) => {
      let out = `<path d="M40 ${y} Q400 ${y + 120} 760 ${y}" stroke="${GD}" stroke-width="4" fill="none"/>`;
      for (let i = 1; i < items; i++) {
        const t = i / items;
        const x = 40 + 720 * t;
        const yy = y + 2 * (1 - t) * t * 120;
        out += i % 2 ? lantern(x, yy + 48, 0.55) : blossom(x, yy + 14, 14, G);
      }
      return out;
    };

    const frame = (inner, { bg1 = '#FFF9EF', bg2 = '#FBE0BC', caption = '' } = {}) =>
      uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><radialGradient id="bg" cx="50%" cy="42%" r="72%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient></defs><rect width="800" height="800" fill="url(#bg)"/>${cloud(40, 110, 1.4)}${cloud(560, 670, 1.6)}<circle cx="400" cy="410" r="270" fill="none" stroke="${G}" stroke-width="3" stroke-dasharray="3 12" opacity=".8"/>${inner}${caption ? `<text x="400" y="760" text-anchor="middle" font-family="Be Vietnam Pro, Arial, sans-serif" font-size="30" font-weight="800" fill="${RD}">${caption}</text>` : ''}</svg>`);

    const plinth = (y, w = 520) => `<rect x="${400 - w / 2}" y="${y}" width="${w}" height="34" rx="17" fill="${RD}"/><rect x="${400 - w / 2 + 14}" y="${y + 8}" width="${w - 28}" height="4" rx="2" fill="${G}" opacity=".8"/>`;
    const title2027 = (y, size = 92) => `<text x="400" y="${y}" text-anchor="middle" font-family="Be Vietnam Pro, Arial, sans-serif" font-size="${size}" font-weight="900" fill="${G}" stroke="${RD}" stroke-width="6" paint-order="stroke">2027</text>`;

    return {
      goatPair: () => frame(`${lantern(110, 150, 1)}${lantern(690, 150, 1)}${branch(40, 330, 0.9, G)}${branch(760, 330, 0.9, G, true)}${title2027(250)}${goat(255, 470, 1.35)}${goat(545, 470, 1.35, true)}${plinth(548)}`, { caption: 'Cặp Dê Đỏ Đinh Mùi 2027' }),
      goatSet: () => frame(`${garland(70)}${fan(170, 420, 0.95, -18)}${fan(630, 420, 0.95, 18)}${goat(290, 520, 1.05)}${goat(510, 520, 1.05, true)}${plinth(582, 600)}${lantern(400, 300, 1.2)}`, { caption: 'Set Đầy Đủ – trọn góc Tết' }),
      goatDetail: () => frame(`${branch(30, 250, 1, '#FFB7C5')}${branch(770, 250, 1, '#FFB7C5', true)}${goat(360, 470, 2.4)}`, { bg1: '#FFFDF7', bg2: '#FFE6C7', caption: 'Chi tiết hoa văn mạ vàng' }),
      combo: () => {
        const box = (x) => `<g><rect x="${x - 95}" y="300" width="190" height="230" rx="18" fill="#FFFFFF" stroke="${R}" stroke-width="5"/><rect x="${x - 95}" y="300" width="190" height="46" rx="18" fill="${R}"/><text x="${x}" y="331" text-anchor="middle" font-family="Be Vietnam Pro, Arial, sans-serif" font-size="20" font-weight="800" fill="${G}">SET TẾT 2027</text>${goat(x - 10, 450, 0.82)}</g>`;
        return frame(`${title2027(210, 70)}${box(185)}${box(400)}${box(615)}<circle cx="660" cy="290" r="48" fill="${G}" stroke="${R}" stroke-width="4"/><text x="660" y="304" text-anchor="middle" font-family="Be Vietnam Pro, Arial, sans-serif" font-size="40" font-weight="900" fill="${R}">x3</text>${plinth(560, 640)}`, { caption: 'Combo 3 Set – tiết kiệm 44%' });
      },
      packaging: () => frame(`<rect x="210" y="300" width="380" height="300" rx="22" fill="${R}" stroke="${G}" stroke-width="5"/><path d="M210 360 H590" stroke="${G}" stroke-width="4"/><rect x="380" y="300" width="40" height="300" fill="${G}"/><path d="M400 300 C340 220 280 260 330 300 Z M400 300 C460 220 520 260 470 300 Z" fill="${G}" stroke="${GD}" stroke-width="3"/>${goat(300, 480, 0.6)}${goat(500, 480, 0.6, true)}${blossom(250, 560, 12)}${blossom(550, 560, 12)}${title2027(200, 64)}`, { caption: 'Đóng hộp chắc chắn, làm quà biếu' }),
      lanterns: () => frame(`${lantern(220, 300, 1.7)}${lantern(400, 250, 2.2)}${lantern(580, 300, 1.7)}${branch(40, 640, 0.9, G)}${branch(760, 640, 0.9, G, true)}`, { caption: 'Đèn Lồng Trang Trí Tết' }),
      fans: () => frame(`${fan(260, 470, 1.5, -20)}${fan(540, 470, 1.5, 20)}${fan(400, 420, 1.8)}`, { caption: 'Quạt Giấy Trang Trí Tết' }),
      garlandArt: () => frame(`${garland(150, 9)}${garland(380, 7)}`, { caption: 'Dây Treo Tết Kim Tuyến' }),
      peach: () => frame(`<path d="M400 690 C380 560 420 470 370 360 M390 520 C450 470 520 470 560 400 M380 420 C320 380 280 330 260 250 M370 360 C380 280 430 230 470 170" stroke="#6B3A1E" stroke-width="12" fill="none" stroke-linecap="round"/>${[[560, 400], [520, 450], [260, 250], [300, 320], [470, 170], [430, 230], [340, 400], [450, 480], [600, 360], [230, 300], [500, 140], [400, 300]].map(([x, y], i) => blossom(x, y, 16 + (i % 3) * 3, '#FF9EB5', G)).join('')}<path d="M330 690 H470 L450 740 H350 Z" fill="${R}" stroke="${G}" stroke-width="4"/>`, { caption: 'Cành Hoa Đào Tết' }),
      couplet: () => frame(`${scroll(180, 160, ['An', 'Khang', 'Thịnh', 'Vượng', 'Phúc'])}${scroll(620, 160, ['Vạn', 'Sự', 'Như', 'Ý', 'Lộc'])}<rect x="300" y="300" width="200" height="200" rx="10" fill="${R}" stroke="${G}" stroke-width="5" transform="rotate(45 400 400)"/><text x="400" y="425" text-anchor="middle" font-family="Be Vietnam Pro, Arial, sans-serif" font-size="64" font-weight="900" fill="${G}">Xuân</text>`, { caption: 'Câu Đối Tết' }),
    };
  })();

  /* =======================================================
   * 4. DỮ LIỆU SẢN PHẨM
   * Lưu ý: id + giá phải KHỚP với CATALOG trong google-apps-script.gs
   * (backend tự tính tiền theo CATALOG, không tin giá từ frontend).
   * ===================================================== */
  const MAIN_PRODUCT_ID = 'set-de-do-2027';

  const PRODUCTS = {
    [MAIN_PRODUCT_ID]: {
      id: MAIN_PRODUCT_ID,
      name: 'Set Decor Tết Cặp Dê Đỏ New 2027',
      badges: [{ text: 'Bán chạy nhất', type: 'hot', icon: 'flame' }, { text: 'Free Shipping', type: 'ship', icon: 'truck' }],
      images: ['img/mã 3.jpg','img/thuc te 1.jpg','img/thuc te 2.jpg','img/combo dê quạt tết.jpg','img/combo dê quạt tết 2027.jpg','img/combo dê + 2027 + dải treo.jpg'].map(encodeURI),
      variants: [
        { id: 'cap-lien-de', sku: 'TET27-LD', name: '1 Cặp Liễn Dê', price: 169000, compareAt: 290000, note: 'Miễn ship', imageIndex: 0 },
        { id: 'combo-de-quat', sku: 'TET27-LD-KQ', name: 'Combo Liễn Dê + Khánh Quạt', price: 199000, compareAt: 379000, note: 'Miễn ship', imageIndex: 3 },
        { id: 'combo-de-quat-2027', sku: 'TET27-LD-KQ-SO', name: 'Combo Liễn Dê + Khánh Quạt + Số 2027', price: 249000, compareAt: 529000, note: 'Miễn ship', imageIndex: 4 },
        { id: 'combo-de-treo-2027', sku: 'TET27-LD-DT-SO', name: 'Combo Liễn Dê + Dải Treo + Số 2027', price: 269000, compareAt: 639000, note: 'Miễn ship', imageIndex: 5 },
      ],
    },
    'den-long-tet': {
      id: 'den-long-tet', name: 'Đèn Lồng Trang Trí Tết',
      badges: [{ text: 'Free Shipping', type: 'ship', icon: 'truck' }],
      images: [Art.lanterns()],
      variants: [{ id: 'default', name: 'Đèn Lồng Trang Trí Tết', price: 49000, compareAt: 69000, note: 'Đèn lồng vải đỏ viền vàng', imageIndex: 0 }],
    },
    'quat-giay-tet': {
      id: 'quat-giay-tet', name: 'Quạt Giấy Trang Trí Tết',
      badges: [{ text: 'Free Shipping', type: 'ship', icon: 'truck' }],
      images: [Art.fans()],
      variants: [{ id: 'default', name: 'Quạt Giấy Trang Trí Tết', price: 29000, compareAt: 39000, note: 'Quạt giấy đỏ in hoa mai', imageIndex: 0 }],
    },
    'day-treo-tet': {
      id: 'day-treo-tet', name: 'Dây Treo Tết',
      badges: [{ text: 'Free Shipping', type: 'ship', icon: 'truck' }],
      images: [Art.garlandArt()],
      variants: [{ id: 'default', name: 'Dây Treo Tết', price: 19000, compareAt: null, note: 'Dây kim tuyến kèm phụ kiện', imageIndex: 0 }],
    },
    'canh-hoa-dao-tet': {
      id: 'canh-hoa-dao-tet', name: 'Cành Hoa Đào Tết',
      badges: [{ text: 'Free Shipping', type: 'ship', icon: 'truck' }],
      images: [Art.peach()],
      variants: [{ id: 'default', name: 'Cành Hoa Đào Tết', price: 39000, compareAt: 55000, note: 'Hoa đào lụa giả tự nhiên', imageIndex: 0 }],
    },
    'cau-doi-tet': {
      id: 'cau-doi-tet', name: 'Câu Đối Tết',
      badges: [{ text: 'Free Shipping', type: 'ship', icon: 'truck' }],
      images: [Art.couplet()],
      variants: [{ id: 'default', name: 'Câu Đối Tết', price: 25000, compareAt: null, note: 'Cặp câu đối nhung chữ vàng', imageIndex: 0 }],
    },
  };

  /* =======================================================
   * 5. STATE
   * ===================================================== */
  const state = {
    productId: MAIN_PRODUCT_ID,
    variantId: PRODUCTS[MAIN_PRODUCT_ID].variants[0].id,
    qty: 1,
    submitting: false,
    idempotencyKey: null, // giữ nguyên khi gửi lại sau lỗi mạng → backend không tạo đơn trùng
  };

  const getProduct = () => PRODUCTS[state.productId];
  const getVariant = () => getProduct().variants.find((v) => v.id === state.variantId) || null;

  /* =======================================================
   * 6. TOAST
   * ===================================================== */
  const Toast = {
    show(message, type = 'info', duration = 3800) {
      const wrap = $('#toastWrap');
      if (!wrap) return;
      const icons = { success: 'check-circle-2', error: 'alert-circle', info: 'info' };
      const el = document.createElement('div');
      el.className = `toast toast--${type}`;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      el.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i><span>${escapeHTML(message)}</span>`;
      wrap.appendChild(el);
      refreshIcons();
      requestAnimationFrame(() => el.classList.add('is-visible'));
      setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 300);
      }, duration);
    },
  };

  /* =======================================================
   * 7. LIGHTBOX (zoom ảnh)
   * ===================================================== */
  const Lightbox = {
    images: [], index: 0,
    init() {
      this.dialog = $('#lightbox');
      this.img = $('#lightboxImg');
      this.stage = $('#lightboxStage');
      this.counter = $('#lightboxCounter');
      if (!this.dialog || typeof this.dialog.showModal !== 'function') return;
      $('#lightboxClose').addEventListener('click', () => this.close());
      $('#lightboxPrev').addEventListener('click', () => this.go(this.index - 1));
      $('#lightboxNext').addEventListener('click', () => this.go(this.index + 1));
      this.img.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = this.img.getBoundingClientRect();
        this.img.style.transformOrigin = `${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`;
        this.stage.classList.toggle('is-zoomed');
      });
      this.dialog.addEventListener('click', (e) => { if (e.target === this.dialog || e.target === this.stage) this.close(); });
      this.dialog.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') this.go(this.index - 1);
        if (e.key === 'ArrowRight') this.go(this.index + 1);
      });
      this.dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
    },
    open(images, index = 0) {
      if (!this.dialog || typeof this.dialog.showModal !== 'function') return;
      this.images = images;
      this.go(index);
      this.dialog.showModal();
      document.body.classList.add('modal-open');
    },
    go(i) {
      const n = this.images.length;
      if (!n) return;
      this.index = (i + n) % n;
      this.stage.classList.remove('is-zoomed');
      this.img.src = this.images[this.index];
      this.img.alt = `${getProduct().name} – ảnh ${this.index + 1}`;
      this.counter.textContent = `${this.index + 1} / ${n}`;
      const multi = n > 1;
      $('#lightboxPrev').hidden = !multi;
      $('#lightboxNext').hidden = !multi;
    },
    close() { this.dialog.close(); },
  };

  /* =======================================================
   * 8. GALLERY (carousel + thumbnail + swipe)
   * ===================================================== */
  const Gallery = {
    images: [], index: 0, moved: false,
    init() {
      this.track = $('#galleryTrack');
      this.thumbs = $('#galleryThumbs');
      this.counter = $('#galleryCounter');
      this.stage = $('.gallery__stage');
      $('#galleryPrev').addEventListener('click', () => this.go(this.index - 1));
      $('#galleryNext').addEventListener('click', () => this.go(this.index + 1));
      $('#galleryZoom').addEventListener('click', () => Lightbox.open(this.images, this.index));
      this.track.addEventListener('click', (e) => {
        if (this.moved) return;
        if (e.target.closest('img')) Lightbox.open(this.images, this.index);
      });
      this.thumbs.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-index]');
        if (btn) this.go(Number(btn.dataset.index));
      });
      this.stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.index - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.index + 1); }
      });
      this.bindSwipe();
    },
    bindSwipe() {
      let startX = 0, startY = 0, dx = 0, tracking = false, horizontal = null;
      const width = () => this.stage.clientWidth || 1;
      this.stage.addEventListener('touchstart', (e) => {
        if (this.images.length < 2) return;
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY; dx = 0;
        tracking = true; horizontal = null; this.moved = false;
      }, { passive: true });
      this.stage.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        const mx = t.clientX - startX, my = t.clientY - startY;
        if (horizontal === null && (Math.abs(mx) > 6 || Math.abs(my) > 6)) horizontal = Math.abs(mx) > Math.abs(my);
        if (!horizontal) return;
        dx = mx;
        this.moved = Math.abs(dx) > 8;
        this.track.classList.add('is-dragging');
        const pct = (dx / width()) * 100;
        this.track.style.transform = `translateX(${-this.index * 100 + pct}%)`;
      }, { passive: true });
      const end = () => {
        if (!tracking) return;
        tracking = false;
        this.track.classList.remove('is-dragging');
        if (horizontal && Math.abs(dx) > Math.min(60, width() * 0.15)) this.go(this.index + (dx < 0 ? 1 : -1));
        else this.update();
        setTimeout(() => { this.moved = false; }, 50);
      };
      this.stage.addEventListener('touchend', end);
      this.stage.addEventListener('touchcancel', end);
    },
    set(images, alt, startIndex = 0) {
      this.images = images;
      this.alt = alt;
      this.track.innerHTML = images.map((src, i) => `
        <div class="gallery__slide" role="group" aria-roledescription="slide" aria-label="Ảnh ${i + 1} / ${images.length}">
          <img src="${escapeHTML(src)}" alt="${escapeHTML(alt)} – ảnh ${i + 1}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false" />
        </div>`).join('');
      this.thumbs.innerHTML = images.length > 1 ? images.map((src, i) => `
        <button type="button" class="gallery__thumb" role="tab" data-index="${i}" aria-label="Xem ảnh ${i + 1}">
          <img src="${escapeHTML(src)}" alt="" loading="lazy" decoding="async" />
        </button>`).join('') : '';
      const multi = images.length > 1;
      $('#galleryPrev').hidden = !multi;
      $('#galleryNext').hidden = !multi;
      this.counter.hidden = !multi;
      this.index = Math.min(startIndex, images.length - 1);
      this.track.classList.add('is-dragging'); // nhảy ngay, không animate khi đổi sản phẩm
      this.update();
      requestAnimationFrame(() => this.track.classList.remove('is-dragging'));
    },
    go(i) {
      const n = this.images.length;
      if (!n) return;
      this.index = (i + n) % n;
      this.update();
    },
    update() {
      this.track.style.transform = `translateX(-${this.index * 100}%)`;
      this.counter.textContent = `${this.index + 1}/${this.images.length}`;
      $$('.gallery__thumb', this.thumbs).forEach((t, i) => {
        const active = i === this.index;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
        if (active) {
          const left = t.offsetLeft - (this.thumbs.clientWidth - t.clientWidth) / 2;
          this.thumbs.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
        }
      });
    },
  };

  /* =======================================================
   * 9. PRODUCT RENDER + VARIANTS + QUANTITY
   * ===================================================== */
  function selectProduct(productId, { variantId, scroll = false } = {}) {
    const p = PRODUCTS[productId];
    if (!p) return;
    state.productId = productId;
    state.variantId = variantId && p.variants.some((v) => v.id === variantId) ? variantId : p.variants[0].id;

    $('#productName').textContent = p.name;
    $('#productBadges').innerHTML = p.badges.map((b) => `<span class="badge badge--${b.type}"><i data-lucide="${b.icon}"></i>${escapeHTML(b.text)}</span>`).join('');
    $('#backToMain').hidden = productId === MAIN_PRODUCT_ID;

    renderVariants();
    const v = getVariant();
    Gallery.set(p.images, p.name, v && v.imageIndex ? v.imageIndex : 0);
    updatePrice();
    clearError('variant');
    refreshIcons();
    if (scroll) scrollToEl('#san-pham');
  }

  function renderVariants() {
    const p = getProduct();
    $('#variantList').innerHTML = p.variants.map((v) => {
      const selected = v.id === state.variantId;
      const img = p.images[v.imageIndex || 0] || p.images[0];
      return `
        <label class="variant${selected ? ' is-selected' : ''}">
          <input type="radio" name="variant" value="${escapeHTML(v.id)}" ${selected ? 'checked' : ''} />
          <span class="variant__img" data-zoom-index="${v.imageIndex || 0}" title="Bấm để xem ảnh lớn"><img src="${escapeHTML(img)}" alt="" loading="lazy" /><i data-lucide="zoom-in"></i></span>
          <span class="variant__body">
            <span class="variant__name">${escapeHTML(v.name)}</span>
            ${v.note ? `<span class="variant__note">${escapeHTML(v.note)}</span>` : ''}
          </span>
          <span class="variant__price">${formatVND(v.price)}${v.compareAt ? `<del>${formatVND(v.compareAt)}</del>` : ''}</span>
          <span class="variant__check" aria-hidden="true"><i data-lucide="check"></i></span>
        </label>`;
    }).join('');
  }

  function onVariantChange(e) {
    if (e.target.name !== 'variant') return;
    state.variantId = e.target.value;
    $$('.variant', $('#variantList')).forEach((el) => el.classList.toggle('is-selected', el.querySelector('input').checked));
    const v = getVariant();
    if (v && typeof v.imageIndex === 'number') Gallery.go(v.imageIndex);
    clearError('variant');
    updatePrice();
  }

  function setQty(n) {
    let q = parseInt(n, 10);
    if (!Number.isFinite(q) || q < 1) q = 1;
    if (q > CONFIG.MAX_QUANTITY) {
      q = CONFIG.MAX_QUANTITY;
      Toast.show(`Số lượng tối đa mỗi đơn là ${CONFIG.MAX_QUANTITY}. Mua sỉ vui lòng liên hệ hotline.`, 'info');
    }
    state.qty = q;
    $('#qty').value = q;
    clearError('quantity');
    updatePrice();
  }

  function updatePrice() {
    const v = getVariant();
    if (!v) return;
    const total = v.price * state.qty;
    $('#salePrice').textContent = formatVND(v.price);
    const orig = $('#originalPrice');
    const badge = $('#discountBadge');
    if (v.compareAt && v.compareAt > v.price) {
      orig.textContent = formatVND(v.compareAt);
      orig.hidden = false;
      badge.textContent = `-${Math.round((1 - v.price / v.compareAt) * 100)}%`;
      badge.hidden = false;
    } else {
      orig.hidden = true;
      badge.hidden = true;
    }
    $('#subtotal').textContent = `${formatVND(v.price)} × ${state.qty}`;
    $('#totalAmount').textContent = formatVND(total);
    $('#stickyPrice').textContent = formatVND(total);
  }

  function renderOtherProducts() {
    const grid = $('#otherGrid');
    grid.innerHTML = Object.values(PRODUCTS).filter((p) => p.id !== MAIN_PRODUCT_ID).map((p) => {
      const v = p.variants[0];
      const discount = v.compareAt && v.compareAt > v.price ? Math.round((1 - v.price / v.compareAt) * 100) : 0;
      return `
        <article class="p-card reveal">
          <div class="p-card__media">
            <img src="${escapeHTML(p.images[0])}" alt="${escapeHTML(p.name)}" loading="lazy" decoding="async" width="400" height="400" />
            ${discount ? `<span class="p-card__discount">-${discount}%</span>` : ''}
          </div>
          <div class="p-card__body">
            <h3 class="p-card__name">${escapeHTML(p.name)}</h3>
            <div class="p-card__price"><strong>${formatVND(v.price)}</strong>${discount ? `<del>${formatVND(v.compareAt)}</del>` : ''}</div>
            <button type="button" class="btn btn--primary" data-buy-product="${escapeHTML(p.id)}"><i data-lucide="shopping-cart"></i> Mua Ngay</button>
          </div>
        </article>`;
    }).join('');
  }

  /* =======================================================
   * 10. ĐỊA CHỈ VIỆT NAM (API + fallback)
   * ===================================================== */
  // Danh sách 34 tỉnh/thành sau sắp xếp 01/07/2025 – dùng khi API lỗi hoàn toàn
  const FALLBACK_PROVINCES = [
    'Thành phố Hà Nội', 'Thành phố Huế', 'Tỉnh Lai Châu', 'Tỉnh Điện Biên', 'Tỉnh Sơn La', 'Tỉnh Lạng Sơn', 'Tỉnh Quảng Ninh',
    'Tỉnh Thanh Hóa', 'Tỉnh Nghệ An', 'Tỉnh Hà Tĩnh', 'Tỉnh Cao Bằng', 'Tỉnh Tuyên Quang', 'Tỉnh Lào Cai', 'Tỉnh Thái Nguyên',
    'Tỉnh Phú Thọ', 'Tỉnh Bắc Ninh', 'Tỉnh Hưng Yên', 'Thành phố Hải Phòng', 'Tỉnh Ninh Bình', 'Tỉnh Quảng Trị', 'Thành phố Đà Nẵng',
    'Tỉnh Quảng Ngãi', 'Tỉnh Gia Lai', 'Tỉnh Khánh Hòa', 'Tỉnh Lâm Đồng', 'Tỉnh Đắk Lắk', 'Thành phố Hồ Chí Minh', 'Tỉnh Đồng Nai',
    'Tỉnh Tây Ninh', 'Thành phố Cần Thơ', 'Tỉnh Vĩnh Long', 'Tỉnh Đồng Tháp', 'Tỉnh Cà Mau', 'Tỉnh An Giang',
  ].map((name, i) => ({ code: `fb-${i + 1}`, name }));

  const AddressAPI = {
    mode: null,          // 'v2' | 'v1' | 'fallback'
    detailCache: new Map(),

    async getJSON(url) {
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, CONFIG.ADDRESS.TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    normalizeList(data) {
      const list = Array.isArray(data) ? data : (data && (data.results || data.data || data.provinces)) || [];
      return list.filter((x) => x && x.name != null && x.code != null).map((x) => ({ code: String(x.code), name: String(x.name) }));
    },

    async loadProvinces() {
      const order = CONFIG.ADDRESS.MODE === 'v1' ? ['v1', 'v2'] : ['v2', 'v1'];
      for (const mode of order) {
        try {
          const base = mode === 'v2' ? CONFIG.ADDRESS.BASE_V2 : CONFIG.ADDRESS.BASE_V1;
          const list = this.normalizeList(await this.getJSON(`${base}/p/`));
          if (list.length) { this.mode = mode; return list; }
        } catch (err) {
          console.warn(`[Address] Không tải được danh sách tỉnh (${mode}):`, err.message);
        }
      }
      this.mode = 'fallback';
      return FALLBACK_PROVINCES.slice();
    },

    /** Trả về { districts: [{code,name,wards:[]}], wards: [{code,name}] } */
    async loadProvinceDetail(code) {
      if (this.mode === 'fallback' || String(code).startsWith('fb-')) return { districts: [], wards: [] };
      const key = `${this.mode}:${code}`;
      if (this.detailCache.has(key)) return this.detailCache.get(key);
      const url = this.mode === 'v2'
        ? `${CONFIG.ADDRESS.BASE_V2}/p/${encodeURIComponent(code)}?depth=2`
        : `${CONFIG.ADDRESS.BASE_V1}/p/${encodeURIComponent(code)}?depth=3`;
      const data = await this.getJSON(url);
      const districts = (data.districts || []).map((d) => ({ code: String(d.code), name: String(d.name), wards: this.normalizeList(d.wards || []) }));
      const wards = this.normalizeList(data.wards || []);
      const detail = { districts, wards };
      this.detailCache.set(key, detail);
      return detail;
    },
  };

  const AddressUI = {
    detail: null, reqId: 0, wardAvailable: false, retryFn: null,
    init() {
      this.p = $('#province');
      this.d = $('#district');
      this.w = $('#ward');
      this.dField = $('#districtField');
      this.status = $('#addressStatus');
      this.statusText = $('#addressStatusText');
      this.p.addEventListener('change', () => { clearError('province'); this.onProvinceChange(); });
      this.d.addEventListener('change', () => { clearError('district'); this.onDistrictChange(); });
      this.w.addEventListener('change', () => clearError('ward'));
      $('#addressRetry').addEventListener('click', () => { if (this.retryFn) this.retryFn(); });
      this.loadProvinces();
    },
    setOptions(select, items, placeholder) {
      const sorted = items.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` +
        sorted.map((i) => `<option value="${escapeHTML(i.code)}">${escapeHTML(i.name)}</option>`).join('');
      select.disabled = false;
    },
    setPlaceholder(select, text, disabled = true) {
      select.innerHTML = `<option value="">${escapeHTML(text)}</option>`;
      select.disabled = disabled;
    },
    setLoading(select, on) {
      select.closest('.field').classList.toggle('is-loading', on);
    },
    showStatus(msg, retryFn) {
      this.statusText.textContent = msg;
      this.retryFn = retryFn || null;
      $('#addressRetry').hidden = !retryFn;
      this.status.hidden = false;
      refreshIcons();
    },
    hideStatus() { this.status.hidden = true; this.retryFn = null; },

    async loadProvinces() {
      this.hideStatus();
      this.setPlaceholder(this.p, 'Đang tải tỉnh/thành...');
      this.setLoading(this.p, true);
      const list = await AddressAPI.loadProvinces();
      this.setLoading(this.p, false);
      this.setOptions(this.p, list, 'Chọn Tỉnh / Thành phố');
      this.resetBelowProvince();
      if (AddressAPI.mode === 'fallback') {
        this.showStatus('Không tải được dữ liệu phường/xã. Bạn vẫn chọn được Tỉnh/Thành – vui lòng ghi rõ phường/xã trong ô Địa chỉ chi tiết.', () => this.loadProvinces());
      }
    },
    resetBelowProvince() {
      this.detail = null;
      this.wardAvailable = false;
      this.dField.hidden = true;
      this.setPlaceholder(this.d, 'Chọn Quận / Huyện');
      this.setPlaceholder(this.w, 'Chọn Tỉnh / Thành phố trước');
      clearError('district');
      clearError('ward');
    },
    async onProvinceChange() {
      const code = this.p.value;
      const req = ++this.reqId;
      this.resetBelowProvince();
      if (AddressAPI.mode !== 'fallback') this.hideStatus();
      if (!code) return;
      if (AddressAPI.mode === 'fallback') {
        this.setPlaceholder(this.w, 'Không có dữ liệu – ghi trong địa chỉ chi tiết');
        return;
      }
      this.setPlaceholder(this.w, 'Đang tải phường/xã...');
      this.setLoading(this.w, true);
      try {
        const detail = await AddressAPI.loadProvinceDetail(code);
        if (req !== this.reqId) return; // người dùng đã đổi tỉnh khác
        this.detail = detail;
        if (detail.districts.length) {
          this.dField.hidden = false;
          this.setOptions(this.d, detail.districts, 'Chọn Quận / Huyện');
          this.setPlaceholder(this.w, 'Chọn Quận / Huyện trước');
        } else if (detail.wards.length) {
          this.setOptions(this.w, detail.wards, 'Chọn Phường / Xã');
          this.wardAvailable = true;
        } else {
          this.setPlaceholder(this.w, 'Không có dữ liệu phường/xã');
        }
      } catch (err) {
        if (req !== this.reqId) return;
        console.warn('[Address] Lỗi tải phường/xã:', err.message);
        this.setPlaceholder(this.w, 'Lỗi tải dữ liệu phường/xã');
        this.showStatus('Không tải được danh sách phường/xã. Kiểm tra mạng rồi bấm "Thử lại", hoặc ghi rõ phường/xã trong Địa chỉ chi tiết.', () => this.onProvinceChange());
      } finally {
        if (req === this.reqId) this.setLoading(this.w, false);
      }
    },
    onDistrictChange() {
      this.wardAvailable = false;
      clearError('ward');
      const dist = this.detail && this.detail.districts.find((x) => x.code === this.d.value);
      if (!dist) { this.setPlaceholder(this.w, 'Chọn Quận / Huyện trước'); return; }
      if (dist.wards.length) {
        this.setOptions(this.w, dist.wards, 'Chọn Phường / Xã');
        this.wardAvailable = true;
      } else {
        this.setPlaceholder(this.w, 'Không có dữ liệu phường/xã');
      }
    },
    selectedName(select) {
      const opt = select.options[select.selectedIndex];
      return opt && opt.value ? opt.textContent.trim() : '';
    },
    getValue() {
      return {
        province: this.selectedName(this.p),
        district: this.dField.hidden ? '' : this.selectedName(this.d),
        ward: this.selectedName(this.w),
        needsDistrict: !this.dField.hidden,
        needsWard: this.wardAvailable,
      };
    },
    reset() {
      this.p.value = '';
      this.reqId++;
      this.resetBelowProvince();
      this.setLoading(this.w, false);
    },
  };

  /* =======================================================
   * 11. VALIDATION
   * ===================================================== */
  function normalizePhone(raw) {
    let p = String(raw || '').replace(/[\s.\-()]/g, '');
    if (p.startsWith('+84')) p = '0' + p.slice(3);
    else if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
    return p;
  }
  // Di động Việt Nam: 10 số, đầu 03/05/07/08/09
  const PHONE_RE = /^0(3|5|7|8|9)\d{8}$/;

  function collectForm() {
    const addr = AddressUI.getValue();
    const v = getVariant();
    return {
      customerName: $('#fullName').value.trim().replace(/\s+/g, ' '),
      phone: normalizePhone($('#phone').value),
      province: addr.province,
      district: addr.district,
      ward: addr.ward,
      needsDistrict: addr.needsDistrict,
      needsWard: addr.needsWard,
      detailedAddress: $('#address').value.trim().replace(/\s+/g, ' '),
      productId: state.productId,
      productName: getProduct().name,
      variantId: v ? v.id : '',
      variantName: v ? v.name : '',
      unitPrice: v ? v.price : 0,
      quantity: state.qty,
      note: $('#note').value.trim(),
      website: $('#website').value, // honeypot
    };
  }

  function validateField(key, d) {
    switch (key) {
      case 'customerName':
        if (!d.customerName) return 'Vui lòng nhập họ và tên.';
        if (d.customerName.length < 2) return 'Họ tên quá ngắn.';
        return '';
      case 'phone':
        if (!d.phone) return 'Vui lòng nhập số điện thoại.';
        if (!PHONE_RE.test(d.phone)) return 'Số điện thoại không hợp lệ (10 số, ví dụ 0912345678).';
        return '';
      case 'province':
        return d.province ? '' : 'Vui lòng chọn Tỉnh / Thành phố.';
      case 'district':
        return d.needsDistrict && !d.district ? 'Vui lòng chọn Quận / Huyện.' : '';
      case 'ward':
        return d.needsWard && !d.ward ? 'Vui lòng chọn Phường / Xã.' : '';
      case 'detailedAddress':
        if (!d.detailedAddress) return 'Vui lòng nhập địa chỉ chi tiết.';
        if (d.detailedAddress.length < 3) return 'Địa chỉ quá ngắn, vui lòng ghi rõ hơn.';
        return '';
      case 'variant':
        return d.variantId ? '' : 'Vui lòng chọn phân loại sản phẩm.';
      case 'quantity':
        return Number.isInteger(d.quantity) && d.quantity >= 1 && d.quantity <= CONFIG.MAX_QUANTITY ? '' : 'Số lượng phải từ 1 trở lên.';
      default:
        return '';
    }
  }

  const FIELD_KEYS = ['variant', 'quantity', 'customerName', 'phone', 'province', 'district', 'ward', 'detailedAddress'];

  function validateAll(d) {
    const errors = {};
    FIELD_KEYS.forEach((k) => {
      const msg = validateField(k, d);
      if (msg) errors[k] = msg;
    });
    return errors;
  }

  function setError(key, msg) {
    const el = $(`[data-error-for="${key}"]`);
    if (!el) return;
    el.textContent = msg || '';
    const field = el.closest('.field');
    if (field) {
      field.classList.toggle('has-error', !!msg);
      $$('input, select, textarea', field).forEach((inp) => {
        if (msg) inp.setAttribute('aria-invalid', 'true');
        else inp.removeAttribute('aria-invalid');
      });
    }
  }
  const clearError = (key) => setError(key, '');

  function showErrors(errors) {
    FIELD_KEYS.forEach((k) => setError(k, errors[k] || ''));
  }

  function focusFirstError(errors) {
    const first = FIELD_KEYS.find((k) => errors[k]);
    if (!first) return;
    const el = $(`[data-error-for="${first}"]`);
    const field = el && el.closest('.field');
    const input = field && $('input:not([type=radio]), select, textarea', field);
    if (field) field.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    if (input) setTimeout(() => input.focus({ preventScroll: true }), 350);
  }

  /* =======================================================
   * 12. GỬI ĐƠN HÀNG → GOOGLE APPS SCRIPT
   * CORS: gửi Content-Type text/plain để tránh preflight (Apps Script không hỗ trợ OPTIONS).
   * Apps Script trả JSON qua redirect googleusercontent.com, fetch tự follow.
   * ===================================================== */
  async function sendOrder(payload) {
    if (!isApiConfigured()) {
      if (CONFIG.DEMO_MODE_WHEN_NO_API) {
        console.warn('[Order] DEMO MODE – chưa cấu hình CONFIG.API_URL, đơn KHÔNG được lưu.', payload);
        await new Promise((r) => setTimeout(r, 900));
        return { success: true, orderId: 'DEMO' + randomHex(3).toUpperCase(), message: 'Đặt hàng thành công (demo)', demo: true };
      }
      throw new Error('Hệ thống đặt hàng chưa được cấu hình. Vui lòng gọi hotline để đặt hàng.');
    }

    let res;
    try {
      res = await fetchWithTimeout(CONFIG.API_URL.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      }, CONFIG.REQUEST_TIMEOUT_MS);
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Máy chủ phản hồi chậm. Vui lòng thử lại – đơn sẽ không bị tạo trùng.');
      throw new Error('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
    }
    if (!res.ok) throw new Error(`Máy chủ lỗi (HTTP ${res.status}). Vui lòng thử lại.`);
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Phản hồi không hợp lệ từ máy chủ.'); }
    return data;
  }

  function setSubmitting(on) {
    state.submitting = on;
    const btn = $('#submitBtn');
    btn.disabled = on;
    btn.classList.toggle('is-loading', on);
    btn.setAttribute('aria-busy', String(on));
    $('.btn--order__label', btn).textContent = on ? 'ĐANG GỬI ĐƠN...' : 'ĐẶT MUA NGAY';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (state.submitting) return; // chống double submit

    const data = collectForm();
    const errors = validateAll(data);
    showErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstError(errors);
      Toast.show('Vui lòng kiểm tra lại các thông tin còn thiếu.', 'error');
      return;
    }
    if (data.website) return; // bot điền honeypot → bỏ qua im lặng

    if (!state.idempotencyKey) state.idempotencyKey = generateClientOrderRef();

    const payload = {
      idempotencyKey: state.idempotencyKey,
      customerName: data.customerName,
      phone: data.phone,
      province: data.province,
      district: data.district,
      ward: data.ward,
      detailedAddress: data.detailedAddress,
      productId: data.productId,
      variantId: data.variantId,
      quantity: data.quantity,
      note: data.note,
      // Thông tin tham khảo – backend KHÔNG dùng để tính tiền
      productName: data.productName,
      variantName: data.variantName,
      clientUnitPrice: data.unitPrice,
      campaign: AdTracking.campaign,
      adset: AdTracking.adset,
      source: CONFIG.SOURCE,
      userAgent: navigator.userAgent,
      pageUrl: location.href.split('#')[0],
      website: data.website,
    };

    setSubmitting(true);
    try {
      const res = await sendOrder(payload);
      if (!res || res.success !== true) throw new Error((res && res.message) || 'Không thể tạo đơn hàng.');
      showSuccess(res.orderId, data);
      resetForm();
      state.idempotencyKey = null;
      if (res.demo) Toast.show('Chế độ DEMO: đơn chưa được lưu vào Google Sheets.', 'info', 5000);
    } catch (err) {
      console.error('[Order] Lỗi:', err);
      Toast.show(err.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.', 'error', 5500);
      // Không reset form; giữ idempotencyKey để gửi lại không tạo đơn trùng
    } finally {
      setSubmitting(false);
    }
  }

  function showSuccess(orderId, data) {
    const modal = $('#successModal');
    $('#modalOrderId').textContent = orderId || '—';
    const fullAddress = [data.detailedAddress, data.ward, data.district, data.province].filter(Boolean).join(', ');
    const rows = [
      ['Sản phẩm', data.productName],
      ['Phân loại', data.variantName],
      ['Số lượng', String(data.quantity)],
      ['Tổng tiền', formatVND(data.unitPrice * data.quantity) + ' (COD)'],
      ['Người nhận', data.customerName],
      ['Điện thoại', data.phone],
      ['Địa chỉ', fullAddress],
    ];
    $('#modalSummary').innerHTML = rows.map(([k, v]) => `<dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd>`).join('');
    refreshIcons();
    if (typeof modal.showModal === 'function') {
      modal.showModal();
      document.body.classList.add('modal-open');
    } else {
      Toast.show(`Đặt hàng thành công! Mã đơn: ${orderId}`, 'success', 8000);
    }
  }

  function resetForm() {
    const form = $('#orderForm');
    form.reset();
    AddressUI.reset();
    showErrors({});
    selectProduct(state.productId); // về phân loại mặc định
    setQty(1);
  }

  /* =======================================================
   * 13. UI: header, menu, FAQ, countdown, sticky CTA, reveal...
   * ===================================================== */
  function initHeaderAndNav() {
    const header = $('#header');
    const nav = $('#mainNav');
    const burger = $('#hamburger');
    const overlay = $('#navOverlay');
    const backTop = $('#backToTop');

    const setMenu = (open) => {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
      overlay.hidden = !open;
      document.body.classList.toggle('menu-open', open);
    };
    burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
    overlay.addEventListener('click', () => setMenu(false));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) setMenu(false); });
    window.matchMedia('(min-width: 900px)').addEventListener('change', (mq) => { if (mq.matches) setMenu(false); });

    let ticking = false;
    const onScroll = () => {
      const y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 10);
      backTop.classList.toggle('is-visible', y > 700);
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
    onScroll();
    backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));

    // Active nav link theo section đang xem
    if ('IntersectionObserver' in window) {
      const links = $$('.nav__link');
      const map = new Map(links.map((l) => [l.getAttribute('href').slice(1), l]));
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting && map.has(en.target.id)) {
            links.forEach((l) => l.classList.remove('is-active'));
            map.get(en.target.id).classList.add('is-active');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
    }
  }

  function initStickyCta() {
    const bar = $('#stickyCta');
    const form = $('#orderForm');
    const hero = $('#trang-chu');
    if (!('IntersectionObserver' in window)) return;
    let formVisible = false, heroVisible = true;
    const update = () => {
      const show = !formVisible && !heroVisible;
      bar.classList.toggle('is-visible', show);
      bar.setAttribute('aria-hidden', String(!show));
      $('a', bar).tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver(([en]) => { formVisible = en.isIntersecting; update(); }, { threshold: 0.05 }).observe(form);
    new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; update(); }, { threshold: 0 }).observe(hero);
  }

  function initFAQ() {
    $$('.faq__q').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq__item');
        const open = !item.classList.contains('is-open');
        item.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    });
  }

  function initCountdown() {
    const wraps = $$('[data-countdown-wrap]');
    const cfg = CONFIG.COUNTDOWN;
    const duration = cfg.durationMinutes * 60000;
    if (!cfg.enabled || !(duration > 0)) { wraps.forEach((w) => { w.hidden = true; }); return; }
    const end = Date.now() + duration;
    $$('[data-countdown-label]').forEach((el) => { el.textContent = cfg.label; });
    let timer = null;
    const tick = () => {
      const diff = Math.max(0, end - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const cs = Math.floor((diff % 1000) / 10);
      $$('[data-countdown]').forEach((box) => {
        box.querySelector('[data-unit="m"]').textContent = pad2(m);
        box.querySelector('[data-unit="s"]').textContent = pad2(s);
        box.querySelector('[data-unit="cs"]').textContent = pad2(cs);
      });
      $$('[data-countdown-bar]').forEach((bar) => { bar.style.width = `${(diff / duration) * 100}%`; });
      wraps.forEach((w) => w.classList.toggle('is-urgent', diff > 0 && diff < cfg.urgentMinutes * 60000));
      if (diff <= 0) {
        clearInterval(timer);
        wraps.forEach((w) => {
          if (cfg.hideWhenEnded) w.hidden = true;
          else { w.classList.add('is-ended'); const l = $('[data-countdown-label]', w); if (l) l.textContent = cfg.endedLabel; }
        });
      }
    };
    tick();
    timer = setInterval(tick, 50);
  }

  function initReveal() {
    const els = $$('.reveal');
    if (reducedMotion || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));
  }

  function initPetals() {
    const box = $('#heroPetals');
    if (!box || reducedMotion) return;
    const count = window.innerWidth < 640 ? 8 : 14;
    let html = '';
    for (let i = 0; i < count; i++) {
      const size = 8 + Math.random() * 8;
      html += `<span class="petal${i % 3 === 0 ? ' petal--pink' : ''}" style="left:${(Math.random() * 100).toFixed(1)}%;width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;animation-duration:${(8 + Math.random() * 8).toFixed(1)}s;animation-delay:-${(Math.random() * 12).toFixed(1)}s"></span>`;
    }
    box.innerHTML = html;
  }

  function initContactLinks() {
    const { hotline, zalo, email, name, address } = CONFIG.SHOP;
    const prettyPhone = (p) => p.replace(/(\d{4})(\d{3})(\d+)/, '$1 $2 $3');
    $$('[data-hotline]').forEach((a) => { a.href = `tel:${hotline}`; });
    $$('[data-zalo]').forEach((a) => { a.href = `https://zalo.me/${zalo}`; });
    $$('[data-email]').forEach((a) => { a.href = `mailto:${email}`; });
    $$('[data-hotline-text]').forEach((el) => { el.textContent = prettyPhone(hotline); });
    $$('[data-zalo-text]').forEach((el) => { el.textContent = prettyPhone(zalo); });
    $$('[data-email-text]').forEach((el) => { el.textContent = email; });
    $$('[data-shop-name]').forEach((el) => { el.textContent = name; });
    $$('[data-shop-address]').forEach((el) => { el.textContent = address; });
    $('#year').textContent = new Date().getFullYear();
  }

  function initStats() {
    const { rating, reviews, sold } = CONFIG.STATS;
    const nf = new Intl.NumberFormat('vi-VN');
    $('#ratingValue').textContent = Number(rating).toFixed(1);
    $('#reviewCount').textContent = nf.format(reviews);
    $('#soldCount').textContent = nf.format(sold);
  }

  function initModals() {
    const modal = $('#successModal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close-modal]')) modal.close();
    });
    modal.addEventListener('close', () => document.body.classList.remove('modal-open'));
    $('#copyOrderId').addEventListener('click', async () => {
      const id = $('#modalOrderId').textContent;
      try {
        await navigator.clipboard.writeText(id);
        Toast.show('Đã sao chép mã đơn hàng.', 'success');
      } catch (e) {
        Toast.show(`Mã đơn của bạn: ${id}`, 'info');
      }
    });
  }

  function initBuyButtons() {
    document.addEventListener('click', (e) => {
      const main = e.target.closest('[data-buy-main]');
      if (main) {
        e.preventDefault();
        if (state.productId !== MAIN_PRODUCT_ID) selectProduct(MAIN_PRODUCT_ID);
        scrollToEl('#san-pham');
        return;
      }
      const variantBtn = e.target.closest('[data-select-variant]');
      if (variantBtn) {
        selectProduct(MAIN_PRODUCT_ID, { variantId: variantBtn.dataset.selectVariant, scroll: true });
        Toast.show(`Đã chọn: ${getVariant().name}`, 'success', 2500);
        return;
      }
      const other = e.target.closest('[data-buy-product]');
      if (other) {
        selectProduct(other.dataset.buyProduct, { scroll: true });
        Toast.show(`Đã chọn ${getProduct().name} – điền thông tin nhận hàng để đặt mua.`, 'success', 3200);
      }
    });
    $('#backToMain').addEventListener('click', () => selectProduct(MAIN_PRODUCT_ID));
  }

  function initForm() {
    const form = $('#orderForm');
    form.addEventListener('submit', handleSubmit);
    $('#variantList').addEventListener('change', onVariantChange);
    $('#variantList').addEventListener('click', (e) => {
      const thumb = e.target.closest('[data-zoom-index]');
      if (thumb) Lightbox.open(getProduct().images, Number(thumb.dataset.zoomIndex));
    });
    $('#qtyMinus').addEventListener('click', () => setQty(state.qty - 1));
    $('#qtyPlus').addEventListener('click', () => setQty(state.qty + 1));
    $('#qty').addEventListener('change', (e) => setQty(e.target.value));

    // Validate từng field khi rời ô; xoá lỗi khi người dùng gõ lại
    const map = { fullName: 'customerName', phone: 'phone', address: 'detailedAddress' };
    Object.entries(map).forEach(([id, key]) => {
      const input = document.getElementById(id);
      input.addEventListener('blur', () => { if (input.value.trim()) setError(key, validateField(key, collectForm())); });
      input.addEventListener('input', () => clearError(key));
    });
  }

  /* =======================================================
   * 14. INIT
   * ===================================================== */
  function init() {
    document.documentElement.classList.remove('no-js');
    $('#descArt').src = PRODUCTS[MAIN_PRODUCT_ID].images[2];

    initContactLinks();
    initStats();
    Lightbox.init();
    Gallery.init();
    renderOtherProducts();
    selectProduct(MAIN_PRODUCT_ID);
    AddressUI.init();
    initForm();
    initBuyButtons();
    initHeaderAndNav();
    initStickyCta();
    initFAQ();
    initCountdown();
    initModals();
    initPetals();
    initReveal();
    refreshIcons();

    if (!isApiConfigured()) {
      console.info('%c[Tết 2027] Chưa cấu hình CONFIG.API_URL – form đang chạy ' + (CONFIG.DEMO_MODE_WHEN_NO_API ? 'chế độ DEMO.' : 'và sẽ báo lỗi khi gửi.'), 'color:#D90000;font-weight:bold');
    }
  }

  // Lucide tải defer trước script.js nên thường đã sẵn sàng; gọi lại khi window load cho chắc.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', refreshIcons);
})();
