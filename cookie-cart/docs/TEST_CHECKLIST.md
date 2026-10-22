# Cookie Cart: Test Checklist

Run this before launch and after any significant change. Use the `/dev` link or a test copy (see the maintenance guide). You need:
- **T1**: a teacher account;
- **T2**: a second teacher account;
- **S**: a staff account listed in the Staff tab;
- **ST** *(optional)*: a student account (starts with digits).

Items marked 🤖 are also covered by the automated simulation (`npm run test:cookies`). Check them by hand at least once on the real deployment anyway.

## 1. Access & security
- [ ] 🤖 An account outside the domain cannot open the app. Google blocks it, or it shows "does not have access".
- [ ] 🤖 T1 opening `?page=dashboard` sees "Access denied". No dashboard link shows on T1's order page.
- [ ] 🤖 S sees the **Staff dashboard** link and the dashboard opens.
- [ ] 🤖 A Staff-tab row with a blank or misspelled Role cannot open the dashboard.
- [ ] 🤖 ST cannot order (default) and can never open the dashboard, even if added to the Staff tab.
- [ ] 🤖 T2 opening T1's email Edit link sees "This order belongs to a different account".
- [ ] 🤖 A link with a changed token, or a made-up order number, shows the same "This link is not valid".
- [ ] 🤖 A name like `=HYPERLINK("http://x","y")` appears as plain text in the Sheet (starts with `'`).

## 2. Placing an order (T1, phone)
- [ ] With one cookie available: large card, big −/+ stepper (easy to tap), running total.
- [ ] Continue is disabled at 0 cookies.
- [ ] Details: Room is required, and an invalid room (`ROOFTOP`) shows an error and moves focus to the field. `library` is accepted and shown as `LIBRARY`.
- [ ] Optional class/period, instructions, delivery window and allergy flag work.
- [ ] Payment is required: Cash and Card shown; Account only if `ALLOW_ACCOUNT_CHARGE` is TRUE (then account name is required).
- [ ] Review shows everything with **Change** links.
- [ ] 🤖 Double-clicking **Place order** creates one order.
- [ ] 🤖 Confirmation shows the order number. The email arrives with the items, total, room, an **Edit my order** button and a **Cancel order** link.
- [ ] 🤖 Next order pre-fills the room.
- [ ] 🤖 Changing the price in the browser's dev tools does not change the total saved.

## 3. My orders, edit, cancel, reorder
- [ ] **My orders** lists the order with its status.
- [ ] 🤖 Edit from the email: quantities show "was N"; the review shows old vs new; saving bumps Version.
  - The **updated** email shows Was/Now and the old and new totals.
  - OrderHistory has an `Edited (v2): …` row.
- [ ] 🤖 Editing the same order in two tabs: the second save says it changed and reloads.
- [ ] 🤖 Cancel link opens a confirmation page (nothing cancelled yet). Confirming cancels, and a cancellation email arrives.
- [ ] Reorder copies a past order into a new one (re-priced; lowered if over today's limits, with a note).

## 4. Hours, cutoff, limits
- [ ] 🤖 Before `ORDER_OPEN_TIME`: "Ordering opens at 7:00 AM today."
- [ ] 🤖 After `ORDER_CUTOFF_TIME`: closed message with the reopen day. Existing orders can be reduced or cancelled but **not** increased.
- [ ] 🤖 On a weekend: "It reopens Monday at 7:00 AM."
- [ ] 🤖 Dashboard → Controls → Close ordering: teachers see "Ordering is closed right now". Open again works.
- [ ] 🤖 Daily limit 30: one order of 20 succeeds; a second order of 15 says "Only 10 … left today"; when it reaches 0 the card says sold out. Cancelling an order frees its cookies.
- [ ] 🤖 More than `MAX_QTY_PER_ORDER` is refused.

## 5. Dashboard (S, on the cart tablet)
- [ ] 🤖 Orders are oldest first. Room numbers are large. The timer shows the time since submitted and turns amber after 20 min.
- [ ] 🤖 A new order from T2 appears within ~12 s with a **NEW** highlight (and is announced by a screen reader).
- [ ] 🤖 Start preparing → Out for delivery → Mark delivered. The status badges show icon + text.
- [ ] Cancel asks for a reason. The teacher's email includes it.
- [ ] 🤖 Filters: status, date, and search by room / teacher / order #.
- [ ] 🤖 Prep summary per cookie: needed, still to prepare, out, delivered.
- [ ] Wi-Fi off for a minute: a red "may be out of date" banner appears. Wi-Fi on: it clears by itself.

## 6. Updated after dispatch (critical)
- [ ] 🤖 S marks T1's 24-cookie order **Out for delivery**. T1 edits it to 30 from the email link.
- [ ] 🤖 Within one poll the card shows a red **⚠ UPDATED AFTER DISPATCH** box: *Chocolate Chip Cookie: Was 24 → Now 30 (+6)*.
- [ ] 🤖 Changing the room shows *Room 214 → 215*.
- [ ] 🤖 `STAFF_NOTIFY_EMAILS` receives an alert email.
- [ ] 🤖 T1 cannot reduce or cancel it any more (clear message).
- [ ] 🤖 **Acknowledge change** removes the box, leaves a quiet *Edited* badge, and logs "Acknowledged change" with the staff name. A later edit is measured from the acknowledged amount.
- [ ] 🤖 An order edited **before** dispatch only gets the quiet *Edited* badge.

## 7. Printing
- [ ] 🤖 Delivery route groups out-for-delivery orders by room (101, 102, 215, B12…).
- [ ] 🤖 **Print delivery sheet**: only the sheet prints (no buttons/tabs). It has room, order #, teacher, cookies, notes, allergy and a tick box.
- [ ] 🤖 **Print bag labels**: two per row, with a big room number, order # · teacher, cookies and an allergy box.
- [ ] 🤖 **Label** on a single order card prints one label.
- [ ] Try one real print on the cart's printer.

## 8. History & reports
- [ ] 🤖 History finds delivered/cancelled orders by #, name, email, room and date. Expanding one shows its full change log.
- [ ] 🤖 Day summary: orders, cookies per type, revenue by payment, cancellations, edits after dispatch.
- [ ] 🤖 With `DAILY_SUMMARY_EMAILS` set and triggers installed, the summary email arrives at ~4 PM.

## 9. A second cookie
- [ ] 🤖 Tick **Sugar Cookie** Available. The order page switches to the multi-cookie list without any code change.
- [ ] 🤖 Prep summary, labels and the day summary show both cookies.
- [ ] 🤖 Raising a price doesn't change existing orders.

## 10. Accessibility (WCAG 2.1 AA)
- [ ] The whole order can be placed with the keyboard only (Tab, Space/Enter, arrow keys on tabs). The focus outline is always visible.
- [ ] Screen reader (VoiceOver/NVDA/TalkBack):
  - fields have labels;
  - errors are announced;
  - the running total and new dashboard orders are announced.
- [ ] Zoom to 200%: nothing is cut off. On a phone there is no sideways scrolling.
- [ ] With "Reduce motion" turned on, there are no animations.
- [ ] Status and alerts are understandable without colour (icon + text).

## 11. Admin
- [ ] 🤖 **Check setup** shows no ❌.
- [ ] 🤖 **Reset for go-live** asks you to type RESET, makes backups, and the next order is #1.
- [ ] 🤖 With the email quota at 0, an order still saves and the page says the email was not sent.
