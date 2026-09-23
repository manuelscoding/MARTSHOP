# Maintenance & Expansion Guide

This guide is written for **school staff who are not programmers**. It explains:

- what each part of the app does
- where that part lives
- how to change it safely

## How the app is organized

Things you might want to change live in **three places**. Always use the first one that works.

| Place | What you change there | Risk |
|---|---|---|
| **1. Sheet tabs** (Menu, Staff) | Menu items, prices, availability, who is shop staff | Safe. Changes apply right away. |
| **2. Settings tab** | Shop name, allowed domains, hours, delivery, limits, emails, student rules | Safe. Changes apply within 60 s, or immediately with **Coffee Shop → Clear settings cache**. |
| **3. Code** (Extensions → Apps Script) | Wording, layout, new features | Needs care. Test first, then publish a new version (see [Testing changes safely](#f-testing-changes-safely)). |

### Golden rules

1. **Never rename or delete column headers** in the Menu, Orders, Staff or Settings tabs. You *may* reorder columns; the code finds them by name.
2. **Never edit the Orders tab by hand while the shop is open.** Use the dashboard. If you must fix something, change one cell and don't touch `ItemsJSON`, `ResponseToken` or `StatusHistory`.
3. **Never change an `ItemID`** once it has been used in orders. To retire an item, untick `Available`, or delete its row.
4. **Keep the Sheet private.** Staff and customers do not need access to it; the app runs as the owner. Share edit access only with the one or two people who maintain it.
5. **After any code change, publish a new version** (Deploy → Manage deployments → Edit → New version). Never make a *New deployment*: that changes the URL.
6. If something breaks, look at the **Errors** tab first.

### Reading the code, in 30 seconds

- Files ending in `.gs` run on Google's servers. Files ending in `.html` run in the user's browser.
- A function whose name ends in `_` (like `validateRoom_`) is **private**: browsers cannot call it.
- A function without `_` (like `submitOrder`) **can** be called from a browser. That is why each of those starts with `requireCustomer_()` or `requireStaff_()`. **Keep those lines** if you copy or edit such a function.
- User-facing error messages are written as `throw new AppError('...')`. You can safely reword the text inside the quotes.

---

## 1. Configuration

**What it does.** Holds every adjustable option in one place.

**Where it lives.**
- The **Settings** tab (Key / Value / Description).
- The defaults and descriptions are in `Config.gs` → `DEFAULT_SETTINGS`.
- Values are read by `getSettings_()` in `Config.gs`.
- Fixed structure (sheet names, column headers, status names) is in `Config.gs` → `CONFIG`.

**How to change it safely.**
- Edit the **Value** cell in the Settings tab. `TRUE`/`FALSE`, numbers and text are all fine. Times are 24-hour `HH:MM`.
- A blank value means "use the default". The exceptions are the hours, lists and optional text settings, where blank means "none / no limit".
- To **add a new setting**, add a line to `DEFAULT_SETTINGS` in `Config.gs`: `['MY_KEY', defaultValue, 'Description'],`. Then run **Coffee Shop → Run setup** to add the row. Read it in code as `getSettings_().MY_KEY`.
- Don't change `CONFIG.STATUS` names. Existing orders store those exact words.

## 2. Menu

**What it does.** The list of items and prices customers see. Prices are **only** ever taken from here, so a customer can't change a price in their browser.

`setup()` loads the shop's starting menu: 12 **Drinks** and 8 **Snacks**. Customers see each item as a card with:
- a large **icon** (emoji)
- the name and price
- an optional colored **tag** such as HOT, ICED, SPICY, SPECIAL or SEASONAL
- an **Add** button, which turns into − / + controls once the item is in the order

Customers can filter by category with the chips at the top (All / Drinks / Snacks) or type in **Search the menu**. The items they've picked appear as small icons in the bar at the bottom, next to the running total. The dashboard shows the same icons beside each order line, so baristas can scan orders quickly.

**Where it lives.**
- The **Menu** tab.
- Code: `Menu.gs` → `readMenu_()` (reads and sorts), `getCustomerBootstrap()` (sends available items to customers), `getMenuAdmin()` / `setMenuItemAvailability()` (dashboard Menu tab).

**How to change it safely.**
- **Add an item:** add a row with a new unique `ItemID` (letters/numbers, no spaces), `Name`, `Price` (a number like `3.25`), tick `Available`, and fill in `Category` and `SortOrder`. Optionally fill in `Icon` and `Tag` (below).
- **Icon:** paste one emoji into the `Icon` cell (on a Chromebook: Search + Shift + Space; on Windows: Windows key + period; on a Mac: Ctrl + Cmd + Space). If it's blank, the item gets its category's icon.
- **Tag:** a short word shown as a badge on the card. These words get special colors:
  - `Hot` or `Spicy`: red
  - `Iced` or `Cold`: blue
  - `Seasonal`: gold
  - `Special`, `New` or `Fan favorite`: purple

  Any other word shows in gray. Keep it short (one or two words) so it fits on phones.
- **Seasonal Treat:** rename it for the season (e.g. "Pumpkin Bread"), change its icon, and keep the `Seasonal` tag.
- **Category colors:** Drinks are teal and Snacks are orange. A new category (e.g. `Breakfast`) automatically gets its own color. To pick a specific color, add it to `CATEGORY_ACCENTS` near the top of the menu code in `CustomerJs.html`.
- **Change a price:** edit `Price`. New orders use it immediately. Existing orders keep the price they were placed at.
- **Temporarily unavailable:** untick `Available`, or use the dashboard's **Menu** tab.
- **Order on screen:** categories appear in the order of their smallest `SortOrder`, and items within a category by `SortOrder`. Leave gaps (10, 20, 30…) so new items can go in between.
- Rows with a missing ID/name, an invalid price or a duplicate ID are **skipped**, not shown.
- **Already ran `setup()` with the old sample menu?** `setup()` only fills an **empty** Menu tab. Delete all rows under the header in the Menu tab, then run **Coffee Shop → Run setup / repair sheets**. It also adds the new `Icon` and `Tag` columns.

## 3. Customer ordering

**What it does.** Customers go through four steps (menu, delivery, payment, review) and submit. They then see a confirmation with an order number and get an email.

**Where it lives.**

| What | Where |
|---|---|
| Page | `Customer.html` |
| Behavior | `CustomerJs.html` (`renderMenu`, `renderDelivery`, `renderPayment`, `renderReview`, `submit`, `renderDone`) |
| Server side | `Orders.gs` → `submitOrder()`, which checks access, ordering hours and limits, prices the items from the Menu, takes the lock, assigns the next order number, saves the row and sends the email |
| Validation | `Orders.gs` → `buildLines_()` (items and quantities), `validateDetails_()` (name, delivery, room, payment) |
| Confirmation email | `Email.gs` → `sendConfirmationEmail_()` |

**How to change it safely.**
- **Limits** (settings): `MAX_QTY_PER_ITEM`, `MAX_ITEMS_PER_ORDER`, `MAX_ACTIVE_ORDERS_PER_CUSTOMER`.
- **Hours** (settings): `ORDERING_ENABLED` (master on/off), `ORDER_DAYS`, `ORDER_OPEN_TIME`, `ORDER_CLOSE_TIME`. The logic is in `Auth.gs` → `getOrderingWindow_()`.
- **Wording on screen:** edit the text in quotes in `CustomerJs.html`, e.g. `'What would you like?'`.
- **Colors and sizes:** edit the variables at the top of `Styles.html` (`--brand`, etc.). Keep text dark on light backgrounds, or light on dark, so it stays readable.
- **Duplicate protection:** the Submit button is disabled while sending, and each attempt carries a `requestId`. **Don't remove either.**

## 4. Delivery

**What it does.** Asks "Would you like delivery?" If the answer is yes, a valid room number is required. The shop dashboard shows **DELIVERY / ROOM ###** in large type.

**Where it lives.**
- Browser: `CustomerJs.html` → `renderDelivery()`, `roomError()`.
- Server: `Orders.gs` → `validateRoom_()` (the rule that counts).
- Dashboard display: `ShopJs.html` → `card()` (the `fulfil delivery` block).

**How to change it safely.**
- **Turn delivery off for everyone:** `DELIVERY_ENABLED` = `FALSE`. Customers see "Pickup only".
- **Room format:** `ROOM_PATTERN` is a "regular expression" checked against the room in UPPERCASE. The default `^[A-Z]?[0-9]{1,4}[A-Z]?$` accepts `214`, `B12`, `101A`. Examples:
  - digits only, 3 digits: `^[0-9]{3}$`
  - building letter then dash then number (e.g. `A-104`): `^[A-Z]-[0-9]{3}$`
- **Named places** (Library, Gym…): list them in `NAMED_ROOMS`, separated by commas.
- Always test a new pattern with a few real room numbers. The server rejects anything that doesn't match.

## 5. Payment

**What it does.** Records whether the customer will pay with **Cash** or **Card**. No money is processed online. The dashboard shows a CASH or CARD tag.

**Where it lives.**
- The choices are `CONFIG.PAYMENT_METHODS` in `Config.gs`.
- The screen is `CustomerJs.html` → `renderPayment()`.
- Server check: `validateDetails_()` in `Orders.gs`.

**How to change it safely.**
- To add a method, use a one-word name (e.g. `Voucher`). Add it to `CONFIG.PAYMENT_METHODS` and add a matching `choice('Voucher', 'Voucher')` line in `renderPayment()`. For its dashboard color, add a `.pay.Voucher { color: ... }` rule in `Styles.html` next to `.pay.Cash` and `.pay.Card`.
- Don't add online payments to this app. Card processing needs a PCI-compliant provider and district approval.

## 6. Shop dashboard

**What it does.**
- Shows active orders, oldest first: number, customer, items, total, payment, delivery room, and a live "Submitted N min ago" timer.
- Checks for new orders every `POLL_SECONDS` without reloading, and highlights **NEW** and **UPDATED** orders.
- Has an optional chime (tap **Sound: off** to turn it on).

**Where it lives.**

| What | Where |
|---|---|
| Page | `Shop.html` |
| Behavior | `ShopJs.html` (`poll`, `receive`, `card`, `actions`, `tick`) |
| Server | `Orders.gs` → `getShopBootstrap()`, `getActiveOrders()`, `startOrder()`, `completeOrder()`, `cancelOrder()` |

**How to change it safely.**
- **Refresh speed:** `POLL_SECONDS` (10–60). Faster uses more quota; 12 is a good balance.
- **"Late" timer color:** `LATE_MINUTES` near the top of `ShopJs.html` (default 15).
- **Card layout:** `card()` in `ShopJs.html`. Always use `h('tag', {...}, text)` to show text. **Never** use `innerHTML` with customer data; it would let someone inject code via their name.
- **Cancel:** needs a confirmation. The customer is emailed with the optional reason (`sendCancelledEmail_` in `Email.gs`).

## 7. Unavailable-item emails

**What it does.** Staff tap **Item unavailable**, tick the item(s), and optionally tick "Also turn these items off on the menu". Then:

1. The order becomes **Awaiting Customer Response**.
2. A new secret token is created.
3. The customer is emailed "*Item* is no longer available". The email lists the remaining items and the new total, and has two buttons:
   - **Continue without this item:** opens a confirm page. On confirm, the item is removed, the total is recalculated on the server, and the order returns to **Pending**. If no items would remain, the order is cancelled instead.
   - **Revise my order:** opens the ordering app pre-filled, with the unavailable item hidden. The customer resubmits under the **same order number**, with a newly calculated total.

**Safety of the links.**
- Each link works only for the signed-in customer who placed the order.
- Each link works only once.
- Links expire after `RESPONSE_LINK_HOURS`.
- Flagging another item makes older links stop working.

**If the customer never responds.**
- The card shows "Waiting on customer: N min" and turns red after `AWAITING_WARN_MINUTES`.
- Staff can **Cancel**, or tap **Continue without item** if the customer answered in person or by phone.
- Optionally set `AUTO_CANCEL_AWAITING_MINUTES` (and install maintenance triggers) to cancel such orders automatically.

**Where it lives.**

| What | Where |
|---|---|
| Staff actions | `Orders.gs` → `markItemsUnavailable()`, `staffContinueWithout()`, `resolveContinue_()` |
| Link checking | `verifyResponse_()` |
| Customer actions | `getResponseContext()`, `respondContinue()`, `respondCancel()`, `submitRevision()` |
| Email | `Email.gs` → `sendUnavailableEmail_()` |
| Pages | `CustomerJs.html` → `renderRespond()`, `startRevision()` |
| Link routing | `Code.gs` → `doGet()` (`page=respond`) |

**How to change it safely.**
- Reword the email in `sendUnavailableEmail_()`. Keep `esc_(...)` around anything that comes from the order (names, items).
- Change the link lifetime with `RESPONSE_LINK_HOURS`.
- **Do not** remove the `verifyResponse_(...)` calls.

## 8. Completion

**What it does.**
- **Complete** marks the order **Completed**, records `CompletedAt`, and removes it from the active list.
- **Start** (optional) marks it **In Progress**.
- In History, **Reopen order** puts a completed order back to Pending if it was completed by mistake.
- If `EMAIL_ON_COMPLETE` is `TRUE`, the customer gets a "ready" or "on its way" email.

**Where it lives.**
- `Orders.gs` → `completeOrder()`, `startOrder()`, `reopenOrder()`.
- Email: `Email.gs` → `sendReadyEmail_()`.

**How to change it safely.** Which statuses each button accepts is the list passed to `changeOrder_(...)`, e.g. `[CONFIG.STATUS.PENDING, CONFIG.STATUS.IN_PROGRESS]`. Keep those lists: they stop, for example, completing an order that's waiting on the customer.

## 9. History

**What it does.**
- Searches completed and cancelled orders, newest first.
- You can search by order number (`123` or `#123`), part of a name or email, a room, and/or a date.
- Tick "Include active orders" to search everything.
- Each result expands to show its items and a **timeline** of every status change: who made it, when, and any note.

**Where it lives.**
- `Orders.gs` → `getHistory()`.
- `ShopJs.html` → `loadHistory()`, `historyRow()`.
- Every status change is written by `setStatus_()` into the `StatusHistory` column.

**How to change it safely.**
- `HISTORY_MAX_RESULTS` limits how many results are shown.
- History searches the **Orders** tab only. Archived orders (older than `ARCHIVE_AFTER_DAYS`) are in the **Archive** tab; search them with the Sheet's own filter or Find tools.

## 10. Access control

**What it does.**
- **Who is a student?** On `ALLOWED_DOMAINS` (e.g. `district.org`), any account whose part before the @ matches `STUDENT_EMAIL_PATTERN` is a **student**. The default pattern is "starts with 3–9 digits", e.g. `1111111@district.org`. Every other account on that domain is **teacher/staff**, e.g. `firstname.lastname@`, `f.lastname@`, `flastname@`.
- **Customer side:** teachers and staff can order. Students can order only when `STUDENT_ORDERING_ENABLED` is `TRUE`; until then they see "Access denied".
- **Dashboard:** open only to teacher/staff accounts listed in the **Staff** tab. A student account is refused even if it is listed.
- These checks run on the server in **every** function. The deployment setting "Anyone within yourschool.org" is an extra outer fence.

**Where it lives.**
- `Auth.gs` → `getUserContext_()`, `requireCustomer_()`, `requireStaff_()`, `getStaffMap_()`.
- Page-level checks: `Code.gs` → `doGet()`.
- Admin-only functions: `Util.gs` → `requireOwner_()`, `requireOwnerOrTrigger_()`.

**How to change it safely.**
- **Add or remove shop staff:** edit the **Staff** tab, then **Clear settings cache**. `Role` is `Admin` or `Staff`. Both can use the dashboard today; `Admin` is there for future admin-only features (see `ctx.staffRole`).
- **Add a domain:** add it to `ALLOWED_DOMAINS`, separated by commas (e.g. `district.org, otherschool.org`). The student pattern applies to every domain in this list.
- **Never** remove a `requireCustomer_()` / `requireStaff_()` line from a function that has one.
- If you write a **new** browser-callable function, wrap it the same way: `return api_('name', function () { var ctx = requireStaff_(); ... });`.

---

## Expanding access to students

Student **ordering** is off by default (student accounts are recognised and refused until you enable it). Do this in a test copy first (see [Testing changes safely](#f-testing-changes-safely)), and get approval from your principal and your district technology/privacy office.

### A. Telling students apart from teachers

**Your district: students and teachers share `@district.org` (built in, already set up).**

Student accounts start with numbers (`1111111@district.org`). Teacher accounts are names (`firstname.lastname@`, `F.Lastname@`, `FLastname@`). The app tells them apart with the Settings value **`STUDENT_EMAIL_PATTERN`**, which is checked against the part of the email **before the @**:

| Email | Before the @ | Treated as |
|---|---|---|
| `1111111@district.org` | `1111111` | **Student** |
| `123@district.org`, `123456789@district.org` | 3–9 digits | **Student** |
| `firstname.lastname@district.org` | letters | Teacher/staff |
| `F.Lastname@district.org`, `FLastname@district.org` | letters | Teacher/staff |
| `jsmith2@district.org` | starts with a letter | Teacher/staff |

- The default pattern is `^[0-9]{3,9}`, meaning "starts with 3 to 9 digits". Any account that **starts** with 3 or more digits counts as a student, even if letters follow.
- Students are recognised **from day one**, even while student ordering is off. Until you enable it, they get "Access denied" instead of being treated as staff. They can never reach the shop dashboard.
- **To let students order:**
  1. Make sure `ALLOWED_DOMAINS` is `district.org`.
  2. Set `STUDENT_ORDERING_ENABLED` to `TRUE`.
  3. Choose **Coffee Shop → Clear settings cache**.
- **If the format ever changes**, edit `STUDENT_EMAIL_PATTERN`. Examples:
  - exactly 7 digits and nothing else: `^[0-9]{7}$`
  - starts with `s` then digits (e.g. `s1234567`): `^s[0-9]+$`

  Test a new pattern with one student and one teacher account. If the pattern is typed wrongly, the app falls back to the default and records a warning in the **Errors** tab. It never turns students into staff.
- **Staff with unusual accounts.** If a staff account starts with digits (e.g. `123office@district.org`), it will be treated as a student. Use a name-based account for the shop, or ask a developer to add an exceptions list.

**Separate student domain (also supported).** If students ever get their own domain, e.g. `students.district.org`, put it in `STUDENT_DOMAINS`. Every account on that domain is a student.

**Important technical check (separate domains only).** The app can identify users only if they are in the **same Google Workspace organization** as the owner. Many districts set up the student domain as a *secondary domain* of the same organization, and then it works. If students are in a **separate** Google Workspace organization:
- the app sees a blank email and shows "We could not confirm your account"
- the deployment option "Anyone within yourschool.org" also won't let them in

Test with one real student account before announcing. If it doesn't work, ask IT whether the student domain can be served by the same organization, or run a separate copy of the app owned by an account in the student organization.

**Organizational unit (OU) instead of domain (optional, needs IT).** If students share your main domain but sit in an OU such as `/Students`:
- The owner account needs Admin directory read access.
- Enable the **Admin SDK Directory** service in the Apps Script editor (**Services → + → Admin SDK API**).
- In `Auth.gs` → `getUserContext_()`, after `customerType` is worked out, add:

```js
// Treat users in the /Students OU as students (result cached for 6 hours).
if (customerType === CONFIG.CUSTOMER_TYPES.STAFF) {
  var cache = CacheService.getScriptCache();
  var key = 'ou_' + Utilities.base64EncodeWebSafe(email);
  var ou = cache.get(key);
  if (ou === null) {
    try { ou = AdminDirectory.Users.get(email, { projection: 'basic' }).orgUnitPath || ''; } catch (e) { ou = ''; }
    cache.put(key, ou, 21600);
  }
  if (ou.indexOf('/Students') === 0) customerType = CONFIG.CUSTOMER_TYPES.STUDENT;
}
```

### B. Separating student and staff permissions

This is already built in:
- A student account (matching `STUDENT_EMAIL_PATTERN` or on `STUDENT_DOMAINS`) **can never** open the shop dashboard or call any staff function, even if someone lists it in the Staff tab. `getUserContext_()` only looks up the Staff tab for teacher/staff accounts.
- Each order records `CustomerType` (`Staff`/`Student`), and student orders show a purple **STUDENT** badge on the dashboard.
- Student rules come from `getRules_()` in `Auth.gs`. This is the one place to add more student-only restrictions.

If student **helpers** will work the counter, an adult supervises using their own account. Don't loosen the student rule.

### C. Delivery rules for students

| Option | How |
|---|---|
| No delivery for students (default) | `STUDENT_DELIVERY_ENABLED` = `FALSE`. Students see "Pickup only". |
| Delivery only to certain rooms | `STUDENT_DELIVERY_ENABLED` = `TRUE` and `STUDENT_ALLOWED_ROOMS` = e.g. `LIBRARY, 101, 102`. Any other room is rejected on the server. |
| Delivery to any valid room | `STUDENT_DELIVERY_ENABLED` = `TRUE` with `STUDENT_ALLOWED_ROOMS` blank. |

### D. Order limits, time windows and approval

**Built-in settings:**
- `STUDENT_MAX_ITEMS_PER_ORDER` (default 5)
- `STUDENT_MAX_ACTIVE_ORDERS` (default 1 unfinished order at a time)
- `STUDENT_ORDER_DAYS`, `STUDENT_ORDER_OPEN_TIME`, `STUDENT_ORDER_CLOSE_TIME`: for example, allow students only before first bell and at lunch. For two windows a day, see below.

**Ideas that need a small code change** (ask a developer, or use these as a spec):

- **Two windows per day.** In `Auth.gs` → `getOrderingWindow_()`, accept a list like `07:15-07:45,11:30-12:15` and check each range.
- **Restricted items** (e.g. no caffeine for students). Add a column `StudentsAllowed` (TRUE/FALSE) to the Menu tab:
  - read it in `readMenu_()`
  - in `getCustomerBootstrap()` and `buildLines_()`, drop or reject items where it's FALSE when `rules.isStudent` is true
- **Daily spending cap.** In `submitOrder()`, while holding the lock, add up today's non-cancelled student orders for `ctx.email` and reject the new order if the total would exceed a new setting such as `STUDENT_DAILY_LIMIT`.
- **Staff approval before preparing.** Add a status `Needs Approval` to `CONFIG.STATUS` and `CONFIG.ACTIVE_STATUSES`. Start student orders in that status in `submitOrder()`. Add an **Approve** button in `ShopJs.html` → `actions()` that calls a new `approveOrder()` built like `startOrder()`, with an allowed-from list of `['Needs Approval']` and a new status of `Pending`.

### E. Privacy considerations (FERPA / district policy)

Order records (name, school email, room, what they ordered and when) about identifiable students are likely **education records** or at least student personal information. Follow your district's data-privacy policy. Suggestions:

- **Collect the minimum.** The app stores only the name, school email, items, room and payment type. Don't add fields for allergies, grades, parent info, phone numbers, or free-text notes from students.
- **Restrict access.**
  - Keep the Sheet shared with as few adults as possible.
  - Staff don't need Sheet access; the dashboard is enough.
  - Don't download or export the Sheet to personal devices.
- **Staff-only views.** Only listed staff see names and emails on the dashboard. Customers see only their own orders.
- **Retention.**
  - Set `ARCHIVE_AFTER_DAYS` (e.g. 30), and `DELETE_ARCHIVE_AFTER_DAYS` to your district's retention period (e.g. 365 or the end of the school year).
  - Run **Coffee Shop → Install maintenance triggers** so this happens automatically.
  - Clear old rows from the **Errors** tab periodically; they contain user emails.
- **Email copies.** Every email the app sends is also in the owner account's **Sent** folder. Apply the same retention there, e.g. a Gmail filter or Vault retention rule set by IT.
- **Money.** The app only records cash/card intent. Any student accounts or balances would bring more rules; talk to the business office first.
- **Transparency.** Tell students and families what is collected and why, e.g. a line on the ordering page or in the student handbook.
- **Vendor terms.** Google Sheets, Gmail and Apps Script under your district's Google Workspace for Education agreement are usually already approved. Confirm with your privacy office, and don't connect third-party add-ons to the Sheet.

### F. Testing changes safely

**Option 1: test URL (quick).**
1. In the Apps Script editor, choose **Deploy → Test deployments**. Copy the URL ending in **`/dev`**.
2. It always runs your **latest saved code** and works only for people with edit access to the script.
3. It uses the **same Sheet**, so real orders and real emails happen. Set `SEND_EMAILS` to `FALSE` while testing, and cancel your test orders afterwards.

**Option 2: full test copy (recommended for bigger changes, like enabling students).**
1. **File → Make a copy** of the Sheet. The script is copied too, and the copy has its own separate data.
2. In the copy: rename it "TEST – Coffee Shop", run `setup()`, set `SHOP_NAME` to "TEST Coffee Shop", and set `SEND_EMAILS` to `FALSE` (or leave it on and use only your own account).
3. Deploy the copy as its own web app (Deploy → New deployment). Share that URL only with testers. For students, use one or two test student accounts.
4. Make and test your changes there. Run through [TEST_CHECKLIST.md](TEST_CHECKLIST.md).
5. When happy, copy the changed code into the **live** project. Change Settings in the live Settings tab. Then **Deploy → Manage deployments → Edit → New version**.
6. If something goes wrong, go back: **Manage deployments → Edit → Version → choose the previous version → Deploy**.

**Tip:** before editing live code, keep a backup. Either **File → Make a copy** of the Sheet, or copy the code into a Google Doc with the date.

---

## Running the app day to day

| When | Task |
|---|---|
| **Every day** | Nothing special. If the dashboard shows the red "out of date" banner, check the Wi-Fi and tap **Reload dashboard**. |
| **Each week** | Glance at the **Errors** tab. A few rows are normal (e.g. a network blip); many rows of the same error mean something needs fixing. If `ADMIN_ALERT_EMAIL` is set, you're emailed anyway. |
| **Before a break or holiday** | Settings → `ORDERING_ENABLED` = `FALSE`. Set it back to `TRUE` when the shop reopens. |
| **Each term** | Update the menu and prices. Rename **Seasonal Treat** for the season. Remove staff who have left from the **Staff** tab. Run **Coffee Shop → Check setup**. |
| **Each year** | Confirm the owner account is still active. Review the retention settings (`ARCHIVE_AFTER_DAYS`, `DELETE_ARCHIVE_AFTER_DAYS`, `ERROR_LOG_RETENTION_DAYS`) against district policy. |
| **After any code change** | Test with the `/dev` link first, then publish a **new version** (see [Testing changes safely](#f-testing-changes-safely)). |

**Backups.** Google Sheets keeps a full version history: **File → Version history → See version history**. Use it to restore a tab someone damaged. For an extra copy, use **File → Make a copy** at the end of each term.

**Health check.** **Coffee Shop → Check setup (health check)** is safe to run at any time; it only reads. Run it after changing Settings or the Staff tab.

**Error alerts.** Put an address in `ADMIN_ALERT_EMAIL`. If the app hits an unexpected error, that address gets one email naming the function and error. Further errors within the hour are logged but don't send more email.

**App version.** The version number is at the bottom of the shop dashboard and in the health check. Mention it when reporting a problem.

**For developers.** Run `npm test` before publishing a change. It checks that every file parses and runs the simulated flows. It also fails if a new browser-callable server function is missing its `requireCustomer_()` / `requireStaff_()` / `requireOwner_()` check. GitHub runs the same checks on every push.

---

## Quick reference: "I want to…"

| I want to… | Do this |
|---|---|
| Close ordering today | Settings → `ORDERING_ENABLED` = `FALSE` |
| Mark an item sold out | Dashboard → **Menu** tab → switch off (or untick in the Menu sheet) |
| Change a price | Menu sheet → `Price` |
| Add a barista | Staff sheet → new row → **Coffee Shop → Clear settings cache** |
| Stop delivery | Settings → `DELIVERY_ENABLED` = `FALSE` |
| Change the email wording | `Email.gs` → edit text inside the quotes → publish a new version |
| See what went wrong | **Errors** tab, and Apps Script → **Executions** |
| Check the whole setup is correct | **Coffee Shop → Check setup (health check)** |
| Get emailed when something breaks | Settings → `ADMIN_ALERT_EMAIL` |
| Close for a holiday | Settings → `ORDERING_ENABLED` = `FALSE` (back to `TRUE` after) |
| Find last week's order | Dashboard → **History** → pick the date |
| Fix a mistakenly completed order | Dashboard → **History** → open it → **Reopen order** |
