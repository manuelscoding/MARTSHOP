/**
 * Email.gs — all emails. HTML with a plain-text twin; buttons are real <a>
 * links inside a table ("bulletproof" buttons) so they work in every mail
 * client and with screen readers. Functions return true/false and never throw.
 *
 * QUOTA: MailApp sends to ~1,500 recipients/day on Google Workspace (100 on
 * free Gmail). Each order uses 1 email, plus 1 per edit/cancel.
 */

function sendMail_(to, subject, html, text) {
  var s = getSettings_();
  if (!s.SEND_EMAILS) return false;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) {
      logError_('sendMail_', new Error('Daily email quota reached; not sent: ' + subject));
      return false;
    }
    var msg = { to: to, subject: subject, htmlBody: html, body: text, name: s.APP_NAME };
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.REPLY_TO_EMAIL || '')) msg.replyTo = s.REPLY_TO_EMAIL;
    MailApp.sendEmail(msg);
    return true;
  } catch (e) {
    logError_('sendMail_', e);
    return false;
  }
}

function webAppUrl_() {
  var s = getSettings_();
  if (s.WEB_APP_URL && /^https:\/\/script\.google\.com\//.test(s.WEB_APP_URL)) return s.WEB_APP_URL.replace(/\?.*$/, '');
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function orderLink_(o, page) {
  var base = webAppUrl_();
  return base ? base + '?page=' + page + '&order=' + encodeURIComponent(o.orderNumber) + '&token=' + encodeURIComponent(o.token) : '';
}

/* ---------- building blocks ---------- */

function shell_(heading, inner) {
  var s = getSettings_();
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f1a17;max-width:600px;margin:0 auto;">' +
    '<div style="background:#6b3a1e;color:#ffffff;padding:16px 20px;font-size:20px;font-weight:bold;">' + esc_(s.APP_NAME) + '</div>' +
    '<div style="border:1px solid #ddd;border-top:none;padding:20px;">' +
    '<h1 style="font-size:22px;margin:0 0 12px;">' + esc_(heading) + '</h1>' + inner +
    '<p style="color:#555;font-size:13px;margin-top:24px;">' + esc_(t_('email.footer')) + '</p></div></div>';
}

function button_(href, label) {
  return '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;"><tr>' +
    '<td bgcolor="#6b3a1e" style="border-radius:8px;">' +
    '<a href="' + esc_(href) + '" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">' +
    esc_(label) + '</a></td></tr></table>';
}

function itemsTable_(items, total) {
  var th = 'style="text-align:left;padding:6px 8px;border-bottom:2px solid #ccc;"';
  var td = 'style="padding:6px 8px;border-bottom:1px solid #eee;"';
  var rows = items.map(function (l) {
    return '<tr><td ' + td + '>' + esc_(l.name) + '</td><td ' + td + ' align="right">' + esc_(l.quantity) + '</td>' +
      '<td ' + td + ' align="right">' + esc_(formatMoney_(centsToAmount_(toCents_(l.unitPrice) * l.quantity))) + '</td></tr>';
  }).join('');
  return '<table role="presentation" style="border-collapse:collapse;width:100%;margin:8px 0;">' +
    '<tr><th ' + th + '>' + esc_(t_('email.colCookie')) + '</th><th ' + th + ' style="text-align:right;padding:6px 8px;border-bottom:2px solid #ccc;">' + esc_(t_('email.colQty')) + '</th>' +
    '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ccc;">' + esc_(t_('email.colPrice')) + '</th></tr>' + rows +
    '<tr><td style="padding:8px;font-weight:bold;" colspan="2">' + esc_(t_('email.total')) + '</td><td style="padding:8px;font-weight:bold;" align="right">' + esc_(formatMoney_(total)) + '</td></tr></table>';
}

function itemsText_(items, total) {
  return items.map(function (l) { return '  ' + l.quantity + ' x ' + l.name + '  ' + formatMoney_(centsToAmount_(toCents_(l.unitPrice) * l.quantity)); }).join('\n') +
    '\n  ' + t_('email.total') + ': ' + formatMoney_(total);
}

function detailsHtml_(o) {
  var rows = [[t_('email.room'), o.room], [t_('email.klass'), o.classOrNote], [t_('email.window'), o.deliveryWindow],
    [t_('email.payment'), o.payment], [t_('email.instructions'), o.instructions]].filter(function (r) { return r[1]; });
  return '<table role="presentation" style="margin:8px 0;">' + rows.map(function (r) {
    return '<tr><td style="padding:2px 12px 2px 0;font-weight:bold;">' + esc_(r[0]) + '</td><td>' + esc_(r[1]) + '</td></tr>';
  }).join('') + '</table>' + (o.allergy ? '<p style="font-weight:bold;">⚠ ' + esc_(t_('email.allergy')) + '</p>' : '');
}

function detailsText_(o) {
  return [[t_('email.room'), o.room], [t_('email.klass'), o.classOrNote], [t_('email.window'), o.deliveryWindow],
    [t_('email.payment'), o.payment], [t_('email.instructions'), o.instructions]]
    .filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') +
    (o.allergy ? '\n' + t_('email.allergy') : '');
}

function editBlockHtml_(o) {
  var s = getSettings_();
  var edit = orderLink_(o, 'edit');
  var cancel = orderLink_(o, 'cancel');
  if (!edit || !o.token) return '';
  return '<p>' + esc_(t_('email.editHelp', { until: s.EDITS_ALLOWED_UNTIL.toLowerCase(), from: s.NO_DECREASE_OR_CANCEL_FROM.toLowerCase() })) + '</p>' +
    button_(edit, t_('email.editButton')) +
    '<p><a href="' + esc_(cancel) + '" style="color:#a01c12;">' + esc_(t_('email.cancelLink')) + '</a></p>';
}

function editBlockText_(o) {
  var edit = orderLink_(o, 'edit');
  if (!edit || !o.token) return '';
  return '\n\n' + t_('email.editButton') + ': ' + edit + '\n' + t_('email.cancelLink') + ': ' + orderLink_(o, 'cancel');
}

/* ---------- emails ---------- */

function sendConfirmationEmail_(o) {
  try {
    var v = { n: o.orderNumber, name: o.customerName, room: o.room };
    var heading = t_('email.confirmHeading', v);
    var html = shell_(heading, '<p>' + esc_(t_('email.confirmIntro', v)) + '</p>' + itemsTable_(o.items, o.total) + detailsHtml_(o) + editBlockHtml_(o));
    var text = heading + '\n\n' + t_('email.confirmIntro', v) + '\n\n' + itemsText_(o.items, o.total) + '\n\n' + detailsText_(o) + editBlockText_(o);
    return sendMail_(o.customerEmail, t_('email.confirmSubject', v), html, text);
  } catch (e) { logError_('sendConfirmationEmail_', e); return false; }
}

/** Shows old vs new quantity per cookie and old vs new total. */
function sendUpdatedEmail_(o, before, diff) {
  try {
    var v = { n: o.orderNumber };
    var heading = t_('email.updatedHeading', v);
    var td = 'style="padding:6px 8px;border-bottom:1px solid #eee;"';
    var th = 'style="text-align:left;padding:6px 8px;border-bottom:2px solid #ccc;"';
    var rows = diff.map(function (d) {
      return '<tr><td ' + td + '>' + esc_(d.name) + '</td><td ' + td + ' align="right">' + esc_(d.old) + '</td><td ' + td + ' align="right"><strong>' + esc_(d.now) + '</strong></td></tr>';
    }).join('');
    var changeTable = diff.length ? '<table role="presentation" style="border-collapse:collapse;width:100%;margin:8px 0;">' +
      '<tr><th ' + th + '>' + esc_(t_('email.colCookie')) + '</th><th ' + th + '>' + esc_(t_('email.colWas')) + '</th><th ' + th + '>' + esc_(t_('email.colNow')) + '</th></tr>' + rows +
      '<tr><td style="padding:8px;font-weight:bold;">' + esc_(t_('email.total')) + '</td><td style="padding:8px;" align="right">' + esc_(formatMoney_(before.total)) +
      '</td><td style="padding:8px;font-weight:bold;" align="right">' + esc_(formatMoney_(o.total)) + '</td></tr></table>' : '';
    var roomLine = before.room !== o.room ? '<p>' + esc_(t_('email.room')) + ': ' + esc_(before.room) + ' → <strong>' + esc_(o.room) + '</strong></p>' : '';
    var html = shell_(heading, '<p>' + esc_(t_('email.updatedIntro')) + '</p>' + changeTable + roomLine +
      '<h2 style="font-size:17px;margin:16px 0 4px;">' + esc_(t_('email.total')) + ': ' + esc_(formatMoney_(o.total)) + '</h2>' +
      itemsTable_(o.items, o.total) + detailsHtml_(o) + editBlockHtml_(o));
    var text = heading + '\n\n' + t_('email.updatedIntro') + '\n' +
      diff.map(function (d) { return '  ' + d.name + ': ' + t_('email.colWas') + ' ' + d.old + ' -> ' + t_('email.colNow') + ' ' + d.now; }).join('\n') +
      (before.room !== o.room ? '\n  ' + t_('email.room') + ': ' + before.room + ' -> ' + o.room : '') +
      '\n  ' + t_('email.total') + ': ' + formatMoney_(before.total) + ' -> ' + formatMoney_(o.total) +
      '\n\n' + itemsText_(o.items, o.total) + '\n\n' + detailsText_(o) + editBlockText_(o);
    return sendMail_(o.customerEmail, t_('email.updatedSubject', v), html, text);
  } catch (e) { logError_('sendUpdatedEmail_', e); return false; }
}

function sendCancelledEmail_(o, reason) {
  try {
    var v = { n: o.orderNumber, reason: reason };
    var heading = t_('email.cancelledHeading', v);
    var html = shell_(heading, '<p>' + esc_(t_('email.cancelledIntro', v)) + '</p>' + (reason ? '<p>' + esc_(t_('email.reason', v)) + '</p>' : ''));
    var text = heading + '\n\n' + t_('email.cancelledIntro', v) + (reason ? '\n' + t_('email.reason', v) : '');
    return sendMail_(o.customerEmail, t_('email.cancelledSubject', v), html, text);
  } catch (e) { logError_('sendCancelledEmail_', e); return false; }
}

/** Alerts STAFF_NOTIFY_EMAILS when an order is changed after it went out for delivery. */
function sendStaffDispatchAlert_(o) {
  try {
    var s = getSettings_();
    if (!s.NOTIFY_STAFF_ON_DISPATCHED_EDIT) return false;
    var to = splitList_(s.STAFF_NOTIFY_EMAILS).filter(function (a) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a); });
    if (!to.length) return false;
    var so = toStaffOrder_(o);
    var lines = so.changes.map(function (c) { return c.name + ': was ' + c.old + ' → now ' + c.now + ' (' + (c.diff > 0 ? '+' : '') + c.diff + ')'; });
    if (so.roomChange) lines.push('Room: ' + so.roomChange.old + ' → ' + so.roomChange.now);
    var v = { n: o.orderNumber, room: o.room, teacher: o.customerName };
    var html = shell_(t_('email.staffAlertSubject', v), '<p><strong>⚠ ' + esc_(t_('email.staffAlertIntro', v)) + '</strong></p><ul>' +
      lines.map(function (l) { return '<li>' + esc_(l) + '</li>'; }).join('') + '</ul>');
    return sendMail_(to.join(','), t_('email.staffAlertSubject', v), html, t_('email.staffAlertIntro', v) + '\n\n' + lines.join('\n'));
  } catch (e) { logError_('sendStaffDispatchAlert_', e); return false; }
}

function sendSummaryEmail_(to, sum) {
  try {
    var lines = [
      'Orders: ' + sum.orders + ' (' + sum.delivered + ' delivered)',
      'Cancellations: ' + sum.cancellations,
      'Changes after dispatch: ' + sum.postDispatchEdits,
      'Revenue: ' + formatMoney_(sum.revenue)
    ];
    var cookies = sum.cookies.map(function (c) { return c.name + ': ' + c.quantity + ' (' + formatMoney_(c.revenue) + ')'; });
    var pay = sum.byPayment.map(function (p) { return p.method + ': ' + formatMoney_(p.amount); });
    var v = { date: sum.date };
    var html = shell_(t_('email.summarySubject', v), '<ul>' + lines.map(function (l) { return '<li>' + esc_(l) + '</li>'; }).join('') + '</ul>' +
      '<h2 style="font-size:17px;">Cookies sold</h2><ul>' + cookies.map(function (l) { return '<li>' + esc_(l) + '</li>'; }).join('') + '</ul>' +
      '<h2 style="font-size:17px;">By payment method</h2><ul>' + pay.map(function (l) { return '<li>' + esc_(l) + '</li>'; }).join('') + '</ul>');
    return sendMail_(to, t_('email.summarySubject', v), html, lines.concat([''], cookies, [''], pay).join('\n'));
  } catch (e) { logError_('sendSummaryEmail_', e); return false; }
}
