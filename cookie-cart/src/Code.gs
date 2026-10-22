/**
 * Code.gs — web app entry point and page routing.
 *
 *   <url>                                    teacher ordering page
 *   <url>?page=dashboard                     Cookie Cart staff dashboard
 *   <url>?page=edit&order=N&token=T          "Edit my order" email button
 *   <url>?page=cancel&order=N&token=T        "Cancel order" email link (asks to confirm)
 *
 * Access is checked here AND again inside every server function.
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    var ctx = getUserContext_();
    var s = getSettings_();
    var page = String(params.page || '').toLowerCase();
    if (!ctx.email) return renderMessage_('Please sign in', t_('server.notSignedIn'));

    if (page === 'dashboard') {
      if (!ctx.isStaff) return renderMessage_('Access denied', t_('server.staffOnly') + ' (' + ctx.email + ')', true);
      return renderTemplate_('Dashboard', s.APP_NAME + ' — Dashboard', { baseUrl: webAppUrl_() });
    }
    if (!ctx.canOrder) return renderMessage_('Access denied', t_('server.noAccess', { email: ctx.email }));

    var boot = { mode: 'order', baseUrl: webAppUrl_() };
    if (page === 'edit' || page === 'cancel') {
      var order = String(params.order || '');
      var token = String(params.token || '').toLowerCase();
      if (!/^\d{1,7}$/.test(order) || !/^[a-f0-9]{32,64}$/.test(token)) return renderMessage_('Link not valid', t_('server.linkInvalid'));
      boot = { mode: page, order: Number(order), token: token, baseUrl: webAppUrl_() };
    } else if (page === 'myorders') {
      boot.mode = 'myorders';
    }
    return renderTemplate_('Customer', s.APP_NAME, boot);
  } catch (err) {
    logError_('doGet', err);
    return renderMessage_('Something went wrong', t_('server.generic'));
  }
}

function renderTemplate_(file, title, boot) {
  boot.strings = STRINGS.client;
  var t = HtmlService.createTemplateFromFile(file);
  t.bootJson = safeJsonForHtml_(boot);
  t.title = title;
  return t.evaluate().setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderMessage_(heading, message, showOrderLink) {
  var t = HtmlService.createTemplateFromFile('Message');
  t.heading = heading;
  t.message = message;
  t.homeUrl = showOrderLink ? webAppUrl_() : '';
  var title = heading;
  try { title = getSettings_().APP_NAME + ' — ' + heading; } catch (e) { /* settings unreadable */ }
  return t.evaluate().setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Inserts an HTML partial. Only these partials can be included. */
function include(filename) {
  var allowed = ['Styles', 'Scripts', 'CustomerJs', 'DashboardJs'];
  if (allowed.indexOf(filename) === -1) throw new Error('Unknown partial: ' + filename);
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
