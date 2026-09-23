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
   - While testing, set `SEND_EMAILS` to `FALSE` if you don't want real emails to go out.
2. **Menu** tab. It already holds the shop's menu (Drinks and Snacks, with prices, icons and tags). Check the prices, and rename **Seasonal Treat** for the current season if you like. Each row has a short unique `ItemID`, `Name`, `Price`, `Available` checkbox, `Category`, `SortOrder`, and optional `Icon` (an emoji) and `Tag` (e.g. `Hot`).
3. **Staff** tab. Add one row per shop staff member: `Email`, `Name`, `Role` (`Admin` or `Staff`).
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

## Step 7 (optional): Maintenance triggers

Choose **Coffee Shop → Install maintenance triggers**. This adds two jobs:

- **Nightly archiving.** Completed and cancelled orders older than `ARCHIVE_AFTER_DAYS` move to an **Archive** tab. This keeps the dashboard fast.
- **Stale-order check every 15 minutes.** It does nothing unless `AUTO_CANCEL_AWAITING_MINUTES` is above 0.

## Step 8: Test before announcing

Work through [TEST_CHECKLIST.md](TEST_CHECKLIST.md). At minimum:

1. place an order
2. see it on the dashboard
3. mark an item unavailable
4. respond from the email
5. complete the order
6. find it in History

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
| A staff member can't open the dashboard | Their exact email must be in the **Staff** tab and on an allowed domain. Then clear the cache. |
| "We could not confirm your school Google account" | The visitor isn't signed in, or is signed in with an account outside your organization. Have them sign out of other accounts or use a separate browser profile. |
| Email links point at `/dev` or are missing | Set `WEB_APP_URL` in Settings to the `/exec` URL. |
| Something else | Look at the **Errors** tab (newest rows at the bottom), and at **Executions** in the Apps Script editor. |
