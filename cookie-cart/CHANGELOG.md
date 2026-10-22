# Cookie Cart changelog

## 1.0.1

- **Fix: the staff dashboard failed to open** ("Something went wrong"). The server file `Dashboard.gs` had the same name as the page `Dashboard.html`, and Apps Script requires unique file names, so the page could not be added. The server file is now **`DashboardData`**. To upgrade:
  1. Rename the Script file `Dashboard` to `DashboardData` (or delete it and paste `src/DashboardData.gs` into a new Script file named `DashboardData`).
  2. Make sure an HTML file named `Dashboard` exists with the contents of `src/Dashboard.html`.
  3. Replace `Config.gs` (version number).
  4. Publish a new version (Deploy → Manage deployments → Edit → New version).
- The developer check now fails if two files share a name.

## 1.0.0

First release.

- **Teacher order page**
  - Single-cookie layout with a big stepper. It switches automatically to a multi-cookie list when more products are Available.
  - Required room (remembered); optional class, instructions, delivery window and allergy flag.
  - Cash/Card (optional department account), a review step, and double-submit protection.
- **Emails**: confirmation with an Edit button (token + owner check) and a Cancel link that asks to confirm first.
- **Edits and cancels**
  - Updated email showing was/now per cookie and old/new totals.
  - Cancellation email.
  - Settings-driven edit rules (edit until, no decrease/cancel from, increases after cutoff).
- **My orders** with edit, cancel and reorder.
- **Staff dashboard**
  - Live orders with large room numbers, timers and NEW highlight, polling every 12 s.
  - Status buttons.
  - UPDATED AFTER DISPATCH alert with exact diff, room change, Acknowledge (logged) and staff email.
  - Quiet Edited badge; filters and search; prep summary.
- **Delivery route by room** with a printable delivery sheet and bag labels.
- **History** with the full change log (OrderHistory). Day summary on demand and by email at ~4 PM.
- **Staff controls**: open/close ordering, sold out, daily limit.
- **Guards**: daily limits, per-order limits, opening/cutoff times, order days.
- **Students** detected by email pattern. They are blocked by default, have their own limit, and are never staff.
- **Health check**, Reset for go-live, nightly retention, and admin error alerts.
- **Quality**: WCAG 2.1 AA, all wording in `Strings.gs`, reduced-motion support, and CacheService with automatic invalidation.
