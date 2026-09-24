# Deployment Guide

Allow about 20 minutes. You need a Google Workspace account on your school domain.

> **Which account should own the app?** The app runs as, and **sends email from**, the account that deploys it. If that person leaves and their account is suspended, the app stops working.
>
> If you can, use a shared role account such as `coffeeshop@yourschool.org`, or keep the Sheet in a **Shared Drive**. Ask IT which they prefer.

---

## Step 1: Create the Google Sheet

1. Sign in as the owner account and go to <https://sheets.google.com>.
2. Create a blank spreadsheet. Name it something like **Coffee Shop Orders**.
3. Leave it empty. `setup()` creates all the tabs.

## Step 2: Add the script

1. In the Sheet, choose **Extensions → Apps Script**. A new tab opens with a project that has one file, `Code.gs`.
2. Rename the project (top left, "Untitled project") to **Coffee Shop**.
3. **Show the manifest:** click the gear icon (**Project Settings**) and tick **"Show 'appsscript.json' manifest file in editor"**. Go back to the **Editor** (`< >` icon).
4. **Create the files.** For each file in the table below, click **+** next to "Files" and choose **Script** or **HTML**. Type the name **without** the extension; the editor adds `.gs` or `.html` itself. Then delete the placeholder text and paste in the full contents of the file from the `src/` folder.

   | Type | Names |
   |---|---|
   | Script | `Code` (already exists; replace its contents), `Config`, `Util`, `Auth`, `Menu`, `Orders`, `Email`, `Setup` |
   | HTML | `Customer`, `CustomerJs`, `Shop`, `ShopJs`, `Styles`, `Scripts`, `Message` |

5. Open `appsscript.json` and replace its contents with `src/appsscript.json`.
   - Change `"timeZone"` to your school's time zone if it isn't `America/New_York` (for example `America/Chicago`, `America/Los_Angeles`).
6. Click **Save** (disk icon, or Ctrl/Cmd+S).

> Using the command line instead? `src/` is laid out for [clasp](https://github.com/google/clasp): `clasp clone <scriptId> --rootDir src`, then `clasp push`.

## Step 3: Run `setup()` and approve permissions

1. In the editor toolbar's function dropdown, choose **`setup`**, then click **Run**.
2. Google asks for authorization:
   - Click **Review permissions** and choose the owner account.
   - If you see "Google hasn't verified this app", click **Advanced → Go to Coffee Shop (unsafe)**. This is normal for your own internal script.
   - Click **Allow**.

   What each permission is for:

   | Permission | Why |
   |---|---|
   | See, edit, create spreadsheets | The Sheet is the database |
   | Send email as you | Order emails |
   | See your email address | Identifying who is using the app |
   | Manage triggers | Optional nightly archiving |
   | Display content in Sheets | The "Coffee Shop" menu |

3. The execution log should end with **"Setup complete."**
4. Go back to the Sheet and reload it. You should see the tabs **Menu, Orders, Staff, Settings, Errors** and a **Coffee Shop** menu in the menu bar.

> If your Workspace admin blocks Apps Script or unverified apps, ask IT to allow this script. You may need to give them the project's Script ID, found under **Project Settings**.

## Step 4: Configure

1. **Settings** tab. Check these values at least:
   - `SHOP_NAME`
   - `ALLOWED_DOMAINS`: should be your domain, e.g. `district.org`
   - `STUDENT_EMAIL_PATTERN`: leave as `^[0-9]{3,9}`, so numeric accounts like `1111111@district.org` are treated as students. They are refused until `STUDENT_ORDERING_ENABLED` is `TRUE`.
   - `ORDER_DAYS`, `ORDER_OPEN_TIME`, `ORDER_CLOSE_TIME`: blank means no limit
   - `REPLY_TO_EMAIL` (optional)
   - `FAVICON_URL` / `SHOP_FAVICON_URL`: the browser-tab icons. They default to ☕ and 📋; replace them with an `https://` link to your school logo if you like.
   - `ADMIN_ALERT_EMAIL`: the person (or IT inbox) to email if the app hits an unexpected error. At most one alert per hour. **Recommended.**
   - While testing, set `SEND_EMAILS` to `FALSE` if you don't want real emails to go out.
2. **Menu** tab. It already holds the shop's menu (Drinks and Snacks, with prices, icons and tags). Check the prices, and rename **Seasonal Treat** for the current season if you like. Each row has a short unique `ItemID`, `Name`, `Price`, `Available` checkbox, `Category`, `SortOrder`, and optional `Icon` (an emoji) and `Tag` (e.g. `Hot`).
3. **Staff** tab. Add one row per shop staff member: `Email`, `Name`, `Role`. **Role must be `Admin` or `Staff`.** A blank or different Role gives no dashboard access.
4. Choose **Coffee Shop → Clear settings cache** so the changes apply immediately. Otherwise they apply within 60 seconds.

## Step 5: Deploy the web app

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me (owner@yourschool.org)**
   - **Who has access:** **Anyone within yourschool.org**
4. Click **Deploy**. Authorize again if asked.
5. Copy the **Web app URL**. It ends in `/exec`.
6. Paste that URL into the **Settings** sheet as `WEB_APP_URL`. Email links then always point at the live version.

## Step 6: Share the links

| Who | Link |
|---|---|
| Teachers and staff (customers) | `https://script.google.com/a/macros/yourschool.org/s/XXXX/exec` |
| Coffee shop staff (dashboard) | the same URL + `?page=shop` |

You can also get both links from **Coffee Shop → Show web app links** in the Sheet.

- **On the counter tablet:** open the `?page=shop` link, sign in as a staff member listed in the Staff sheet, and add it to the home screen. Tap **Sound: off** to turn on the new-order chime (a tap is required before browsers allow sound).
- **For customers:** post the ordering link in the staff newsletter or bulletin, on a QR code at the counter, or as a Google Sites button.

## Step 7: Maintenance triggers

Choose **Coffee Shop → Install maintenance triggers**. This adds two jobs:

- **Nightly clean-up (about 2 AM).**
  - Completed and cancelled orders older than `ARCHIVE_AFTER_DAYS` move to an **Archive** tab. This keeps the dashboard fast.
  - Rows in the **Errors** tab older than `ERROR_LOG_RETENTION_DAYS` are deleted, because they contain user emails.
- **Stale-order check every 15 minutes.** It does nothing unless `AUTO_CANCEL_AWAITING_MINUTES` is above 0.

## Step 8: Run the health check

Choose **Coffee Shop → Check setup (health check)**. It changes nothing; it only reports.

- **❌ problems** would break the app for users. Examples: the placeholder domain is still set, nobody is in the Staff tab, no menu items are available, a time is typed wrongly, or the app isn't deployed.
- **⚠️ warnings** are worth fixing. Examples: `WEB_APP_URL` or `ADMIN_ALERT_EMAIL` is blank, the maintenance triggers aren't installed, or a staff email looks like a student account.

Fix everything marked ❌, then run it again until it says **✅ No blocking problems found**.

## Step 9: Test before announcing

Work through [TEST_CHECKLIST.md](TEST_CHECKLIST.md). At minimum:

1. place an order
2. see it on the dashboard
3. mark an item unavailable
4. respond from the email
5. complete the order
6. find it in History

## Go-live checklist

Tick every line before announcing the app.

- [ ] The app is owned and deployed by a long-lived account (ideally a shared shop or IT account), not a personal account that might leave.
- [ ] `appsscript.json` → `timeZone` matches your school. The health check shows the time zone it's using.
- [ ] **Coffee Shop → Check setup** shows ✅ with no ❌ problems.
- [ ] `WEB_APP_URL` is the `/exec` link, `ADMIN_ALERT_EMAIL` is set, and `SEND_EMAILS` is `TRUE`.
- [ ] The maintenance triggers are installed.
- [ ] The test checklist has been run with one staff account, one teacher account and one student account (`1111111@…`). The student is refused until you choose to enable students.
- [ ] Test orders are cancelled. Optionally delete the test rows from the Orders tab **before** launch (never after).
- [ ] **Counter tablet:**
  - plugged in, with the screen set never to sleep while charging
  - signed in to **only** the staff account
  - the dashboard link added to the home screen
  - sound turned on
- [ ] Only the owner and one backup person have edit access to the Sheet.
- [ ] Staff know how to handle "item unavailable" and where History is.

---

## Updating the app later (important)

Editing the code does **not** change what users see until you publish a new version:

1. Test the change first with the test URL (see *Testing changes safely* in the maintenance guide).
2. Choose **Deploy → Manage deployments**, select the live deployment and click the **pencil (Edit)**.
3. Under **Version**, choose **New version** and click **Deploy**.

The `/exec` URL stays the same. **Do not** create a *New deployment* for updates: that makes a new URL and breaks the links people have saved.

## Quotas to know

| Limit | Google Workspace account | Notes |
|---|---|---|
| Email recipients per day (MailApp) | ~1,500 | Each order sends 1–3 emails. If the limit is reached, orders still work: the failure is logged to **Errors** and staff see a warning. Free Gmail accounts get only 100. |
| Script runtime per execution | 6 minutes | Each request here takes about 1 second. |
| Simultaneous executions | ~30 per user | Dashboard polling is lightweight: when nothing has changed, the server skips reading the Sheet. |
| Triggers total runtime | 6 hr/day | Maintenance triggers use seconds per day. |

Google publishes the current numbers at <https://developers.google.com/apps-script/guides/services/quotas>.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Sheet 'Orders' is missing" / "Run setup()" | Run `setup()` again. It is safe and never deletes data. |
| Everyone gets "Access denied" | Check `ALLOWED_DOMAINS` in Settings (no `@`, just `yourschool.org`), then **Clear settings cache**. |
| A staff member can't open the dashboard | Their exact email must be in the **Staff** tab, with **Role `Admin` or `Staff`**, on an allowed domain, and must not look like a student account. Then clear the cache. **Check setup** names rows with a missing or wrong Role. |
| "We could not confirm your school Google account" | The visitor isn't signed in, or is signed in with an account outside your organization. Have them sign out of other accounts or use a separate browser profile. |
| Email links point at `/dev` or are missing | Set `WEB_APP_URL` in Settings to the `/exec` URL. |
| "Your sign-in session may have expired, or you are signed in to more than one Google account" | This is a known Google limitation. The app can fail when a browser is signed in to several Google accounts at once (e.g. school + personal). Use a Chrome profile or window signed in **only** to the school account. |
| Dashboard shows a red "This list may be out of date" banner | The tablet couldn't reach Google several times in a row. Check the Wi-Fi, then tap **Reload dashboard**. The banner clears itself once the connection returns. |
| Unsure whether everything is configured | Run **Coffee Shop → Check setup (health check)**. |
| Something else | Look at the **Errors** tab (newest rows at the bottom), and at **Executions** in the Apps Script editor. |
