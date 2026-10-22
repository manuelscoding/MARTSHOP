# Cookie Cart: Deployment Guide

Allow about 20 minutes. You need a Google Workspace account on your school domain.

> **Which account should own the app?** The app runs as, and **sends email from**, the account that deploys it. If that person leaves and their account is suspended, the app stops working.
>
> If you can, use a shared role account such as `cookiecart@yourschool.org`, or keep the Sheet in a **Shared Drive**. Ask IT which they prefer.

---

## Step 1: Create the Google Sheet

1. Sign in as the owner account and go to <https://sheets.google.com>.
2. Create a blank spreadsheet named **Cookie Cart**.
3. Leave it empty. `setup()` creates every tab.

## Step 2: Add the script

1. In the Sheet, choose **Extensions → Apps Script**. A project opens with one file, `Code.gs`.
2. Rename the project (top left, "Untitled project") to **Cookie Cart**.
3. **Show the manifest:** click the gear (**Project Settings**) and tick **"Show 'appsscript.json' manifest file in editor"**. Go back to the **Editor** (`< >`).
4. **Create the files.** For each name below, click **+** next to *Files* and choose **Script** or **HTML**. Type the name **without** the extension. Delete the placeholder text and paste in the whole file from `cookie-cart/src/`.

   | Type | Names |
   |---|---|
   | Script | `Code` (already exists; replace its contents), `Config`, `Strings`, `Util`, `Auth`, `Products`, `Orders`, `DashboardData`, `Email`, `Setup` |
   | HTML | `Customer`, `CustomerJs`, `Dashboard`, `DashboardJs`, `Styles`, `Scripts`, `Message` |

   > Every file name must be unique in the project, even between Script and HTML files. The dashboard's server code is `DashboardData` (Script) and its page is `Dashboard` (HTML).

5. Open `appsscript.json` and replace its contents with `cookie-cart/src/appsscript.json`.
   - Change `"timeZone"` if your school is not on `America/New_York` (e.g. `America/Chicago`). Cutoff times and "today" use this zone.
6. **Save** (Ctrl/Cmd+S).

> Command line instead? `cookie-cart/src/` works with [clasp](https://github.com/google/clasp): `clasp clone <scriptId> --rootDir cookie-cart/src`, then `clasp push`.

## Step 3: Run `setup()` and approve permissions

1. In the toolbar's function dropdown choose **`setup`** and click **Run**.
2. Approve the authorization prompt:
   - **Review permissions** → choose the owner account.
   - On "Google hasn't verified this app", click **Advanced → Go to Cookie Cart (unsafe)**. This is normal for your own internal script.
   - Click **Allow**.

   | Permission | Why |
   |---|---|
   | See and edit **this** spreadsheet only | The Sheet is the database (`spreadsheets.currentonly`, not all your files) |
   | Send email as you | Confirmation, update, cancel, staff-alert and summary emails |
   | See your email address | Knowing who is ordering |
   | Manage triggers | Nightly clean-up and the daily summary email |
   | Display content in Sheets | The **Cookie Cart** menu |

3. The log ends with **"Setup complete."**
4. Reload the Sheet. You should see the tabs **Products, Orders, OrderHistory, Staff, Settings, Errors** and a **Cookie Cart** menu.

> If your Workspace admin blocks unverified apps, ask IT to allow this script. They may need the Script ID from **Project Settings**.

## Step 4: Configure (5 minutes)

1. **Settings** tab. Check at least these:

   | Key | Set to |
   |---|---|
   | `ALLOWED_DOMAINS` | Your domain, e.g. `district.org` (setup fills in the owner's domain) |
   | `ORDER_OPEN_TIME` / `ORDER_CUTOFF_TIME` | 24-hour times, e.g. `07:00` and `10:30` |
   | `ORDER_DAYS` | `Mon,Tue,Wed,Thu,Fri` |
   | `DELIVERY_WINDOWS` | Your windows, comma-separated, or blank to hide the choice |
   | `STAFF_NOTIFY_EMAILS` | Who is emailed when an order is changed after it left the kitchen |
   | `DAILY_SUMMARY_EMAILS` | Who gets the end-of-day summary |
   | `ADMIN_ALERT_EMAIL` | Who is told if the app hits an error (max once an hour) |
   | `SEND_EMAILS` | Leave `TRUE`. Set `FALSE` only while testing. |

2. **Products** tab: check the price and description. See *Add a new cookie* in the maintenance guide.
3. **Staff** tab: one row per person who runs the cart: `Email`, `Name`, `Role` (`Admin` or `Staff`). The owner is already there as Admin. **Only these people can open the dashboard.**

## Step 5: Deploy the web app

1. **Deploy → New deployment**. Click the gear next to *Select type* → **Web app**.
2. Description: `Cookie Cart 1.0.0`.
3. **Execute as: Me** (the owner). **Who has access: Anyone within *your domain***.
   - These match `appsscript.json`. Do **not** choose "Anyone": the app relies on Google telling it who is signed in.
4. **Deploy**. Copy the **Web app URL** (it ends in `/exec`).
5. Paste that URL into **Settings → `WEB_APP_URL`**, so email buttons always open the live app (never the `/dev` test link).

## Step 6: Share the links

| Who | Link |
|---|---|
| Teachers | `<your /exec URL>` |
| Cookie Cart staff | `<your /exec URL>?page=dashboard` (bookmark it on the cart's tablet) |

**Cookie Cart → Show web app links** prints both. Staff also see a "Staff dashboard" link at the top of the order page. Nobody else does.

## Step 7: Install the triggers

**Cookie Cart → Install triggers**. This creates:
- `nightlyMaintenance`, ~2 AM. Deletes old closed orders if `DELETE_CLOSED_ORDERS_AFTER_DAYS` > 0, and trims old error rows.
- `sendDailySummary`, ~4 PM. Emails the day's numbers to `DAILY_SUMMARY_EMAILS`, if there were orders.

Re-running it is safe; it replaces the existing ones.

## Step 8: Health check

**Cookie Cart → Check setup (health check)**. Fix anything marked ❌. It checks:
- every tab and column;
- the domain placeholder;
- staff with valid roles;
- at least one cookie available;
- valid times, days and room pattern;
- the `/exec` URL;
- emails and triggers.

## Step 9: Test, then reset for go-live

1. Work through [TEST_CHECKLIST.md](TEST_CHECKLIST.md) with a teacher account, a second teacher account and a staff tablet.
2. When you are happy, **Cookie Cart → Reset for go-live** and type `RESET`. It:
   - backs up Orders and OrderHistory to "Backup – …" tabs;
   - clears test orders, the change log and errors;
   - makes the next order **#1**.

   Products, Staff and Settings are untouched.

## Go-live checklist

- [ ] `ALLOWED_DOMAINS` is your real domain
- [ ] Staff tab: every cart worker, Role `Admin` or `Staff`
- [ ] Products: correct price, *Available* ticked
- [ ] Times, days and windows are right; time zone in `appsscript.json` is right
- [ ] `WEB_APP_URL` is the `/exec` link
- [ ] Triggers installed; health check shows no ❌
- [ ] Test checklist done on a phone and on the staff tablet
- [ ] Reset for go-live done
- [ ] Teachers emailed the link

## Updating the app later

Code changes are **not** live until you publish a new version:

1. Test with the `/dev` link first (see *Testing changes safely* in the maintenance guide).
2. **Deploy → Manage deployments** → select the live deployment → **pencil (Edit)** → *Version:* **New version** → **Deploy**.
3. Run `setup()` once if the CHANGELOG says so. It is always safe: it only adds missing tabs, columns and settings.

The `/exec` URL stays the same. **Do not** make a *New deployment* for updates: that creates a new URL and breaks saved links and email buttons.

## Quotas to know

| Limit | Workspace account | What it means here |
|---|---|---|
| Email recipients/day | ~1,500 | 1 confirmation per order, plus 1 per edit or cancel. If it runs out, orders still work: the page says the email wasn't sent and the error is logged. |
| Script runtime/execution | 6 min | Each request takes about 1 s. |
| Simultaneous executions | ~30 per user | Dashboard polling is cheap: if nothing changed, it does not read the Sheet. Keep 1–3 dashboards open, not 20. |
| Trigger runtime/day | 90 min–6 h | The two jobs take seconds. |
| Sheet size | 10 million cells | ~22 columns × 300 orders/day ≈ 1.2M cells a year. Turn on `DELETE_CLOSED_ORDERS_AFTER_DAYS` (e.g. 365) for multi-year use. |

Current numbers: <https://developers.google.com/apps-script/guides/services/quotas>.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Everyone gets "does not have access" | `ALLOWED_DOMAINS` must be just the domain (`district.org`, no `@`). Then **Cookie Cart → Clear cache**. |
| A staff member sees "only for Cookie Cart staff" | Their exact email must be in **Staff** with Role `Admin` or `Staff` (blank = no access). Student-looking addresses (starting with 3–9 digits) are never staff. |
| "We could not confirm your school Google account" | Not signed in, or signed in to several Google accounts at once. Use a browser profile signed in **only** to the school account. |
| Email Edit buttons open an old version or a `/dev` link | Set `WEB_APP_URL` to the `/exec` URL. |
| "This link is not valid" from an email | The order is delivered/cancelled, or an older email was used. Open **My orders** instead. A link opened while signed in as someone else says so explicitly. |
| Teachers can't add cookies | It is after `ORDER_CUTOFF_TIME` and `ALLOW_INCREASE_AFTER_CUTOFF` is FALSE (by design), or the daily limit is reached. |
| Changes in the Sheet don't show | They show within seconds. If not, **Cookie Cart → Clear cache**. |
| Dashboard shows a red "may be out of date" banner | The tablet lost Wi-Fi. It recovers by itself; or tap **Reload**. |
| "Something went wrong" when opening `?page=dashboard`, and the Errors tab says *No HTML file named Dashboard* | The `Dashboard` **HTML** file is missing. Versions before 1.0.1 named the server file `Dashboard` too, which Apps Script doesn't allow. Rename the **Script** file `Dashboard` to `DashboardData`, add an **HTML** file named `Dashboard` with the contents of `src/Dashboard.html`, then publish a new version. |
| Something else | Check the **Errors** tab and **Executions** in the Apps Script editor. |
