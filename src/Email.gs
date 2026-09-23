/**
 * Email.gs — all customer emails.
 *
 * Every function returns true if the email was sent, false otherwise, and
 * NEVER throws: an email problem must not undo an order.
 *
 * QUOTA: MailApp can send to about 1,500 recipients per day on Google
 * Workspace (100/day on free Gmail). Each order uses 1-3 emails. The
 * remaining quota is checked before sending; failures go to the Errors sheet.
 */

function sendMail_(to, subject, html, text) {
  var s = getSettings_();
  if (!s.SEND_EMAILS) return false;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) {
      logError_('sendMail_', new Error('Daily email quota reached; email to ' + to + ' not sent: ' + subject));
      return false;
    }
    var msg = { to: to, subject: subject, htmlBody: html, body: text, name: s.SHOP_NAME };
    if (s.REPLY_TO_EMAIL && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.REPLY_TO_EMAIL)) msg.replyTo = s.REPLY_TO_EMAIL;
    MailApp.sendEmail(msg);
    return true;
  } catch (e) {
    logError_('sendMail_', e);
    return false;
  }
}

/** The deployed web app URL used in email links. */
function webAppUrl_() {
  var s = getSettings_();
  if (s.WEB_APP_URL && /^https:\/\/script\.google\.com\//.test(s.WEB_APP_URL)) return s.WEB_APP_URL.replace(/\?.*$/, '');
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

/* ---------- building blocks ---------- */

function emailShell_(heading, innerHtml) {
  var s = getSettings_();
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f1f1f;max-width:560px;margin:0 auto;">' +
    '<div style="background:#5b3a1e;color:#ffffff;padding:16px 20px;border-radius:8px 8px 0 0;font-size:20px;font-weight:bold;">' + esc_(s.SHOP_NAME) + '</div>' +
    '<div style="border:1px solid #ddd;border-top:none;padding:20px;border-radius:0 0 8px 8px;">' +
    '<h2 style="margin:0 0 12px;font-size:20px;">' + esc_(heading) + '</h2>' + innerHtml +
    '<p style="color:#666;font-size:13px;margin-top:24px;">This is an automated message from ' + esc_(s.SHOP_NAME) + '.</p>' +
    '</div></div>';
}

function itemsTableHtml_(lines, total) {
  var rows = lines.map(function (l) {
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">' + esc_(l.qty) + ' &times; ' + esc_(l.name) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">' + esc_(formatMoney_(centsToAmount_(toCents_(l.price) * l.qty))) + '</td></tr>';
  }).join('');
  return '<table style="border-collapse:collapse;width:100%;margin:8px 0;">' + rows +
    '<tr><td style="padding:8px;font-weight:bold;">Total</td><td style="padding:8px;text-align:right;font-weight:bold;">' + esc_(formatMoney_(total)) + '</td></tr></table>';
}

function itemsText_(lines, total) {
  return lines.map(function (l) {
    return '  ' + l.qty + ' x ' + l.name + '  ' + formatMoney_(centsToAmount_(toCents_(l.price) * l.qty));
  }).join('\n') + '\n  Total: ' + formatMoney_(total);
}

function fulfilmentText_(o) {
  return (o.delivery ? 'Delivery to room ' + o.room : 'Pickup at the coffee shop') + ' · Paying by ' + o.payment.toLowerCase();
}

function buttonHtml_(href, label, bg) {
  return '<a href="' + esc_(href) + '" style="display:inline-block;background:' + bg + ';color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:6px;margin:6px 8px 6px 0;">' + esc_(label) + '</a>';
}

/* ---------- specific emails ---------- */

/** kind: 'new' | 'updated' */
function sendConfirmationEmail_(o, kind) {
  try {
    var lines = o.items.filter(function (l) { return !l.unavailable; });
    var updated = kind === 'updated';
    var heading = updated ? 'Order #' + o.orderNumber + ' updated' : 'Order #' + o.orderNumber + ' received';
    var intro = updated
      ? 'Thanks, ' + o.customerName + '. Your updated order is back in the queue.'
      : 'Thanks, ' + o.customerName + '! We received your order.';
    var html = emailShell_(heading,
      '<p>' + esc_(intro) + '</p>' + itemsTableHtml_(lines, o.total) +
      '<p><strong>' + esc_(fulfilmentText_(o)) + '</strong></p>' +
      '<p>Payment is collected at ' + (o.delivery ? 'delivery' : 'pickup') + '.</p>');
    var text = heading + '\n\n' + intro + '\n\n' + itemsText_(lines, o.total) + '\n\n' + fulfilmentText_(o) + '\n';
    return sendMail_(o.customerEmail, getSettings_().SHOP_NAME + ': ' + heading, html, text);
  } catch (e) {
    logError_('sendConfirmationEmail_', e);
    return false;
  }
}

function sendUnavailableEmail_(o) {
  try {
    var base = webAppUrl_();
    if (!base) {
      logError_('sendUnavailableEmail_', new Error('Web app URL unknown. Set WEB_APP_URL in Settings.'));
      return false;
    }
    var q = '&order=' + encodeURIComponent(o.orderNumber) + '&token=' + encodeURIComponent(o.token);
    var reviseUrl = base + '?page=respond&choice=revise' + q;
    var continueUrl = base + '?page=respond&choice=continue' + q;

    var gone = o.items.filter(function (l) { return l.unavailable; });
    var remaining = o.items.filter(function (l) { return !l.unavailable; });
    var newTotal = centsToAmount_(totalCents_(remaining, true));
    var goneNames = gone.map(function (l) { return l.name; });
    var subjectNames = goneNames.length === 1 ? goneNames[0] + ' is' : goneNames.join(', ') + ' are';
    var heading = subjectNames + ' no longer available';
    var expires = formatDateTime_(o.tokenExpiresAt);

    var body = '<p>Hi ' + esc_(o.customerName) + ', sorry! <strong>' + esc_(subjectNames) + ' no longer available</strong> for order #' + esc_(o.orderNumber) + '.</p>';
    if (remaining.length) {
      body += '<p>Your remaining items:</p>' + itemsTableHtml_(remaining, newTotal) +
        '<p>New total: <strong>' + esc_(formatMoney_(newTotal)) + '</strong></p>' +
        '<p>What would you like to do?</p>' +
        buttonHtml_(continueUrl, 'Continue without this item', '#2e7d32') +
        buttonHtml_(reviseUrl, 'Revise my order', '#5b3a1e');
    } else {
      body += '<p>None of the items in your order are available right now. Please revise your order, or it will be cancelled.</p>' +
        buttonHtml_(reviseUrl, 'Revise my order', '#5b3a1e') +
        buttonHtml_(continueUrl, 'Cancel my order', '#b3261e');
    }
    body += '<p style="color:#555;font-size:14px;">Your order is on hold until you respond. These links only work for your school account and expire ' + esc_(expires) + '.</p>';

    var text = heading + ' (order #' + o.orderNumber + ')\n\n' +
      (remaining.length ? 'Remaining items:\n' + itemsText_(remaining, newTotal) + '\n\nContinue without this item: ' + continueUrl + '\n' : 'None of your items are available.\n') +
      'Revise my order: ' + reviseUrl + '\n\nLinks expire ' + expires + '.\n';

    return sendMail_(o.customerEmail, getSettings_().SHOP_NAME + ': action needed for order #' + o.orderNumber, emailShell_(heading, body), text);
  } catch (e) {
    logError_('sendUnavailableEmail_', e);
    return false;
  }
}

function sendCancelledEmail_(o, reason) {
  try {
    var heading = 'Order #' + o.orderNumber + ' cancelled';
    var html = emailShell_(heading,
      '<p>Hi ' + esc_(o.customerName) + ', your order #' + esc_(o.orderNumber) + ' has been cancelled.</p>' +
      (reason ? '<p>Reason: ' + esc_(reason) + '</p>' : '') +
      '<p>No payment is due. You are welcome to place a new order any time the shop is open.</p>');
    var text = heading + '\n\n' + (reason ? 'Reason: ' + reason + '\n\n' : '') + 'No payment is due.\n';
    return sendMail_(o.customerEmail, getSettings_().SHOP_NAME + ': ' + heading, html, text);
  } catch (e) {
    logError_('sendCancelledEmail_', e);
    return false;
  }
}

function sendReadyEmail_(o) {
  try {
    var heading = 'Order #' + o.orderNumber + (o.delivery ? ' is on its way' : ' is ready');
    var line = o.delivery ? 'Your order is on its way to room ' + o.room + '.' : 'Your order is ready for pickup.';
    var html = emailShell_(heading, '<p>' + esc_(line) + '</p><p>Please have ' + esc_(o.payment.toLowerCase()) + ' ready: <strong>' + esc_(formatMoney_(o.total)) + '</strong>.</p>');
    return sendMail_(o.customerEmail, getSettings_().SHOP_NAME + ': ' + heading, html, heading + '\n\n' + line + '\nTotal: ' + formatMoney_(o.total) + '\n');
  } catch (e) {
    logError_('sendReadyEmail_', e);
    return false;
  }
}
