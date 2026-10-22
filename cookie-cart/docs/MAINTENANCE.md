# Cookie Cart: Maintenance & Expansion Guide

Written for whoever looks after the app next, including someone who has never seen it. Most day-to-day changes are **Sheet edits, not code**.

## How it fits together

```
Teacher's browser ──google.script.run──►  Orders.gs / Products.gs  ──►  Google Sheet tabs
Staff tablet      ──(polls every 12 s)─►  Dashboard.gs                  Products, Orders, OrderHistory,
Email buttons     ──?page=edit&token=─►   Code.gs → Customer page       Staff, Settings, Errors
```

- **The Sheet is the database.** Each tab has a header row. The code finds columns **by name**, so you may reorder or widen columns, but never rename or delete them.
- **Every browser-callable function checks permissions on the server** (`requireCustomer_`, `requireStaff_`, `requireOwner_`). Hiding a button is never the security.
- Functions ending in `_` cannot be called from a browser. Keep it that way for helpers.
- Every write runs inside `withLock_()` and is recorded in **OrderHistory**.

### Golden rules

1. Change **Settings** and **Products** in the Sheet; change code only when there's no setting for it.
2. Never rename tabs or header cells. To add a column, add it at the end, add the name to `CONFIG.HEADERS` in `Config.gs`, and run `setup()`.
3. All wording lives in `Strings.gs`. Never hard-code text in other files.
4. Test on the `/dev` link (below) before publishing a new version.
5. Before publishing, run `npm run test:cookies` from the repository root if you can (Node 18+). It catches a missing permission check, a syntax error, or a broken flow.

---

## ⏱ Add a new cookie type in under 2 minutes

No code. No redeploy.

1. Open the **Products** tab.
2. Add a row under the last cookie:

   | Column | Example | Notes |
   |---|---|---|
   | ProductID | `OATMEAL` | Short, unique, CAPITALS, no spaces. **Never change it later**: orders refer to it. |
   | Name | `Oatmeal Raisin Cookie` | What teachers see |
   | Description | `Chewy, with plump raisins.` | One line |
   | Price | `1.25` | Number, no `$` |
   | Available | ☑ | Untick = hidden from teachers |
   | DailyLimit | `48` | Blank or 0 = unlimited |
   | Allergens | `Wheat, Milk, Eggs` | Shown on the card |
   | DietaryTags | `Vegetarian` | Comma-separated chips |
   | ImageURL | *(optional)* | Must start with `https://` (e.g. a Drive image shared to your domain). Blank shows a 🍪. |
   | SortOrder | `30` | Smaller = higher on the page |

3. Done. The cache clears as soon as you edit the tab. Teachers see it next time they open or refresh the page.

With two or more cookies *Available*, the order page **switches automatically** from the big single-cookie card to the multi-cookie list. The dashboard, prep summary, labels, emails and day summary all list it too.

**Retiring a cookie:** untick *Available* (or tick it sold out from the dashboard). Don't delete the row while there are active orders containing it. Those orders keep working either way, but the row also holds its name for history.

---

## 1. Products & prices

| What | Where | How to change safely |
|---|---|---|
| Price | Products → Price | New orders use the new price immediately. **Existing orders keep the price the teacher saw**, including when they edit. |
| Sold out today | Dashboard → Controls → untick *Available* (or untick in the Sheet) | Teachers stop seeing it at once. Orders already placed are unaffected. |
| Daily limit | Dashboard → Controls → *Daily limit* (or Products → DailyLimit) | Counts all non-cancelled orders placed **today**. Cancelling frees cookies. `LOW_STOCK_THRESHOLD` controls when "Only N left today" appears. |
| Order of cookies | Products → SortOrder | |
| Photos | Products → ImageURL | Only `https://` URLs are shown; anything else is ignored. |

Code: `Products.gs` (reading the tab and the two dashboard controls) and `buildItems_()` in `Orders.gs` (prices, limits, availability, all enforced on the server).

## 2. Ordering hours, cutoffs and delivery windows

| Setting | Meaning |
|---|---|
| `ORDER_DAYS` | Days ordering is open (`Mon,Tue,Wed,Thu,Fri`) |
| `ORDER_OPEN_TIME` | Opens (24-hour `HH:MM`; blank = midnight) |
| `ORDER_CUTOFF_TIME` | Last time to place or add to an order (blank = no cutoff) |
| `ORDERING_ENABLED` | Master switch. Staff flip it from **Dashboard → Controls**, e.g. for a snow day or when they're out of dough. |
| `DELIVERY_WINDOWS` | Comma-separated choices shown to teachers. Blank hides the question. They are preferences printed on the route sheet and labels, not separate cutoffs. |

The closed message tells teachers exactly when ordering reopens (e.g. *"Today's ordering closed at 10:30 AM. It reopens Thursday at 7:00 AM."*). Times use the time zone in `appsscript.json`.

Code: `getOrderingWindow_()` in `Auth.gs`.

## 3. Order limits

| Setting | Default | |
|---|---|---|
| `MAX_QTY_PER_ORDER` | 60 | Total cookies in one order |
| `MAX_QTY_PER_PRODUCT` | 60 | Of a single cookie type |
| `STUDENT_MAX_QTY_PER_ORDER` | 3 | Students only (if enabled) |

Hard ceilings that Settings cannot exceed are in `CONFIG.HARD_LIMITS` (`Config.gs`).

## 4. Edit and cancel rules

| Setting | Default | Effect |
|---|---|---|
| `EDITS_ALLOWED_UNTIL` | `Delivered` | Teachers can edit until this status. `Preparing` = no edits once baking starts. |
| `NO_DECREASE_OR_CANCEL_FROM` | `Out for Delivery` | From this status, teachers can only **add**. Set to `Preparing` to stop reductions once baking starts. |
| `ALLOW_INCREASE_AFTER_CUTOFF` | `FALSE` | TRUE lets teachers add cookies after the cutoff. |

The edit screen explains the current rule in plain words. The server enforces it again in `editRules_()` (`Orders.gs`). Each edit increments **Version**, writes OrderHistory, and emails the teacher a was/now table.

Two tabs open on the same order? The second save is refused with "changed since you opened it" (`expectedVersion` check), and the page reloads the latest version.

## 5. Email links ("Edit my order", "Cancel order")

- Each order gets a random 64-character `EditToken` (Orders tab). Links are `…/exec?page=edit&order=12&token=…` and `?page=cancel…`.
- **Both** the token **and** being signed in as the order's owner are required. A forwarded email is useless to anyone else.
- Errors never reveal whether another person's order exists.
- The cancel link opens a confirmation page. It never cancels on load, because email security scanners open links.
- The token is cleared when the order is delivered or cancelled, so the link stops working.
- Email wording: `Strings.gs → STRINGS.email`. Layout: `Email.gs`.

If email buttons open the test version or nothing, set `WEB_APP_URL` (Settings) to the `/exec` link.

## 6. The staff dashboard

| Feature | Where | Notes |
|---|---|---|
| Poll speed | `POLL_SECONDS` (10–60) | When nothing changed, the server answers from a version counter without reading the Sheet. |
| **UPDATED AFTER DISPATCH** | `toStaffOrder_()` in `Dashboard.gs` | Shown when an order that is *Out for Delivery* has a Version above the last acknowledged one. It lists the difference between what was in the bag when it left (`DispatchedItemsJSON`) and now, plus any room change. **Acknowledge** sets `AckVersion`, makes the current contents the new baseline, and logs the staff member's name. |
| Staff email on such edits | `STAFF_NOTIFY_EMAILS`, `NOTIFY_STAFF_ON_DISPATCHED_EDIT` | |
| "Edited" badge | same | Quiet badge for edits made before dispatch. |
| Route view, delivery sheet, bag labels | `DashboardJs.html` (`renderRoute`, `sheetNode`, `labelsNode`) | Print styles are at the end of `Styles.html`. Labels print two per row on Letter/A4. |
| Day summary | `buildDaySummary_()` | Same numbers on screen and in the 4 PM email. |
| Controls | `setOrderingEnabled`, `setProductAvailable`, `setProductDailyLimit` | Any Staff/Admin can use them. |

Adding a status (rarely needed): add it to `CONFIG.STATUS`, `STATUS_FLOW`/`ACTIVE_STATUSES` and `STAFF_ACTIONS_` (`Orders.gs`), plus a button in `actions()` (`DashboardJs.html`), plus a badge in `App.statusBadge` (`Scripts.html`), plus wording in `Strings.gs`.

## 7. Access control

| Who | How it is decided |
|---|---|
| Teacher/staff customer | Email domain is in `ALLOWED_DOMAINS` and the part before the @ does **not** match `STUDENT_EMAIL_PATTERN` |
| Student | Domain in `STUDENT_DOMAINS`, **or** in `ALLOWED_DOMAINS` and matching `STUDENT_EMAIL_PATTERN` (default `^[0-9]{3,9}`, e.g. `1111111@district.org`) |
| Dashboard staff | Listed in **Staff** with Role exactly `Admin` or `Staff`. Students are excluded even if listed. |
| Owner | The deploying account. Only the owner can run setup, the health check, triggers and reset. |

The web app is deployed **"Anyone within your domain"**, so Google blocks outside accounts before the app even runs. `tests/check.js` fails if anyone adds a browser-callable function without a permission check.

## 8. Wording and translation

Every user-facing sentence is in `Strings.gs`:
- `STRINGS.server`: error and status messages from the server.
- `STRINGS.email`: email text.
- `STRINGS.client`: everything on the pages. These are sent to the browser and used via `App.t('key')`.

To translate, copy the file, translate the **values** (never the keys), and keep `{placeholders}` as they are. `{app}` is replaced by `APP_NAME`.

## 9. Caching

Settings, Products and Staff are cached for up to 5 minutes. The cache is cleared:
- automatically when someone edits those tabs (`onEdit` in `Setup.gs`);
- when staff use the dashboard controls;
- by **Cookie Cart → Clear cache**.

Orders are never cached, so they are always live.

## 10. Data retention

| Setting | |
|---|---|
| `DELETE_CLOSED_ORDERS_AFTER_DAYS` | 0 = keep forever. Otherwise the nightly job deletes delivered/cancelled orders, and their change log, older than this. |
| `ERROR_LOG_RETENTION_DAYS` | Default 90. |

---

## Students

Students share the teachers' domain (`@district.org`) but their addresses start with 3–9 digits. That pattern is how the app tells them apart.

### Telling students apart (domain / OU)

- **Same domain, numeric IDs (default):** `STUDENT_EMAIL_PATTERN = ^[0-9]{3,9}`. Test it on a few real addresses. `1111111@district.org` → student; `firstname.lastname@district.org`, `F.Lastname@…`, `FLastname@…` → staff.
- **Separate student domain** (e.g. `students.district.org`): put it in `STUDENT_DOMAINS`, not `ALLOWED_DOMAINS`.
- **By organizational unit (OU):** Apps Script can't see a user's OU without the Admin SDK, which needs a domain admin and extra permissions. Prefer one of these:
  - ask IT to deploy a separate copy of the web app restricted to the staff OU or a staff Google Group (Workspace sharing settings); or
  - keep the email-pattern rule.

### Keeping students out of the dashboard

Already enforced: `getStaffMap_()` only grants dashboard access to Staff-tab rows with a valid Role, and `getUserContext_()` never marks a student account as staff, even if someone adds it to the Staff tab. Leave that check in place.

### Letting students order

1. Set `STUDENT_ORDERING_ENABLED` to `TRUE`.
2. Set `STUDENT_MAX_QTY_PER_ORDER` (default 3).
3. Student orders show a **STUDENT** badge on the dashboard and are recorded with `CustomerType = Student`.

**Teacher approval (optional, needs code):** add a status such as `Awaiting approval` before `Received` (see *Adding a status*). Make `submitOrder` set it for students, and add an "Approve" button visible to Staff/Admin. Keep approval on the server side; never trust the browser.

### Privacy (FERPA / district policy)

- The app stores, for each order: email, the name typed, room, class/period, instructions, allergy flag and payment method. **The allergy note can be health information.** Tell staff to write "nut allergy in room", not names, and keep the Sheet shared only with cart staff.
- The Sheet lives in the owner's Drive. Share it only with people who need it (Viewer for most). Don't publish it to the web.
- Turn on `DELETE_CLOSED_ORDERS_AFTER_DAYS` (for example 180 or 365) to match your district's retention schedule. Backups made by *Reset for go-live* are ordinary tabs: delete them when no longer needed.
- Emails go only to the person who placed the order and to addresses you list in Settings.
- Students' data should not be exported outside your domain. The app has no external connections (`spreadsheets.currentonly`, no `UrlFetch`).
- Check with your district's data-privacy officer before enabling student ordering.

---

## Testing changes safely

**Option A: the `/dev` link (quick).** In the editor, **Deploy → Test deployments** gives a `/dev` URL that always runs the **latest saved code**, but only for editors of the script. Use it with `?page=dashboard`, etc. Real users keep the published version until you publish a new one.

> `/dev` still uses the **real Sheet**. Prefer Option B for anything that writes orders, or set `SEND_EMAILS` to FALSE while testing and cancel your test orders afterwards.

**Option B: a test copy (safest).**
1. **File → Make a copy** of the Sheet. The script is copied with it.
2. In the copy: run `setup()`, set `SEND_EMAILS` to FALSE (or use your own address), and deploy it as its own web app.
3. Try your change there. When it works, paste the same code into the live project and publish a **new version** of the live deployment.

**Option C: automated checks.** From the repository root: `npm run test:cookies`. It runs 23 simulated flows, including:
- unauthorized access, duplicate submissions and concurrent orders;
- email-link edits, edits after dispatch, blocked edits;
- daily limits, cutoffs, and adding a second cookie;
- students, retention, and reset.

Add a test there when you change a rule.

---

## Quick reference: "I want to…"

| I want to… | Do this |
|---|---|
| Add a cookie | Products tab, new row (see above) |
| Change a price | Products → Price |
| Mark sold out for today | Dashboard → Controls → untick Available |
| Limit cookies per day | Dashboard → Controls → Daily limit |
| Close ordering today | Dashboard → Controls → Close ordering |
| Move the cutoff | Settings → `ORDER_CUTOFF_TIME` |
| Change delivery windows | Settings → `DELIVERY_WINDOWS` |
| Allow department billing | Settings → `ALLOW_ACCOUNT_CHARGE` TRUE (and `ACCOUNT_CHARGE_LABEL`) |
| Add a staff member | Staff tab: email, name, Role `Staff` |
| Get alerts on late changes | Settings → `STAFF_NOTIFY_EMAILS` |
| Get the daily summary | Settings → `DAILY_SUMMARY_EMAILS` + Install triggers |
| Change any wording | `Strings.gs`, then publish a new version |
| Start numbering at 1 after testing | Cookie Cart → Reset for go-live |
| See why something failed | Errors tab, or Executions in the Apps Script editor |
