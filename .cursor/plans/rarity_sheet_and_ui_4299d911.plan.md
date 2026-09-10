---
name: Rarity sheet and UI
overview: Fix Google sheet-per-account onboarding (copy as Rarity, user accepts ownership), then add KRW/SAR, chat typing loader, settings two-pane (WA first, status/currency behind arrow), and SVG back arrows.
todos:
  - id: fix-transfer
    content: "Server: pendingOwner create only; persist email\to sheetId; skip recopy"
    status: in_progress
  - id: sheet-per-account
    content: "Frontend: email-keyed sheet map, required accept-owner step, no auto GIS popup"
    status: in_progress
  - id: chat-loader
    content: Define showBotTyping; remove dead return in handleUserChat
    status: in_progress
  - id: currency
    content: Add KRW and SAR on web select + WA !currency/formatCurrency
    status: in_progress
  - id: settings-panes
    content: "Settings: WA pane first, arrow to status+currency, WA connect guide"
    status: in_progress
  - id: back-svg
    content: Replace ← back links with SVG arrow on rarity static pages
    status: in_progress
isProject: false
---

# Rarity sheet ownership + settings UI

Must-flow (no skip):

```mermaid
sequenceDiagram
  participant User
  participant Web as rarity/index.html
  participant API as rarity/server.js
  participant Drive as GoogleDrive
  User->>Web: click Login
  Web->>Drive: GIS token popup
  Web->>Web: lookup sheetId by Google email
  alt email already has sheet
    Web->>Drive: verify access
    Web->>User: continue
  else first time
    Web->>API: POST /api/copy-template
    API->>Drive: copy template, rename, writer plus pendingOwner
    Web->>User: Terima kepemilikan
    User->>Drive: accept owner
    Web->>Drive: verify user is owner then share bot
    Web->>User: continue
  end
```



## Root cause of friend error

Error `The transferOwnership parameter must be enabled when the permission role is 'owner'` comes from `[rarity/server.js](rarity/server.js)` `permissions.update` with `transferOwnership: true` while body is still `role: writer`. Google treats that as an owner transfer missing a valid owner-role transfer.

Consumer Gmail cannot instant-transfer. Correct split:

- Owner (server): **one** `permissions.create` with `role: writer`, `pendingOwner: true`. **No** `transferOwnership`.
- User (frontend, after a click): `PATCH .../permissions/{id}?transferOwnership=true` body `{ role: "owner" }`.

Popup logs: expired token on load calls `triggerLogin('')` with **no click** (`[rarity/index.html](rarity/index.html)` ~2343). GIS popup blocked. Stay on login. User clicks again.

`Promised response from onMessage listener went out of scope` = browser extension. Ignore.

## 1. Sheet bound to Google account

Today: one `rarity_sheet_id`. Logout deletes it. Next login always copies. Wrong account can inherit leftover id.

- Store map `email -> { sheetId, permissionId, plannerTab }` in localStorage (`rarity_sheet_by_email`).
- After `fetchUserProfile`, set `spreadsheetId` from **that email** only. Never reuse another account's id.
- Logout: drop token/profile/chat. **Keep** email→sheet map.
- Server: `webSheets[email]` in a small file next to `users.json`. `POST /api/copy-template`: if email already has `sheetId`, return `{ id, existing: true }` (no second copy). On new copy, save mapping.
- Duplicate `reinitializeSheet` (~1353 and ~1387): keep **one** with confirm; clear **that email** only, then copy again.

## 2. Ownership accept is a required step

After copy (not `existing`):

- Do **not** auto-PATCH ownership inside `setupUserSheet`.
- Blocking UI: sheet name, Open Sheet, button **Terima kepemilikan**.
- Button (user gesture) runs the PATCH. Then `files.get?fields=owners` — user email must be owner. Fail → keep modal, show Drive invite / open sheet.
- Only then: `_ChatState`, share `rarity.erc@gmail.com` writer, continue.
- `sendNotificationEmail: true` on create so Drive invite exists if PATCH fails.

## 3. Chat loading + syntax fix

`[showBotTyping](rarity/index.html)` is called, **not defined**. Extra dead `return; }` after `pendingReceipt` (~1601–1602) kills all later chat.

- Add typing bubble (reuse `.chat-loader` spinner/dots as a bot msg).
- `showBotTyping(true/false)` around `callGemini` in `handleUserChat` (drop `addBotMsg("Memproses...")`) and `parseReceipt`.
- Delete the stray `return; }`.

## 4. Currency KRW + SAR

Same helper, both surfaces:

- Web `formatCurrency` / `#currency-select`: IDR, AUD, **KRW**, **SAR** (Saudi riyal).
- WA `[formatCurrency](rarity/server.js)` + `!currency` allow-list: `IDR|AUD|KRW|SAR`.

`Intl.NumberFormat`: KRW `ko-KR` 0 fraction; SAR `en-SA` 2 fraction.

## 5. Settings first page = WA, arrow = status/currency

`[#settings-modal](rarity/index.html)`: two panes, one chevron.

**Pane 1 (default):** WhatsApp Bot Sheet ID, Buka Chat, Salin, `!sheet <ID>`, Beri Izin Bot, Refresh, Buat Ulang Sheet. Short numbered guide: Salin ID → WA bot → `!sheet ID` → Beri Izin Bot → done.

**Pane 2 (arrow right):** Akun / Sheets / Gemini badges + Mata Uang select.

Widen modal a bit. Keep existing handlers (`copyWaSheetId`, `grantBotEditorAccess`, etc.).

## 6. Back buttons → SVG arrow

Replace `← Kembali...` text-arrow in `[privacy.html](rarity/privacy.html)`, `[terms.html](rarity/terms.html)`, `[about.html](rarity/about.html)`, `[versions/index.html](rarity/versions/index.html)`, `[status/index.html](rarity/status/index.html)`. Inline SVG chevron + same label. No new icon lib.

## Files

- `[rarity/index.html](rarity/index.html)` — login/sheet map, accept modal, typing, settings panes, currencies, drop auto-login, fix chat syntax, one `reinitializeSheet`
- `[rarity/server.js](rarity/server.js)` — pendingOwner-only share, email→sheet map, KRW/SAR
- five static pages — back SVG

Skipped: extension `onMessage` warning; Drive picker; new cloud DB (Render disk wipe = known ceiling; localStorage map still binds account on same browser).