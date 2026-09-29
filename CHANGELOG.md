# Changelog

The version number also appears at the bottom of the shop dashboard and in the health check.

## 1.4.0

- **Remove on the menu:** every item in the order has a **Remove** button on its menu card. Tapping it takes the item out completely, including all its drink options.
- **"Your order" list:** tapping the bottom bar (**View / change order**) opens a list of everything in the order. Each line has − / + and **Remove**, plus **Remove everything**.
- **Checkout (Review) page:** each line can be changed or removed right there. Drinks with different options are separate lines, so "Hot Coffee — Honey" can be removed without touching "Hot Coffee — Sugar". Removing the last item returns to the menu.
- **Undo:** every removal shows a message with **Undo** for 8 seconds.

## 1.3.1

- **Fix:** on a Sheet set up before 1.3.0, the drink-options popup never appeared (Continue went straight to Delivery) until `setup()` was run again.
  - Missing Options tab: the built-in options are used.
  - Missing Customizable column: Hot Coffee, Hot Tea, Iced Coffee and Hot Chocolate count as customizable, matched by ID **or** name.
- **Setup:** when it adds the Customizable column, `setup()` now also ticks the standard drinks by name if their IDs differ.
- **Health check:** it now warns when no item is Customizable, or when the Options tab or Customizable column is missing.
- **Version display:** the version is shown at the bottom of the ordering page, so testers can confirm they're on the latest deployment.

## 1.3.0

**Pickup limits**
- **Pickup switch:** a **Pickup orders** on/off switch on the dashboard. When off, customers can only choose delivery. All tablets update within seconds.
- **Automatic limit:** `MAX_ACTIVE_PICKUPS` pauses pickup while that many pickup orders are waiting, and reopens it as they are completed.

**Drink options**
- **Customize popup:** when the cart has a customizable drink (Hot Coffee, Hot Tea, Iced Coffee, Hot Chocolate), **Continue** opens a popup to choose Sweeteners (Sugar, Splenda, Honey), Creamer (Half and Half, Vanilla, Caramel) and Syrups (Vanilla, Vanilla Sugar Free, Caramel, Caramel Sugar Free, Brown Sugar Cinnamon).
- **Per-cup choices:** each cup is set separately, with **Same for all cups**.
- **Sheets:** a new **Options** tab (with optional per-option price) and a Menu **Customizable** column.
- **Everywhere:** options show on the review screen, confirmation, emails, dashboard and History, and a revised order reopens with its options pre-selected.
- **Running out:** staff can switch individual options off on the dashboard's Menu tab.

**Security review and hardening**
- **Lookups:** browser-supplied IDs can no longer match built-in object properties.
- **Trigger jobs:** they require Google's `AuthMode` object, which can't be forged.
- **Email-link errors:** they no longer reveal whether an order number exists.
- **Least privilege:** access to the current spreadsheet only (re-authorize once after upgrading).
- **Rate limits:** per-user limits on orders, email-link actions and page loads.
- **Build checks:** new checks for `innerHTML`/`eval`, unescaped template output and permission creep.
- **Tests:** 34 simulated test groups.

## 1.2.0

- **Browser-tab icons:** ☕ for the ordering page and 📋 for the shop dashboard, so staff can tell the tabs apart. Both come from Google's emoji library.
- **Custom icons:** new settings `FAVICON_URL` and `SHOP_FAVICON_URL` let you use your own icon (e.g. the school logo). They're added to existing Settings tabs by **Run setup**.
- **Safe with bad links:** an invalid or broken icon link never stops a page from loading, and **Check setup** warns about it.

## 1.1.1

- **Security fix:** a Staff-tab row with a **blank or unrecognised Role** used to get dashboard access. Now only `Admin` or `Staff` do (ignoring case and spaces). Everything else gets no access: the dashboard page, the "Shop dashboard" link and all 11 staff functions.
- **Staff tab Role dropdown:** it now rejects other values.
- **Health check:** it names Staff rows whose Role gives no access.
- **Tests:** a new test checks every Role variant against the page, the link and each staff function.

## 1.1.0

**Production hardening**
- **Health check:** **Coffee Shop → Check setup** reports launch-breaking mistakes in plain language, such as the placeholder domain, an empty Staff tab, no available items, badly typed times or days, a missing deployment or `/exec` link, and missing triggers.
- **Error alerts:** `ADMIN_ALERT_EMAIL` gets one email when the app hits an unexpected error, at most once per hour.
- **Error-log clean-up:** Errors-tab rows older than `ERROR_LOG_RETENTION_DAYS` (default 90) are deleted during nightly archiving, because they contain user emails.
- **Dashboard offline banner:** after repeated failed refreshes, the dashboard shows an unmissable banner with a **Reload** button. It clears itself when the connection returns.
- **Quieter after hours:** the dashboard checks once a minute when the shop is closed and no orders are active.
- **Cache resilience:** failures in Google's cache service fall back to reading the Sheet instead of failing the request.
- **Hand-edit warnings:** the Orders, Errors and Archive tabs warn anyone who tries to edit them by hand.
- **Fixes:**
  - Archiving now works if someone empties the Archive tab by hand.
  - The dashboard's "orders changed" marker can no longer miss two changes made in the same millisecond.
- **Clearer sign-in error:** the message now explains the multiple-Google-accounts limitation.
- **Developer checks:** `npm test` (static checks, a security guard for access checks, and 27 simulated flow groups), run by GitHub Actions on every push.
- **Docs:** go-live checklist, day-to-day operations routine, and more troubleshooting.

**Menu and design**
- **Real menu:** the shop's 12 drinks and 8 snacks, with an `Icon` (emoji) and `Tag` for each item.
- **Customer menu redesign:**
  - a greeting banner showing whether the shop is open
  - category chips and search
  - item cards with an Add button that turns into − / +
  - a cart bar showing the items picked
- **Dashboard icons:** item icons on the dashboard and in the Menu tab.

**Students on a shared domain**
- `STUDENT_EMAIL_PATTERN` (default: starts with 3–9 digits) marks accounts like `1111111@district.org` as students on the shared domain. Students are refused until enabled and can never open the dashboard.

## 1.0.0
- First release: customer ordering, staff dashboard, unavailable-item emails with secure links, history, settings, setup, and documentation.
