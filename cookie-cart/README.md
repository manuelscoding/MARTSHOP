# Cookie Cart

Classroom cookie delivery for a high school. Teachers order cookies from a Google web app, staff bake and deliver them to the room, and everyone gets email updates. It runs entirely on Google Apps Script and a Google Sheet. There is no server and no cost.

It is built the same way as the Coffee Shop app in this repository (same security model, same Sheet-as-database approach, same tooling), but it is a **separate Sheet and a separate deployment**.

| Start here | |
|---|---|
| Install it | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Change it (new cookie in 2 minutes, prices, cutoffs, students) | [docs/MAINTENANCE.md](docs/MAINTENANCE.md) |
| Test it before launch | [docs/TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md) |
| What changed | [CHANGELOG.md](CHANGELOG.md) |

---

## Assumptions

These are the decisions made where the brief left room. Each one can be changed in the **Settings** tab, with no code edits, unless it says otherwise.

1. **Separate app.** Cookie Cart lives in `cookie-cart/` with its own Sheet and web-app URL. It does not share data with the Coffee Shop.
2. **Starting product.** One cookie: *Chocolate Chip Cookie, $1.00*. A second example (*Sugar Cookie*) is in the Products tab but unticked, so the page starts in the single-cookie layout.
3. **Who can order.**
   - Accounts on `ALLOWED_DOMAINS` (set to the owner's domain by setup) are teachers and staff.
   - Accounts whose part before the @ starts with 3–9 digits (for example `1111111@district.org`) are **students**. They cannot order unless `STUDENT_ORDERING_ENABLED` is TRUE, and they can **never** open the dashboard.
4. **Who can use the dashboard.** Only addresses in the **Staff** tab whose Role is exactly `Admin` or `Staff`. A blank or misspelled role means no access.
5. **Same-day ordering.**
   - Ordering is open Mon–Fri from `07:00` until the `10:30` cutoff, in the script's time zone (`America/New_York` in `appsscript.json`).
   - Delivery windows (Morning, Midday or Afternoon) are optional preferences. They are not separate cutoffs.
6. **Payment.** Cash or card on delivery. No money is taken online. "Charge to department account" is available but off (`ALLOW_ACCOUNT_CHARGE`).
7. **Edit rules (default).**
   - Teachers can edit until the order is **Delivered** (`EDITS_ALLOWED_UNTIL`).
   - Once it is **Out for Delivery**, they can only **add** cookies: no reducing and no cancelling (`NO_DECREASE_OR_CANCEL_FROM`).
   - After the daily cutoff, nobody can **add** cookies, but they can still reduce or cancel before dispatch (`ALLOW_INCREASE_AFTER_CUTOFF` = FALSE).
8. **Email links need two things.** "Edit my order" and "Cancel order" links carry a random 64-character token, *and* the person must be signed in as the account that placed the order. A forwarded link does not let someone else change the order.
   - The cancel link opens a confirmation page. It never cancels on click, because email scanners "click" links.
   - Links stop working once the order is delivered or cancelled.
9. **Prices are locked per order.** Changing a price in the Products tab affects new orders and newly added cookie types. Cookies already in an order keep the price the teacher saw.
10. **Daily limits** count every order placed today that is not cancelled. Cancelling frees the cookies.
11. **Extra Orders columns.** The specified columns are all present. Five more are added at the end: `DeliveryWindow`, `AllergyFlag`, `DispatchedItemsJSON` (what was in the bag when it left), `AckVersion` (last change staff acknowledged) and `CustomerType`. They power the delivery-window choice, allergy badge, "UPDATED AFTER DISPATCH" detection and student limits.
12. **Wording.** All wording lives in `src/Strings.gs`, ready for translation. Day and month names in dates come from Google's formatter.
13. **Order numbers** start at 1, are never reused (even if rows are deleted), and can be restarted once with *Cookie Cart → Reset for go-live* after testing.

## Features

**Teachers (order page)**
- One cookie type gives a large product card with a big −/+ stepper. Two or more switch automatically to a list with a stepper per cookie. No code change is needed.
- A running total, plus live "only N left today" and sold-out messages.
- Room number is required, validated, and remembered for next time. Class/period, special instructions, delivery window and an allergy flag are optional.
- Payment choice, a review step, and double-submit protection (the button locks and a request ID makes retries safe).
- A confirmation email with an **Edit my order** button and a **Cancel order** link.
- **My orders**: status, edit, cancel and reorder (re-checked against today's menu, prices and limits).
- Clear messages when ordering is closed, before opening, after the cutoff, on non-order days, or when a cookie is sold out.
- An edit shows *was → now* per cookie and the new total. The **updated** email shows old vs new quantities, old vs new total, and any room change.

**Staff (dashboard, `?page=dashboard`)**
- Active orders oldest first, each with a large room number, timer, items, total, payment, window, instructions and an allergy badge.
- Checks for changes every 12 s (`POLL_SECONDS`). The request is cheap when nothing changed. New orders are highlighted and announced to screen readers.
- One-tap status buttons: Start preparing, Out for delivery, Mark delivered, Cancel (asks for a reason, emails the teacher).
- **UPDATED AFTER DISPATCH**: a red box with an icon and text listing exactly what changed since the order left, for example *Sugar Cookie: Was 2 → Now 8 (+6)* and *Room B12 → 215*.
  - It stays until someone presses **Acknowledge change**. That is logged with their name and time.
  - Staff in `STAFF_NOTIFY_EMAILS` are also emailed.
  - Orders edited before dispatch get only a quiet "Edited" badge.
- Filters by status, date and room/teacher/order number.
- Prep summary per cookie: needed today, still to prepare, out for delivery, delivered. Low-stock warnings.
- **Delivery route**: out-for-delivery orders grouped by room in natural order (101, 102, 215, B12…), with a printable delivery sheet (with tick boxes) and printable bag labels (room, order #, teacher, cookies, allergy).
- **History**: delivered and cancelled orders with search, and the full change log per order (who, what, when, old vs new).
- **Day summary**: orders, cookies sold per type, revenue by payment method, cancellations, and edits after dispatch. Also emailed daily at ~4 PM to `DAILY_SUMMARY_EMAILS`.
- **Controls**: open or close ordering for the day, mark a cookie sold out, and set its daily limit.

**Quality**
- WCAG 2.1 AA:
  - Contrast-checked colours; status is never shown by colour alone (icon + text).
  - Labelled fields with error messages that move focus.
  - 48–64 px tap targets, keyboard tabs, live regions, and reduced-motion support.
- Settings, Products and Staff are cached. The cache clears automatically when those tabs are edited, or when staff use the controls.
- Every server function checks the caller's role. A static check (`tests/check.js`) fails the build if one does not.

## File map

```
cookie-cart/
  src/                    ← copy these into the Apps Script project (same file names)
    appsscript.json       manifest: V8, time zone, minimal permissions, domain-only web app
    Config.gs             sheet/column names, statuses, default Settings, settings cache
    Strings.gs            ALL user-facing wording (server, email, browser)
    Util.gs               errors, locking, sheet helpers, cache, rate limits, tokens, money, time
    Auth.gs               who is signed in (teacher/student/staff), ordering hours
    Products.gs           reads the Products tab (scales to any number of cookies), sold-out/limit controls
    Orders.gs             place, edit, cancel; edit rules; staff status changes; acknowledge
    Dashboard.gs          dashboard data, prep summary, history, change log, day summary, jobs
    Email.gs              confirmation / updated / cancelled / staff alert / summary emails
    Setup.gs              setup(), health check, triggers, Sheet menu, reset for go-live
    Code.gs               doGet routing (order page, dashboard, email links)
    Customer.html, CustomerJs.html    teacher page
    Dashboard.html, DashboardJs.html  staff dashboard
    Styles.html, Scripts.html         shared CSS and browser helpers
    Message.html          friendly "access denied / link not valid" page
  tests/
    check.js              static checks (syntax, access guard, no innerHTML, manifest)
    simulate.js           runs the server code against fake Google services: 23 flows
  docs/                   deployment, maintenance and test checklist
```

Developer checks (optional; run from the repository root with Node 18+): `npm run test:cookies`.
