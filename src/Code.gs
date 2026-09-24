/**
 * Code.gs — web app entry point and page routing.
 *
 *   <url>                                   customer ordering page
 *   <url>?page=shop                         shop dashboard (staff only)
 *   <url>?page=respond&choice=continue|revise&order=N&token=T
 *                                           links from the "item unavailable" email
 *
 * Access is checked here AND again inside every server function.
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    var ctx = getUserContext_();
    var s = getSettings_();
    var page = String(params.page || '').toLowerCase();

    if (!ctx.email) {
      return renderMessage_('Please sign in',
        'We could not confirm your school Google account. Sign in with your school account, then open this link again.');
    }

    if (page === 'shop') {
      if (!ctx.isShopStaff) {
        return renderMessage_('Access denied',
          'The shop dashboard is only for coffee shop staff. You are signed in as ' + ctx.email + '.', true);
      }
      return renderTemplate_('Shop', s.SHOP_NAME + ' — Orders', { baseUrl: webAppUrl_() }, s.SHOP_FAVICON_URL || s.FAVICON_URL);
    }

    if (!ctx.canOrder) {
      return renderMessage_('Access denied',
        'This ordering app is only available to approved school accounts. You are signed in as ' + ctx.email + '.');
    }

    var boot = { mode: 'order', baseUrl: webAppUrl_() };
    if (page === 'respond') {
      var order = String(params.order || '');
      var token = String(params.token || '').toLowerCase();
      var choice = String(params.choice || '').toLowerCase();
      if (!/^\d{1,7}$/.test(order) || !/^[a-f0-9]{32,64}$/.test(token) || ['continue', 'revise'].indexOf(choice) === -1) {
        return renderMessage_('Link not valid',
          'This link is incomplete or has been changed. Please open the link from the most recent coffee shop email.');
      }
      boot = { mode: choice === 'revise' ? 'revise' : 'respond', order: Number(order), token: token, baseUrl: webAppUrl_() };
    }
    return renderTemplate_('Customer', s.SHOP_NAME, boot, s.FAVICON_URL);
  } catch (err) {
    logError_('doGet', err);
    return renderMessage_('Something went wrong',
      'The coffee shop app could not load. Please try again in a minute. If it keeps happening, let the coffee shop staff know.');
  }
}

function renderTemplate_(file, title, boot, faviconUrl) {
  var t = HtmlService.createTemplateFromFile(file);
  t.bootJson = safeJsonForHtml_(boot);
  t.title = title;
  var out = t.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return applyFavicon_(out, faviconUrl);
}

/** True for an https:// link that can be used as a favicon. */
function isValidFaviconUrl_(url) {
  return /^https:\/\/[^\s"'<>]+$/i.test(String(url || '').trim());
}

/**
 * Sets the browser-tab icon. Apps Script only supports this server-side
 * (a <link rel="icon"> in the HTML would not reach the outer page). A bad or
 * blank URL just leaves Google's default icon; it never breaks the page.
 */
function applyFavicon_(output, url) {
  url = String(url || '').trim();
  if (!isValidFaviconUrl_(url)) return output;
  try {
    output.setFaviconUrl(url);
  } catch (e) {
    console.warn('Favicon not applied (' + url + '): ' + e);
  }
  return output;
}

/** A simple full-page message (access denied, errors). Text is escaped by the template. */
function renderMessage_(heading, message, showCustomerLink) {
  var t = HtmlService.createTemplateFromFile('Message');
  t.heading = heading;
  t.message = message;
  t.homeUrl = showCustomerLink ? webAppUrl_() : '';
  var title = heading;
  var favicon = '';
  try {
    var s = getSettings_();
    title = s.SHOP_NAME + ' — ' + heading;
    favicon = s.FAVICON_URL;
  } catch (e) { /* settings unreadable */ }
  var out = t.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return applyFavicon_(out, favicon);
}

/**
 * Inserts an HTML partial (Styles, Scripts...). Only the listed partials can be
 * included, so a browser cannot use this to read other files.
 */
function include(filename) {
  var allowed = ['Styles', 'Scripts', 'CustomerJs', 'ShopJs'];
  if (allowed.indexOf(filename) === -1) throw new Error('Unknown partial: ' + filename);
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
