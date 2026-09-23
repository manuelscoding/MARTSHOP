# Test Checklist

Run this checklist:
- before going live
- after any code change (use the `/dev` test URL or a test copy; see the maintenance guide)
- after big Settings changes

**Accounts you'll need:**

| Account | What it is |
|---|---|
| **Owner** | The deploying account |
| **Barista** | Listed in the Staff tab |
| **Teacher A** and **Teacher B** | School accounts *not* in the Staff tab |
| **Outsider** | A personal Gmail account |
| **Student** | Only if testing student access |

Use separate browser profiles or incognito windows, so each tester is signed in to one account only.

Tip: set `ORDER_OPEN_TIME` and `ORDER_CLOSE_TIME` to blank while testing, so the clock doesn't block you.

> **Console tests (1.3–1.5, 2.2…):** in Chrome, open DevTools (F12) → **Console**. Change the context dropdown at the top of the console from "top" to the frame named **userHtmlFrame**. Then paste the command.

> **Developers:** `node tests/simulate.js` runs automated versions of most server-side checks below (marked 🤖). It uses stand-ins for the Google services, so it does **not** replace the manual test on the real deployment.

---

## 1. Unauthorized access

| # | Steps | Expected |
|---|---|---|
| 1.1 | Outsider opens the customer URL | Google blocks them, or the app shows **Access denied** / "could not confirm your account". No menu is shown. |
| 1.2 | Teacher A opens `…/exec?page=shop` | **Access denied: only for coffee shop staff.** |
| 1.3 🤖 | Teacher A opens the customer page, then in the browser console runs `google.script.run.withSuccessHandler(console.log).getActiveOrders('')` | `{ok:false, error:"This area is only for coffee shop staff."}` |
| 1.4 🤖 | Same as 1.3 with `completeOrder(1)`, `cancelOrder(1,'x')`, `markItemsUnavailable(1,['COKE'],false)`, `getHistory({})`, `setMenuItemAvailability('COKE',false)` | All refused with the staff-only message. No order changes. |
| 1.5 🤖 | Teacher A runs `google.script.run.setup()` or `archiveOldOrders({triggerUid:'x'})` in the console | Refused: "Only the owner…" |
| 1.6 | Barista opens `?page=shop` | Dashboard loads. The Barista's email is shown top right. |
| 1.7 | Remove the Barista from the Staff tab, then **Clear settings cache**, then reload | Access denied. Put them back afterwards. |
| 1.8 🤖 | Teacher A (console) runs `submitOrder({items:[{id:'ICEDCOFFEE',qty:1,price:0.01}],name:'A',delivery:false,payment:'Cash'})` | The order is priced at the **Menu** price, not $0.01. |

## 2. Duplicate submissions

| # | Steps | Expected |
|---|---|---|
| 2.1 | On the Review screen, double- or triple-click **Place order** quickly | The button changes to "Placing order…" and is disabled. Exactly **one** new row in Orders and one email. |
| 2.2 🤖 | Simulate a retry: in the console, call `submitOrder(payload)` twice with the **same** `requestId` | Both calls return the **same** order number, and the second has `duplicate: true`. Only one row. |
| 2.3 | Place an order, then click the browser Back button and reload | No duplicate order is created. |
| 2.4 | After the confirmation, click **Place another order** and submit | A new order with a new number (a new `requestId`). |

## 3. Concurrent orders

| # | Steps | Expected |
|---|---|---|
| 3.1 | Teacher A and Teacher B (two devices) fill in orders and press **Place order** at the same moment | Both succeed with **different, consecutive** order numbers. Two rows. |
| 3.2 🤖 | In the console on one device, run a loop of 5 `submitOrder` calls with different `requestId`s | Five unique, sequential numbers, with no gaps caused by collisions. |
| 3.3 | Two baristas, on two tablets, press **Complete** on the same order at the same time | One succeeds. The other sees "Order #N is now Completed…". The list refreshes. |
| 3.4 🤖 | Set `ARCHIVE_AFTER_DAYS` to 1. Change one completed order's `CompletedAt` to last week. Choose **Coffee Shop → Archive old orders now**. Then place an order | The new number is higher than every previous number. Numbers are **never reused**. |

## 4. Unavailable-item flow: "Continue without this item"

| # | Steps | Expected |
|---|---|---|
| 4.1 | Teacher A orders 2 × Iced Coffee + 1 × Muffins with delivery to room 214 | The dashboard shows it with **NEW**, **DELIVERY ROOM 214** and the correct total. |
| 4.2 🤖 | Barista: **Item unavailable** → tick Muffins → tick "Also turn these items off on the menu" → **Email customer** | The card turns amber: **Awaiting Customer Response**, Muffins struck through, "Waiting on customer: …". Muffins is off in the Menu tab. |
| 4.3 | Teacher A checks email | The subject is "action needed for order #N". The body says "Muffins is no longer available", lists the remaining items, and shows the **new total**. It has two buttons. |
| 4.4 | Teacher A clicks **Continue without this item** | A page with a summary and buttons (nothing changes yet). |
| 4.5 🤖 | Teacher A clicks **Continue without this item** on that page | "Thanks — your order is back in the queue". The new total is correct. An "updated" email arrives. |
| 4.6 | Dashboard | The order is back to **Pending**, marked **UPDATED**. The Muffins line is gone. The total equals the Iced Coffees only ($6). |
| 4.7 🤖 | Orders sheet | `Total` recalculated, `ResponseToken` blank. `StatusHistory` shows Pending → Awaiting → Pending. |

## 5. Unavailable-item flow: "Revise my order"

| # | Steps | Expected |
|---|---|---|
| 5.1 | Mark an item unavailable on a new order, then Teacher A clicks **Revise my order** in the email | The ordering app opens with the banner "Revising order #N…". The remaining items are pre-filled. The unavailable item is **not** on the menu. Delivery, room, payment and name are pre-filled. |
| 5.2 🤖 | Change the items (add a Hot Chocolate), go to Review, and **Submit updated order** | "Order updated!" with the **same order number** and a total recalculated from the Menu. Email "Order #N updated". |
| 5.3 | Dashboard / Orders sheet | Still **one** row for that number. Status Pending, **UPDATED** badge, new items and total. History timeline shows "Order revised by customer". |
| 5.4 | Mark **all** items unavailable, then the customer clicks **Continue** → **Cancel my order** | The order is cancelled and the customer sees "Order cancelled". |

## 6. Expired or reused response links

| # | Steps | Expected |
|---|---|---|
| 6.1 🤖 | After 4.5, click the email's **Continue** or **Revise** link again | "This link has already been used or is no longer needed. Order #N is currently "Pending"." Nothing changes. |
| 6.2 🤖 | Teacher **B** opens Teacher A's link (forward the email) | "This link belongs to a different account…" |
| 6.3 🤖 | Change one character of the `token=` in the URL | "This link is out of date…" or "not valid". |
| 6.4 🤖 | Set `RESPONSE_LINK_HOURS` = 1, flag an item, then in the Orders sheet set that row's `TokenExpiresAt` to yesterday. Click the link | "This link has expired. Please contact the coffee shop…" |
| 6.5 🤖 | Flag an item, then flag **another** item on the same order (**Mark more unavailable**). Use the **first** email's link | "This link is out of date…" The second email's link works. |
| 6.6 | Barista cancels an order that is awaiting a response, then the customer clicks the link | "already been used or is no longer needed… Cancelled". |
| 6.7 | Barista uses **Continue without item** on an awaiting order, then the customer clicks the link | Link rejected. The order stays as staff set it. |

## 7. Total recalculation and price integrity

| # | Steps | Expected |
|---|---|---|
| 7.1 🤖 | Order 2 × Iced Coffee ($3) + 1 × Muffins ($2) | Total **$8.00** everywhere: confirmation, email, dashboard, sheet. |
| 7.2 | While the customer is on the Review screen, change the Iced Coffee price in the Menu sheet to $4, then submit | The order is saved at **$4.00** (the server price). The confirmation shows the server total. |
| 7.3 🤖 | Continue without the Muffins | New total **$6.00** (calculated from the stored line prices). |
| 7.4 🤖 | Revise to 2 × Hot Chocolate ($3) + 1 × Coca Cola ($1) | New total **$7.00** (current Menu prices). |
| 7.5 🤖 | Quantity limits: type 0, 1.5, -1, or 11 in a quantity box, or send them via the console | The browser clamps them. The server rejects them with "Quantities must be whole numbers from 1 to 10." |
| 7.6 | Untick an item in Menu while it's in someone's cart, then submit | "X is not available right now…". The cart refreshes and the item is removed. |

## 8. Input validation and escaping

| # | Steps | Expected |
|---|---|---|
| 8.1 🤖 | Delivery = Yes with a blank room, `12345`, `<script>`, `DROP TABLE` | Rejected: "Please enter a valid room number…" |
| 8.2 🤖 | Room `library` (a named room) or `b12` | Accepted and stored uppercase (`LIBRARY`, `B12`). |
| 8.3 🤖 | Name `<img src=x onerror=alert(1)>` | No alert anywhere (customer page, dashboard, email). The angle brackets are stripped. |
| 8.4 🤖 | Name `=HYPERLINK("http://x","click")` | Stored in the Sheet as text (starts with `'`), **not** a live formula. |
| 8.5 | Cancel reason with HTML such as `<b>milk</b>` | The email shows plain text, not bold. |

## 9. Dashboard behavior

| # | Steps | Expected |
|---|---|---|
| 9.1 | Leave the dashboard open and place an order from another device | It appears within ~12 s with **NEW** and a blue glow. A chime plays if sound is on. The tab title shows the count. |
| 9.2 | Watch an order for 2 minutes | "Submitted just now" → "Submitted 1 min ago" → … updates without reloading. It turns red after 15 min. |
| 9.3 | Orders appear oldest first | Yes. |
| 9.4 | Turn off Wi-Fi for 30 s, then turn it back on | The header shows "Connection problem — retrying", then recovers to "Live" on its own. |
| 9.5 | Awaiting order older than `AWAITING_WARN_MINUTES` | The card and the waiting bar turn red: "consider calling them or cancelling". |
| 9.6 | **Cancel** → **Keep order** | Nothing changes. **Cancel** → **Cancel order** sends a cancellation email with the reason. |
| 9.7 | **Complete** | The card disappears. The order is in History as Completed with a completion time. **Reopen order** brings it back. |
| 9.8 | Tablet in portrait and landscape; phone | Cards reflow, buttons are easy to tap, and there is no sideways scrolling. |
| 9.9 | Keyboard only: Tab through the dashboard and dialogs; press Esc in a dialog | Focus is visible. Dialogs trap focus. Esc closes them. |

## 10. History

| # | Steps | Expected |
|---|---|---|
| 10.1 🤖 | History with no filters | Completed and cancelled orders, **newest first**. |
| 10.2 🤖 | Search `#12`, `12`, part of a name, part of an email, a date | The correct matches. |
| 10.3 🤖 | Expand an order | Items, notes, and a **timeline** of each status change with the time and who made it. |

## 11. Settings, hours and email

| # | Steps | Expected |
|---|---|---|
| 11.1 🤖 | `ORDERING_ENABLED` = `FALSE` (then clear the cache) | Customers see "Ordering is closed". Submitting via the console is refused. |
| 11.2 | Set `ORDER_CLOSE_TIME` to a time a minute from now, wait, then submit | "Ordering is closed right now. Hours: …" |
| 11.3 🤖 | `DELIVERY_ENABLED` = `FALSE` | "Pickup only" screen. The server rejects `delivery:true`. |
| 11.4 🤖 | Email failure (e.g. temporarily set `SEND_EMAILS` = `FALSE`, then mark an item unavailable) | The order still updates. The dashboard shows an **"Email not sent"** dialog telling staff to contact the customer. |
| 11.5 | Errors tab | Unexpected errors appear here with the time, function, message and user. Users only see friendly messages. |

## 12. Operations

| # | Steps | Expected |
|---|---|---|
| 12.1 🤖 | **Coffee Shop → Check setup** on a fresh install | Warnings for a blank `WEB_APP_URL` / `ADMIN_ALERT_EMAIL` and missing triggers. No ❌ once `ALLOWED_DOMAINS` is correct. |
| 12.2 🤖 | Put a bad value in `ORDER_CLOSE_TIME` (e.g. `2:30pm`) and `ORDER_DAYS` (e.g. `Funday`), then run the check | Both are reported as ❌ problems in plain language. |
| 12.3 🤖 | Set `ADMIN_ALERT_EMAIL`, then cause an unexpected error (e.g. temporarily rename the Menu tab and load the customer page) | Exactly **one** alert email arrives, even if the error repeats within the hour. Rename the tab back. |
| 12.4 | Disconnect the counter tablet's Wi-Fi for about a minute | A red "This list may be out of date" banner with a **Reload dashboard** button. It disappears on its own when Wi-Fi returns. |
| 12.5 | Try to type in the **Orders** tab | Google Sheets shows a warning that the tab is managed by the app. |
| 12.6 🤖 | **Coffee Shop → Archive old orders now** | Old closed orders move to Archive, and error rows older than `ERROR_LOG_RETENTION_DAYS` are removed. |

## 13. Students (only if enabling)

| # | Steps | Expected |
|---|---|---|
| 13.1 🤖 | A numeric student account (e.g. `1111111@district.org`), before enabling | Access denied (not treated as staff). |
| 13.1b 🤖 | Teacher accounts in each format: `firstname.lastname@`, `f.lastname@`, `flastname@` | Can order. Orders are marked `Staff`. |
| 13.2 🤖 | Set `STUDENT_ORDERING_ENABLED` = `TRUE` | The student can order. Pickup only (default). At most `STUDENT_MAX_ITEMS_PER_ORDER` items and 1 active order. The order's `CustomerType` is `Student`. |
| 13.3 🤖 | Add the student's email to the Staff tab, then open `?page=shop` | **Still denied.** Students can never be shop staff. |
| 13.4 | Dashboard | Student orders show a purple **STUDENT** badge. |
| 13.5 | `STUDENT_DELIVERY_ENABLED` = `TRUE`, `STUDENT_ALLOWED_ROOMS` = `LIBRARY` | Only LIBRARY is accepted for student delivery. |

---

**Sign-off:** Tester __________ Date __________ Deployment version __________
