# Coffee Shop Ordering System (Google Apps Script)

A web app for a school coffee shop run by staff. It uses a Google Sheet as the database.

- **Customers** (teachers and staff, and later students) order from the menu. They choose delivery (to a room) or pickup, and cash or card. They get an order number and a confirmation email.
- **Shop staff** use a live dashboard on a tablet at the counter. From it they start, complete or cancel orders, handle items that have run out, search history, and turn menu items on or off.

## Documentation

| Document | For |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | First-time install: Sheet, script, `setup()`, deploying, sharing links |
| [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | Maintenance & expansion guide for non-developers, including **expanding to students** |
| [docs/TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md) | What to test before going live and after every change |

## Assumptions

1. **Placeholders.** `yourschool.org` stands in for your domain. `setup()` fills in `ALLOWED_DOMAINS` from the deploying account's own domain. `setup()` loads the shop's **real starting menu** (12 drinks, 8 snacks, with icons and tags), which you keep up to date in the **Menu** sheet. Shop staff are listed in the **Staff** sheet, which `setup()` seeds with the script owner as `Admin`.
2. **One deployment serves both apps.**
   - `…/exec` is the customer app.
   - `…/exec?page=shop` is the staff dashboard.
   - `…/exec?page=respond&…` is the target of the links in "item unavailable" emails.
3. **Container-bound script.** The script is created from the Sheet (Extensions → Apps Script). It is deployed "Execute as: Me", so staff and customers do **not** need access to the Sheet. Only the owner/admin should be able to edit it.
4. **Customer name.** Apps Script cannot read a user's display name without extra Admin APIs. So the app suggests a name from the email address (`jane.doe@` becomes "Jane Doe"), and the customer can edit it. The **email is always taken from the signed-in Google account**, never from the form.
5. **Email links never change an order just by being opened.** Some school email security scanners pre-open links. So "Continue without this item" opens a page with a confirm button. The links:
   - can be used **only once**
   - **expire** after `RESPONSE_LINK_HOURS` (default 24)
   - work only for the **signed-in customer who placed the order**
   - stop working when staff flag another item (a new link is issued)
6. **Which prices are used.**
   - **Continue without item:** the remaining items keep the price they had when the order was placed. The server recalculates the total from those stored prices.
   - **Revise my order:** the new items are priced from the **current** Menu sheet.
   - A revised order keeps its original order number and its place in the queue (the original timestamp).
7. **Extra Orders columns.** The Orders sheet has every column you specified plus four more: `TokenExpiresAt`, `CompletedAt`, `StatusHistory` (every status change, with a timestamp and who made it) and `CustomerType` (Staff/Student).
8. **Extras beyond the spec:**
   - a **Menu** tab where staff turn items on or off
   - a **Reopen** button for orders completed by mistake
   - "Cancel my order" on the customer response page
   - optional ordering hours, a per-customer limit on active orders, and an optional "ready" email
   - optional auto-cancel of orders where the customer never responded
   - optional archiving of old orders
9. **Students and teachers share one domain.** On `district.org`, accounts whose part before the @ starts with 3–9 digits (e.g. `1111111@`) are **students**. Name-style accounts (`firstname.lastname@`, `f.lastname@`, `flastname@`) are **teachers/staff**. This is controlled by the `STUDENT_EMAIL_PATTERN` setting. Students are denied until `STUDENT_ORDERING_ENABLED` is `TRUE`, and they can never open the dashboard.
10. **Accounts outside your domain.** `Session.getActiveUser()` returns the visitor's email only when they are in the same Google Workspace organization as the script owner. See the student section of the maintenance guide.

## Files (`src/`)

| File | What it contains |
|---|---|
| `appsscript.json` | Manifest: V8 runtime, time zone, web-app access (`DOMAIN`, execute as owner), OAuth scopes |
| `Config.gs` | `CONFIG` (sheet names, headers, statuses) and `DEFAULT_SETTINGS` (every Settings key with its default and description) |
| `Util.gs` | Error handling (`api_`, `AppError`, `logError_`), locking (`withLock_`), sheet helpers, sanitizing |
| `Auth.gs` | Who the user is (`getUserContext_`), `requireCustomer_`, `requireStaff_`, per-user rules, ordering hours |
| `Menu.gs` | Menu reading, customer bootstrap, staff menu on/off |
| `Orders.gs` | Placing orders, staff actions, unavailable-item flow, customer responses, history, archiving |
| `Email.gs` | All customer emails (with quota check) |
| `Setup.gs` | `setup()`, `checkSetup()` (health check), `installTriggers()`, `showLinks()`, the Sheet's "Coffee Shop" menu |
| `Code.gs` | `doGet()` routing, `include()` for HTML partials |
| `Customer.html`, `CustomerJs.html` | Customer app |
| `Shop.html`, `ShopJs.html` | Staff dashboard |
| `Styles.html`, `Scripts.html` | Shared CSS and browser helpers |
| `Message.html` | Access-denied / error page |

### Developer checks (optional, not needed to run the app)

Run `npm test` (Node.js 18+; no packages to install). It runs two checks:

| Check | What it does |
|---|---|
| `tests/check.js` | Confirms every file parses and the manifest keeps its security settings. It is also a **security guard**: it fails if any browser-callable server function lacks an access check. |
| `tests/simulate.js` | Runs the real server code against in-memory stand-ins for the Google services. It covers 28 groups of flows: ordering, duplicates, concurrency, unavailable items, links, students, the health check, archiving, cache failures and more. |

`.github/workflows/test.yml` runs `npm test` on every push and pull request. [CHANGELOG.md](CHANGELOG.md) lists what changed in each version.

## Security summary

- **Access checks.** Every browser-callable function starts with `requireCustomer_()` or `requireStaff_()`. These read `Session.getActiveUser()`, check the email domain and check the Staff sheet. Admin functions (`setup`, `archiveOldOrders`…) refuse to run for anyone except the owner or a real installed trigger.
- **Prices.** Prices and totals are calculated only on the server, from the Menu sheet.
- **Locking.** Order creation and all status changes run inside `LockService`. Order numbers come from a counter that never goes backwards, even after archiving.
- **Input checks.**
  - Quantities must be whole numbers within the limits.
  - Rooms must match a pattern or an approved list.
  - Names and notes are cleaned.
  - Text starting with `=`/`+`/`-`/`@` is neutralised before it reaches the Sheet.
- **Safe display.** The browser shows all text with `textContent`, and emails escape HTML.
- **Double-submit protection.** The button is disabled while submitting. A per-attempt `requestId` also makes a retry return the same order instead of creating a duplicate.
- **Errors.** Unexpected errors are logged to the **Errors** sheet, and `ADMIN_ALERT_EMAIL` gets at most one alert email per hour. Users only ever see a friendly message.
- **Guarded against regressions.** `tests/check.js` fails the build if a new browser-callable function forgets its access check.

## Production operations

| What | Detail |
|---|---|
| **Health check** | **Coffee Shop → Check setup** finds launch-breaking configuration mistakes before users do. |
| **Monitoring** | Errors are logged to the **Errors** tab. Admin alert emails are rate-limited. |
| **Dashboard reliability** | The dashboard shows an unmissable banner if it goes offline, and recovers by itself when the connection returns. It checks less often outside ordering hours. |
| **Data hygiene** | Nightly archiving, deletion of old archived orders (optional) and old error-log rows. The Orders, Errors and Archive tabs warn anyone who edits them by hand. |
| **Resilience** | Email failures never undo an order; staff are told to contact the customer. Cache failures fall back to reading the Sheet. Busy moments queue behind a lock instead of corrupting data. |
