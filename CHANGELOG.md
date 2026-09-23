# Changelog

The version number also appears at the bottom of the shop dashboard and in the health check.

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
