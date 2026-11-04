# 🧧 Landing Page Tết 2027 + Google Sheets CRM

Landing page bán **Set Decor Tết Cặp Dê Đỏ New 2027** viết bằng HTML/CSS/JavaScript thuần, có form đặt hàng COD, dropdown địa chỉ Việt Nam, chọn phân loại và lưu đơn trực tiếp vào **Google Sheets** qua **Google Apps Script**. Không cần server, không cần database.

```
├── index.html             # Cấu trúc trang (semantic HTML)
├── style.css              # Giao diện, mobile-first, CSS variables
├── script.js              # Logic: CONFIG, gallery, form, địa chỉ, gửi đơn
├── google-apps-script.gs  # API nhận đơn, ghi Google Sheets
└── README.md
```

---

## 1. Chạy thử ngay (chế độ DEMO)

Mở `index.html` bằng trình duyệt (hoặc chạy `npx serve .`). Khi chưa dán URL Apps Script, form chạy **chế độ DEMO**: vẫn hiện modal thành công nhưng **không lưu đơn**. Tắt bằng cách đặt `DEMO_MODE_WHEN_NO_API: false` hoặc dán URL thật (bước 2).

> Dropdown phường/xã cần Internet để gọi API địa chỉ. Nên chạy qua một web server (`npx serve .`, Live Server của VS Code…) thay vì mở file trực tiếp.

---

## 2. Kết nối Google Sheets (lưu đơn thật)

1. Vào [sheets.google.com](https://sheets.google.com) → tạo **bảng tính mới** (ví dụ: “Đơn hàng Tết 2027”).
2. Mở menu **Extensions (Tiện ích mở rộng) → Apps Script**.
3. Xoá code mẫu, **dán toàn bộ** nội dung `google-apps-script.gs` → bấm 💾 Save.
4. Kiểm tra `CONFIG.SHEET_NAME` (mặc định `ORDERS`). Có thể điền `NOTIFY_EMAIL` để nhận email mỗi khi có đơn mới.
5. (Khuyến nghị) Chọn hàm **`setupSheets`** trên thanh công cụ → **Run** → cấp quyền khi Google hỏi. Hàm này tạo sheet `ORDERS` (header, dropdown trạng thái, tô màu) và sheet `DASHBOARD` (thống kê). Nếu bỏ qua, sheet `ORDERS` vẫn tự tạo khi có đơn đầu tiên.
6. Bấm **Deploy → New deployment**.
7. Bấm ⚙️ cạnh “Select type” → chọn **Web app**.
8. **Execute as:** `Me` · **Who has access:** `Anyone`.
9. Bấm **Deploy** → cấp quyền → **copy Web App URL** (dạng `https://script.google.com/macros/s/.../exec`).
10. Mở `script.js`, dán URL vào **một chỗ duy nhất**:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
  ...
};
```

### Kiểm tra API
- Mở Web App URL trên trình duyệt → thấy `{"success":true,"message":"Tết 2027 Order API đang hoạt động",...}` là OK.
- Trong Apps Script, chạy hàm **`testCreateOrder`** → một đơn thử xuất hiện trong sheet `ORDERS`.
- Đặt thử 1 đơn trên landing page → mở Google Sheets, đơn mới nằm ở dòng cuối với trạng thái `NEW`.

> ⚠️ **Mỗi lần sửa code Apps Script** phải vào **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Nếu tạo “New deployment” thì URL sẽ đổi và phải dán lại vào `script.js`.

### Bảo mật
- Frontend **không** dùng API key Google Sheets và **không** chứa thông tin tài khoản Google. Web App URL chỉ là endpoint nhận đơn; nó không cho phép đọc dữ liệu trong sheet.
- Backend tự tính `Unit Price` và `Total Amount` theo bảng `CATALOG` – giá do trình duyệt gửi lên bị bỏ qua.
- Đã có: kiểm tra dữ liệu, chuẩn hoá số điện thoại, `LockService` chống ghi đồng thời, idempotency key chống tạo đơn trùng khi khách bấm nhiều lần / mạng chập chờn, giới hạn 5 đơn/10 phút/số điện thoại, honeypot chống bot, chống chèn công thức (formula injection) vào sheet.

---

## 3. Quản lý đơn hàng trong Google Sheets (CRM)

| Việc cần làm | Cách làm |
|---|---|
| Lọc đơn theo trạng thái | Data → Create a filter (hoặc chạy `setupSheets`) → lọc cột **Order Status** |
| Cập nhật trạng thái | Chọn từ dropdown: `NEW` → `CONFIRMED` → `SHIPPING` → `COMPLETED` / `CANCELLED` |
| Xem doanh thu, số đơn | Sheet **DASHBOARD**: tổng đơn, đơn hôm nay, doanh thu dự kiến (trừ đơn huỷ), doanh thu hoàn thành, số đơn theo trạng thái |
| Nhận thông báo | Điền `NOTIFY_EMAIL` trong Apps Script, deploy version mới |

Cột kỹ thuật cuối cùng **Idempotency Key** dùng để chống trùng đơn – không cần sửa, có thể ẩn cột.

---

## 4. Tuỳ chỉnh

Mọi thứ cần sửa đều ở **đầu `script.js`** (`CONFIG`, `PRODUCTS`):

- **Hotline / Zalo / email / tên shop:** `CONFIG.SHOP`
- **Số đánh giá, đã bán:** `CONFIG.STATS` (hãy dùng số liệu thật)
- **Countdown:** `CONFIG.COUNTDOWN.enabled` (bật/tắt), `durationMinutes` (số phút đếm ngược, tính từ lúc khách mở trang), `urgentMinutes` (mốc nhấp nháy mạnh)
- **Sản phẩm, giá, phân loại:** `PRODUCTS`. ⚠️ Khi đổi giá hoặc thêm sản phẩm, **sửa cả `CATALOG` trong `google-apps-script.gs`** (cùng `id`) rồi deploy version mới – backend chỉ chấp nhận sản phẩm có trong `CATALOG`.
- **Ảnh sản phẩm:** hiện dùng ảnh minh hoạ SVG tự sinh. Thay bằng ảnh thật:
  ```js
  images: ['images/de-do-1.webp', 'images/de-do-2.webp', 'images/de-do-3.webp'],
  ```
  Ảnh vuông (1:1), khoảng 1000×1000px, định dạng WebP/JPG nén < 200KB. `imageIndex` của mỗi phân loại là vị trí ảnh sẽ hiển thị khi chọn phân loại đó.
- **Màu sắc, bo góc, font:** biến CSS trong `:root` ở đầu `style.css`.

---

## 5. Dữ liệu địa chỉ Việt Nam

Dùng API miễn phí [provinces.open-api.vn](https://provinces.open-api.vn):

- `ADDRESS.MODE: 'v2'` (mặc định) – **địa giới mới 2 cấp: Tỉnh/Thành → Phường/Xã**, áp dụng từ 01/07/2025 (34 tỉnh/thành, bỏ cấp huyện). Ô Quận/Huyện tự ẩn.
- `ADDRESS.MODE: 'v1'` – địa giới cũ 3 cấp; ô Quận/Huyện tự hiện và bắt buộc chọn.
- Nếu nguồn chính lỗi → tự thử nguồn còn lại → cuối cùng dùng danh sách 34 tỉnh/thành có sẵn trong code. Khi đó khách vẫn chọn được tỉnh, ghi phường/xã vào ô địa chỉ chi tiết, kèm nút “Thử lại”.

Không có ô nhập tự do cho tỉnh/huyện/xã; mọi lựa chọn đều từ dropdown.

---

## 6. Deploy website

Website là 100% static, đưa lên bất kỳ hosting tĩnh nào:

- **Netlify:** kéo thả thư mục vào [app.netlify.com/drop](https://app.netlify.com/drop).
- **GitHub Pages:** đẩy code lên repo → Settings → Pages → Deploy from branch `main` / root.
- **Vercel / Cloudflare Pages / hosting cPanel:** upload 3 file `index.html`, `style.css`, `script.js` (file `.gs` và README không cần upload).

---

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Bấm đặt hàng báo “Không kết nối được máy chủ” | Sai URL (phải kết thúc bằng `/exec`), hoặc deploy chưa để **Who has access: Anyone** |
| Sửa Apps Script nhưng không thay đổi | Chưa deploy **New version** (xem lưu ý ở mục 2) |
| Đơn không vào sheet, API trả `"Không thể tạo đơn hàng"` | Apps Script → **Executions** để xem log lỗi chi tiết; kiểm tra `productId/variantId` có trong `CATALOG` |
| Báo “Phân loại sản phẩm không hợp lệ” | `PRODUCTS` (script.js) và `CATALOG` (.gs) không khớp `id` |
| Dropdown phường/xã không tải | API địa chỉ tạm lỗi hoặc mất mạng – bấm “Thử lại”; trang vẫn nhận đơn với tỉnh + địa chỉ chi tiết |
| Số điện thoại mất số 0 đầu | Backend đã ghi dạng text; nếu bạn tự nhập tay, gõ dấu `'` trước số |

Chúc shop một mùa Tết Đinh Mùi 2027 đắt hàng! 🎉
