/**
 * =========================================================
 *  TẾT 2027 – GOOGLE APPS SCRIPT ORDER API (Google Sheets CRM)
 * =========================================================
 *  Cách dùng nhanh:
 *   1. Mở Google Sheets → Extensions → Apps Script → dán toàn bộ file này.
 *   2. (Tuỳ chọn) Chạy hàm setupSheets() một lần để tạo sheet DON_HANG + DASHBOARD.
 *   3. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
 *   4. Copy Web App URL (…/exec) dán vào CONFIG.API_URL trong script.js.
 *
 *  Lưu ý: mỗi lần sửa code phải Deploy → Manage deployments → Edit → Version: New version
 *  thì thay đổi mới có hiệu lực (URL giữ nguyên).
 * =========================================================
 */

/* ---------------- CONFIG ---------------- */
const CONFIG = {
  SHEET_NAME: 'DON_HANG',
  DASHBOARD_SHEET_NAME: 'DASHBOARD',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  ORDER_PREFIX: 'TET2027',
  DEFAULT_STATUS: 'NEW',
  DEFAULT_SOURCE: 'TetLandingPage2027',
  MAX_QUANTITY: 99,
  LOCK_TIMEOUT_MS: 20000,
  IDEMPOTENCY_TTL_SECONDS: 21600,             // 6 giờ (tối đa của CacheService)
  RATE_LIMIT: { MAX_ORDERS: 5, WINDOW_SECONDS: 600 }, // tối đa 5 đơn / 10 phút / 1 số điện thoại
  NOTIFY_EMAIL: '',                            // điền email để nhận thông báo đơn mới (để trống = tắt)
};

const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED'];

const HEADERS = [
  'Mã đơn', 'Thời gian', 'SĐT', 'Tên', 'Địa chỉ đầy đủ', 'SKU', 'Giá bán', 'Số lượng',
  'Ghi chú', 'Tên chiến dịch', 'Nhóm quảng cáo', 'Trạng thái',
  'Idempotency Key', // cột kỹ thuật để chống tạo đơn trùng – không cần sửa
];

// Vị trí cột (1-based) – tự tính từ HEADERS
const COL = HEADERS.reduce(function (acc, h, i) { acc[h] = i + 1; return acc; }, {});

/**
 * BẢNG GIÁ CHUẨN – backend tính tiền theo bảng này, KHÔNG tin giá từ frontend.
 * id sản phẩm / phân loại phải khớp với PRODUCTS trong script.js.
 */
const CATALOG = {
  'set-de-do-2027': {
    name: 'Set Decor Tết Cặp Dê Đỏ New 2027',
    variants: {
      'cap-lien-de':        { sku: 'TET27-LD',       name: '1 Cặp Liễn Dê',                        price: 169000 },
      'combo-de-quat':      { sku: 'TET27-LD-KQ',    name: 'Combo Liễn Dê + Khánh Quạt',           price: 199000 },
      'combo-de-quat-2027': { sku: 'TET27-LD-KQ-SO', name: 'Combo Liễn Dê + Khánh Quạt + Số 2027', price: 249000 },
      'combo-de-treo-2027': { sku: 'TET27-LD-DT-SO', name: 'Combo Liễn Dê + Dải Treo + Số 2027',   price: 269000 },
    },
  },
  'den-long-tet':     { name: 'Đèn Lồng Trang Trí Tết',  variants: { 'default': { name: 'Đèn Lồng Trang Trí Tết',  price: 49000 } } },
  'quat-giay-tet':    { name: 'Quạt Giấy Trang Trí Tết', variants: { 'default': { name: 'Quạt Giấy Trang Trí Tết', price: 29000 } } },
  'day-treo-tet':     { name: 'Dây Treo Tết',            variants: { 'default': { name: 'Dây Treo Tết',            price: 19000 } } },
  'canh-hoa-dao-tet': { name: 'Cành Hoa Đào Tết',        variants: { 'default': { name: 'Cành Hoa Đào Tết',        price: 39000 } } },
  'cau-doi-tet':      { name: 'Câu Đối Tết',             variants: { 'default': { name: 'Câu Đối Tết',             price: 25000 } } },
};

/* ---------------- HTTP HANDLERS ---------------- */

/** GET: kiểm tra API còn sống. Mở URL /exec trên trình duyệt để test. */
function doGet(e) {
  return jsonResponse({
    success: true,
    message: 'Tết 2027 Order API đang hoạt động',
    service: CONFIG.DEFAULT_SOURCE,
    time: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
  });
}

/** POST: nhận đơn hàng từ landing page. */
function doPost(e) {
  let lock = null;
  try {
    const body = parseBody_(e);

    // Honeypot: bot điền field ẩn "website"
    if (body.website) throw userError_('Không thể tạo đơn hàng');

    const order = validateOrder_(body);

    // Idempotency: kiểm tra nhanh trong cache trước khi khoá
    const cache = CacheService.getScriptCache();
    if (order.idempotencyKey) {
      const cachedId = cache.get('idem_' + order.idempotencyKey);
      if (cachedId) return successResponse_(cachedId, true);
    }

    lock = LockService.getScriptLock();
    if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
      throw userError_('Hệ thống đang bận, vui lòng thử lại sau ít giây.');
    }

    const sheet = getOrCreateOrderSheet_();

    // Idempotency: kiểm tra lại trong sheet (sau khi đã khoá) – phòng cache hết hạn
    if (order.idempotencyKey) {
      const existingId = findOrderIdByIdempotencyKey_(sheet, order.idempotencyKey);
      if (existingId) {
        cache.put('idem_' + order.idempotencyKey, existingId, CONFIG.IDEMPOTENCY_TTL_SECONDS);
        return successResponse_(existingId, true);
      }
    }

    checkRateLimit_(cache, order.phone);

    const orderId = generateOrderId_(sheet);
    const now = new Date();
    const fullAddress = [order.detailedAddress, order.ward, order.district, order.province].filter(String).join(', ');

    const row = new Array(HEADERS.length).fill('');
    row[COL['Mã đơn'] - 1] = orderId;
    row[COL['Thời gian'] - 1] = now;
    row[COL['SĐT'] - 1] = "'" + order.phone; // giữ số 0 đầu
    row[COL['Tên'] - 1] = safeCell_(order.customerName);
    row[COL['Địa chỉ đầy đủ'] - 1] = safeCell_(fullAddress);
    row[COL['SKU'] - 1] = order.sku;
    row[COL['Số lượng'] - 1] = order.quantity;
    row[COL['Giá bán'] - 1] = order.totalAmount; // tổng tiền thu COD = giá × số lượng
    row[COL['Ghi chú'] - 1] = safeCell_(order.note);
    row[COL['Tên chiến dịch'] - 1] = safeCell_(order.campaign);
    row[COL['Nhóm quảng cáo'] - 1] = safeCell_(order.adset);
    row[COL['Trạng thái'] - 1] = CONFIG.DEFAULT_STATUS;
    row[COL['Idempotency Key'] - 1] = order.idempotencyKey;

    sheet.appendRow(row);
    SpreadsheetApp.flush();

    if (order.idempotencyKey) cache.put('idem_' + order.idempotencyKey, orderId, CONFIG.IDEMPOTENCY_TTL_SECONDS);

    lock.releaseLock();
    lock = null;

    notifyNewOrder_(orderId, order, fullAddress);
    return successResponse_(orderId, false);
  } catch (err) {
    console.error('doPost error:', err && err.stack ? err.stack : err);
    return jsonResponse({
      success: false,
      message: err && err.isUserError ? err.message : 'Không thể tạo đơn hàng',
    });
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (e) { /* ignore */ }
    }
  }
}

/* ---------------- VALIDATION ---------------- */

function parseBody_(e) {
  if (!e) throw userError_('Yêu cầu không hợp lệ');
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // fallback: form-urlencoded
      if (e.parameter && Object.keys(e.parameter).length) return e.parameter;
      throw userError_('Dữ liệu gửi lên không đúng định dạng');
    }
  }
  if (e.parameter && Object.keys(e.parameter).length) return e.parameter;
  throw userError_('Không có dữ liệu đơn hàng');
}

function validateOrder_(b) {
  const customerName = clean_(b.customerName, 80).replace(/\s+/g, ' ');
  if (customerName.length < 2) throw userError_('Vui lòng nhập họ và tên hợp lệ');

  const phone = normalizePhone_(b.phone);
  if (!/^0(3|5|7|8|9)\d{8}$/.test(phone)) throw userError_('Số điện thoại không hợp lệ');

  const province = clean_(b.province, 100);
  if (!province) throw userError_('Vui lòng chọn Tỉnh / Thành phố');
  const district = clean_(b.district, 100);
  const ward = clean_(b.ward, 100);

  const detailedAddress = clean_(b.detailedAddress, 200);
  if (detailedAddress.length < 3) throw userError_('Vui lòng nhập địa chỉ chi tiết');

  const product = CATALOG[String(b.productId || '')];
  if (!product) throw userError_('Sản phẩm không tồn tại');
  const variant = product.variants[String(b.variantId || '')];
  if (!variant) throw userError_('Phân loại sản phẩm không hợp lệ');

  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > CONFIG.MAX_QUANTITY) {
    throw userError_('Số lượng phải từ 1 đến ' + CONFIG.MAX_QUANTITY);
  }

  // Tính tiền ở backend – bỏ qua mọi giá/tổng tiền do frontend gửi
  const unitPrice = variant.price;
  const totalAmount = unitPrice * quantity;

  const idempotencyKey = clean_(b.idempotencyKey, 80);
  if (idempotencyKey && !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw userError_('Mã yêu cầu không hợp lệ');

  return {
    customerName: customerName,
    phone: phone,
    province: province,
    district: district,
    ward: ward,
    detailedAddress: detailedAddress,
    productName: product.name,
    variantName: variant.name,
    sku: variant.sku || '',
    unitPrice: unitPrice,
    quantity: quantity,
    totalAmount: totalAmount,
    note: clean_(b.note, 500),
    source: clean_(b.source, 60) || CONFIG.DEFAULT_SOURCE,
    userAgent: clean_(b.userAgent, 300),
    campaign: clean_(b.campaign, 200),
    adset: clean_(b.adset, 200),
    idempotencyKey: idempotencyKey,
  };
}

function normalizePhone_(raw) {
  let p = String(raw || '').replace(/[\s.\-()]/g, '');
  if (p.indexOf('+84') === 0) p = '0' + p.slice(3);
  else if (p.indexOf('84') === 0 && p.length === 11) p = '0' + p.slice(2);
  return p;
}

/** Trim, bỏ ký tự điều khiển, giới hạn độ dài */
function clean_(v, maxLen) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen || 255);
}

/** Chống "formula injection": ô bắt đầu bằng = + - @ sẽ được ghi dạng text */
function safeCell_(v) {
  const s = String(v || '');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function checkRateLimit_(cache, phone) {
  const key = 'rl_' + phone;
  const count = Number(cache.get(key) || 0);
  if (count >= CONFIG.RATE_LIMIT.MAX_ORDERS) {
    throw userError_('Bạn đã đặt nhiều đơn trong thời gian ngắn. Vui lòng gọi hotline để được hỗ trợ.');
  }
  cache.put(key, String(count + 1), CONFIG.RATE_LIMIT.WINDOW_SECONDS);
}

/* ---------------- SHEET HELPERS ---------------- */

function getOrCreateOrderSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    formatOrderSheet_(sheet);
    return sheet;
  }
  // Có sheet nhưng thiếu header → tạo header
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeader = firstRow[0] === HEADERS[0];
  if (!hasHeader) {
    if (sheet.getLastRow() > 0) sheet.insertRowBefore(1);
    formatOrderSheet_(sheet);
  }
  return sheet;
}

function formatOrderSheet_(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold')
    .setFontColor('#FFFFFF')
    .setBackground('#D90000')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.getRange(2, COL['Thời gian'], maxRows - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange(2, COL['Giá bán'], maxRows - 1, 1).setNumberFormat('#,##0"đ"');

    // Dropdown trạng thái đơn
    const statusRange = sheet.getRange(2, COL['Trạng thái'], maxRows - 1, 1);
    statusRange.setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ORDER_STATUSES, true).setAllowInvalid(false).build()
    );

    // Tô màu theo trạng thái
    const colors = { NEW: '#FFF3B0', CONFIRMED: '#D6EAFF', SHIPPING: '#FFE0B2', COMPLETED: '#D4F5DD', CANCELLED: '#EEEEEE' };
    const rules = sheet.getConditionalFormatRules().filter(function (r) {
      return !r.getRanges().some(function (rg) { return rg.getColumn() === COL['Trạng thái']; });
    });
    Object.keys(colors).forEach(function (st) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(st).setBackground(colors[st]).setRanges([statusRange]).build());
    });
    sheet.setConditionalFormatRules(rules);
  }

  const widths = { 'Mã đơn': 150, 'Thời gian': 150, 'SĐT': 115, 'Tên': 160, 'Địa chỉ đầy đủ': 360, 'SKU': 140,
    'Số lượng': 80, 'Giá bán': 110, 'Ghi chú': 220, 'Tên chiến dịch': 200, 'Nhóm quảng cáo': 200, 'Trạng thái': 120, 'Idempotency Key': 220 };
  Object.keys(widths).forEach(function (h) { sheet.setColumnWidth(COL[h], widths[h]); });
}

function findOrderIdByIdempotencyKey_(sheet, key) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const found = sheet.getRange(2, COL['Idempotency Key'], lastRow - 1, 1)
    .createTextFinder(key).matchEntireCell(true).findNext();
  if (!found) return null;
  return String(sheet.getRange(found.getRow(), COL['Mã đơn']).getValue());
}

/** TET2027 + 6 ký tự (bỏ ký tự dễ nhầm O/0/I/1), đảm bảo không trùng trong sheet */
function generateOrderId_(sheet) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const lastRow = sheet.getLastRow();
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    const id = CONFIG.ORDER_PREFIX + suffix;
    if (lastRow < 2) return id;
    const dup = sheet.getRange(2, COL['Mã đơn'], lastRow - 1, 1)
      .createTextFinder(id).matchEntireCell(true).findNext();
    if (!dup) return id;
  }
  // gần như không xảy ra: thêm timestamp để chắc chắn duy nhất
  return CONFIG.ORDER_PREFIX + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyMMddHHmmss');
}

/* ---------------- RESPONSES ---------------- */

function successResponse_(orderId, duplicate) {
  return jsonResponse({ success: true, orderId: orderId, message: 'Đặt hàng thành công', duplicate: !!duplicate });
}

/** Apps Script Web App tự thêm header CORS cho phản hồi ContentService khi deploy "Anyone". */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function userError_(msg) {
  const err = new Error(msg);
  err.isUserError = true;
  return err;
}

/* ---------------- EMAIL NOTIFY (tuỳ chọn) ---------------- */

function notifyNewOrder_(orderId, order, fullAddress) {
  if (!CONFIG.NOTIFY_EMAIL) return;
  try {
    const fmt = function (n) { return Number(n).toLocaleString('vi-VN') + 'đ'; };
    MailApp.sendEmail({
      to: CONFIG.NOTIFY_EMAIL,
      subject: '🧧 Đơn mới ' + orderId + ' – ' + fmt(order.totalAmount),
      body: [
        'Mã đơn: ' + orderId,
        'Khách: ' + order.customerName + ' – ' + order.phone,
        'Địa chỉ: ' + fullAddress,
        'Sản phẩm: ' + order.variantName + ' (' + order.sku + ') x' + order.quantity,
        'Tổng tiền: ' + fmt(order.totalAmount) + ' (COD)',
        'Ghi chú: ' + (order.note || '—'),
        'Chiến dịch: ' + (order.campaign || '—') + ' / Nhóm QC: ' + (order.adset || '—'),
      ].join('\n'),
    });
  } catch (err) {
    console.warn('Không gửi được email thông báo:', err);
  }
}

/* ---------------- ADMIN UTILITIES ---------------- */

/** Menu tiện ích khi mở Google Sheets */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🧧 Tết CRM')
    .addItem('Khởi tạo / định dạng sheet', 'setupSheets')
    .addItem('Tạo đơn thử nghiệm', 'testCreateOrder')
    .addToUi();
}

/** Chạy 1 lần: tạo sheet DON_HANG (định dạng, dropdown trạng thái) và DASHBOARD thống kê */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  const sheet = getOrCreateOrderSheet_();
  formatOrderSheet_(sheet);
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), HEADERS.length).createFilter();
  createDashboard_(ss);
  try { SpreadsheetApp.getUi().alert('Đã khởi tạo sheet DON_HANG và DASHBOARD.'); } catch (e) { /* chạy từ editor */ }
}

function createDashboard_(ss) {
  let dash = ss.getSheetByName(CONFIG.DASHBOARD_SHEET_NAME);
  if (!dash) dash = ss.insertSheet(CONFIG.DASHBOARD_SHEET_NAME);
  dash.clear();
  const S = "'" + CONFIG.SHEET_NAME + "'!";
  const colLetter = function (h) { return columnToLetter_(COL[h]); };
  const status = S + colLetter('Trạng thái') + '2:' + colLetter('Trạng thái');
  const total = S + colLetter('Giá bán') + '2:' + colLetter('Giá bán');
  const created = S + colLetter('Thời gian') + '2:' + colLetter('Thời gian');
  const ids = S + 'A2:A';

  const rows = [
    ['📊 TỔNG QUAN ĐƠN HÀNG TẾT 2027', ''],
    ['Tổng số đơn', '=COUNTA(' + ids + ')'],
    ['Đơn hôm nay', '=COUNTIFS(' + created + ',">="&TODAY(),' + created + ',"<"&TODAY()+1)'],
    ['Doanh thu dự kiến (trừ đơn huỷ)', '=SUMIFS(' + total + ',' + status + ',"<>CANCELLED")'],
    ['Doanh thu đã hoàn thành', '=SUMIFS(' + total + ',' + status + ',"COMPLETED")'],
    ['', ''],
    ['Trạng thái', 'Số đơn'],
  ];
  ORDER_STATUSES.forEach(function (st) { rows.push([st, '=COUNTIF(' + status + ',"' + st + '")']); });

  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  dash.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor('#D90000');
  dash.getRange('A7:B7').setFontWeight('bold').setBackground('#FFD700');
  dash.getRange('B4:B5').setNumberFormat('#,##0"đ"');
  dash.setColumnWidth(1, 280);
  dash.setColumnWidth(2, 160);
}

function columnToLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Test nhanh từ editor: Run → testCreateOrder, sau đó xem sheet DON_HANG */
function testCreateOrder() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        idempotencyKey: 'TEST-' + Date.now(),
        customerName: 'Khách Test',
        phone: '0912345678',
        province: 'Thành phố Hà Nội',
        district: '',
        ward: 'Phường Hoàn Kiếm',
        detailedAddress: '1 Tràng Tiền',
        productId: 'set-de-do-2027',
        variantId: 'combo-de-quat',
        quantity: 2,
        note: 'Đơn thử nghiệm – có thể xoá',
        source: CONFIG.DEFAULT_SOURCE,
        userAgent: 'Apps Script Test',
        campaign: 'TEST - Chiến dịch Tết',
        adset: 'TEST - Nhóm QC 1',
      }),
    },
  };
  const res = doPost(fakeEvent);
  console.log(res.getContent());
}
