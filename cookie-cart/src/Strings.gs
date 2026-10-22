/**
 * Strings.gs — ALL user-facing text in one place, ready for translation.
 *
 *   STRINGS.server  messages the server sends (errors, rules)
 *   STRINGS.email   email wording
 *   STRINGS.client  everything shown on the customer page and dashboard.
 *                   It is sent to the browser when a page loads (BOOT.strings).
 *
 * {name} placeholders are filled in by t_() on the server and App.t() in the
 * browser. To translate: copy this file, translate the right-hand sides, keep
 * the {placeholders} unchanged.
 */
var STRINGS = {
  server: {
    notSignedIn: 'We could not confirm your school Google account. Please sign in with your school account and reload the page.',
    noAccess: 'Your account ({email}) does not have access to the {app}.',
    staffOnly: 'This area is only for {app} staff.',
    ownerOnly: 'Only the owner of this script can run this function.',
    busy: 'The {app} is busy right now. Please wait a few seconds and try again.',
    generic: 'Sorry, something went wrong. Please try again. If it keeps happening, let the {app} staff know.',
    tooOften: 'You are doing that too often. Please wait a few minutes and try again.',
    closedManual: 'Ordering is closed right now. Please check back later.',
    closedToday: 'Ordering is closed today. It reopens {when}.',
    closedBefore: 'Ordering opens at {time} today.',
    closedAfter: 'Today\'s ordering closed at {time}. It reopens {when}.',
    noItems: 'Please choose at least one cookie.',
    qtyInvalid: 'Quantities must be whole numbers from 0 to {max}.',
    tooManyTotal: 'Orders are limited to {max} cookies in total. Please lower your quantity.',
    tooManyProduct: 'You can order at most {max} {name} at a time.',
    productGone: 'One of the cookies in your order is no longer offered. Please review your order.',
    productSoldOut: '{name} is sold out right now. Please remove it from your order.',
    dailyLimit: 'Only {left} {name} left today. Please lower your quantity to {left} or fewer.',
    soldOutToday: '{name} is sold out for today.',
    nameRequired: 'Please enter your name.',
    roomRequired: 'Please enter the room number for delivery.',
    roomInvalid: 'Please enter a valid room number, for example 214 or B12.',
    paymentRequired: 'Please choose how you will pay: cash, card{account}.',
    accountRequired: 'Please enter the department or account to charge.',
    windowInvalid: 'Please choose one of the delivery windows listed.',
    linkInvalid: 'This link is not valid. Please use the most recent email from the {app}.',
    notOwner: 'This order belongs to a different account. Please sign in with the school account that placed order #{n}.',
    changedMeanwhile: 'Order #{n} was changed since you opened it. We have loaded the latest version; please review it and try again.',
    alreadyClosed: 'Order #{n} was already {status}, so it can no longer be changed.',
    editBlockedStatus: 'Order #{n} is already {status}, so it can no longer be changed. Please contact the {app} staff if something is wrong.',
    decreaseBlocked: 'Your cookies are already {status}, so this order can no longer be reduced or cancelled. You can still add cookies.',
    increaseAfterCutoff: 'It is past today\'s ordering cutoff ({time}), so cookies can\'t be added. You can still reduce or cancel your order.',
    noChanges: 'You didn\'t change anything.',
    statusNotAllowed: 'Order #{n} is now "{status}", so that action is not possible. The list has been refreshed.',
    orderNotFound: 'Order #{n} was not found.',
    invalidDate: 'Please pick a valid date.',
    productNotFound: 'That cookie was not found in the Products sheet.',
    limitInvalid: 'The daily limit must be a whole number from 0 (no limit) to {max}.'
  },

  email: {
    footer: 'This is an automated message from the {app}.',
    confirmSubject: '{app}: order #{n} received',
    confirmHeading: 'Order #{n} received',
    confirmIntro: 'Thanks, {name}! We received your order and will deliver it to room {room}.',
    updatedSubject: '{app}: order #{n} updated',
    updatedHeading: 'Order #{n} updated',
    updatedIntro: 'Your order has been updated. Here is what changed:',
    cancelledSubject: '{app}: order #{n} cancelled',
    cancelledHeading: 'Order #{n} cancelled',
    cancelledIntro: 'Your order #{n} has been cancelled. No payment is due.',
    reason: 'Reason: {reason}',
    editButton: 'Edit my order',
    cancelLink: 'Cancel order',
    editHelp: 'Need to change something? Use the button below. You must be signed in with your school account. Changes are allowed until {until}; reducing or cancelling is not possible once your order is {from}.',
    colCookie: 'Cookie', colWas: 'Was', colNow: 'Now', colQty: 'Qty', colPrice: 'Price',
    total: 'Total', room: 'Room', klass: 'Class / note', window: 'Delivery window', payment: 'Payment', instructions: 'Instructions',
    allergy: 'Allergy noted: please keep separate',
    staffAlertSubject: '{app}: order #{n} CHANGED after dispatch',
    staffAlertIntro: 'Order #{n} for room {room} ({teacher}) was changed after it went out for delivery.',
    summarySubject: '{app}: summary for {date}'
  },

  client: {
    // shared
    loading: 'Loading…', retry: 'Try again', close: 'Close', back: 'Back', cancel: 'Cancel', goBack: 'Go back',
    netError: 'Could not reach the server. Check your connection and try again.',
    sessionError: 'Your sign-in session may have expired, or you are signed in to more than one Google account. Please reload the page using only your school account.',
    noResponse: 'No response from the server. Please try again.',
    statusReceived: 'Received', statusPreparing: 'Preparing', statusOut: 'Out for Delivery', statusDelivered: 'Delivered', statusCancelled: 'Cancelled',
    each: 'each', total: 'Total', cookies: 'cookies', cookie: 'cookie',
    version: 'Version {v}',

    // customer
    tabOrder: 'Order cookies', tabMyOrders: 'My orders',
    dashboardLink: 'Staff dashboard',
    hello: 'Hi, {name}!',
    pickCookie: 'How many cookies for your class?',
    pickCookies: 'Choose your cookies',
    allergens: 'Allergens', dietary: 'Dietary',
    noAllergens: 'No allergens listed',
    leftToday: 'Only {n} left today', soldOutToday: 'Sold out for today',
    qtyLabel: 'Number of {name}',
    fewer: 'One fewer {name}', more: 'One more {name}',
    detailsHeading: 'Delivery details',
    roomRequired: 'Please enter the room number for delivery.', roomInvalid: 'Please enter a valid room number, for example 214 or B12.',
    nameRequired: 'Please enter your name.', payRequired: 'Please choose how you will pay.', accountRequired: 'Please enter the department or account to charge.',
    room: 'Room number', roomHint: 'For example 214, B12 or LIBRARY. We remember it for next time.',
    yourName: 'Your name',
    klass: 'Class or period (optional)', klassHint: 'For example "Period 3 Biology".',
    window: 'Preferred delivery time (optional)', noPreference: 'No preference',
    instructions: 'Special instructions (optional)', instructionsHint: 'For example "Leave with the front office" or "Please bag separately".',
    allergyFlag: 'Someone in my class has a food allergy. Please keep this order separate.',
    allergyHint: 'Tell us more in Special instructions if needed.',
    payment: 'How will you pay?', payCash: 'Cash', payCard: 'Card',
    accountName: 'Department or account to charge',
    payNote: 'You pay on delivery. Nothing is charged online.',
    review: 'Review order', reviewHeading: 'Review your order', change: 'Change',
    submit: 'Place order', submitting: 'Placing order…',
    saveChanges: 'Save changes', saving: 'Saving…',
    received: 'Order received!', updated: 'Order updated!',
    orderNumberIs: 'Your order number is',
    emailSent: 'A confirmation email with an "Edit my order" button was sent to {email}.',
    emailNotSent: 'Your order was saved, but we could not send the email. Please note your order number.',
    newOrder: 'Place another order', viewMyOrders: 'View my orders',
    closedHeading: 'Ordering is closed', checkAgain: 'Check again',
    editing: 'Editing order #{n}',
    editRules: 'Changes allowed until {until}. Reducing or cancelling is not possible once your order is {from}.',
    was: 'was {n}',
    myOrdersHeading: 'My orders', noOrders: 'You have no orders yet.',
    edit: 'Edit', cancelOrder: 'Cancel order', reorder: 'Order again',
    cancelConfirmTitle: 'Cancel order #{n}?', cancelConfirmBody: 'Your order will be cancelled. This cannot be undone.',
    keepOrder: 'Keep order', cancelled: 'Order #{n} cancelled.',
    reorderNote: 'We filled in your previous order. Check the quantity and room, then continue.',
    reorderChanged: 'Some quantities were lowered to what is available today.',
    placedAt: 'Placed {time}',
    continue: 'Continue', required: '(required)',
    linkCancelHeading: 'Cancel order #{n}?',

    // dashboard
    dashTitle: 'Dashboard', tabOrders: 'Orders', tabRoute: 'Delivery route', tabHistory: 'History', tabReports: 'Day summary', tabControls: 'Controls',
    live: 'Live · updated {ago}', justNow: 'just now', offline: 'Connection problem: retrying',
    staleBanner: 'This list may be out of date: the dashboard has not reached the server for a while.', reload: 'Reload dashboard',
    prepNeeded: 'Needed today', prepDelivered: 'Delivered', prepRemaining: 'Still to prepare', prepOut: 'Out for delivery',
    filterStatus: 'Status', filterAllActive: 'All active', filterAll: 'All today', filterSearch: 'Search room, teacher or order #', filterDate: 'Date',
    noActive: 'No orders to show. New orders appear here automatically.',
    submitted: 'Submitted {ago}', ago: '{t} ago',
    room: 'Room', newBadge: 'NEW', editedBadge: 'Edited', dispatchedBadge: 'UPDATED AFTER DISPATCH',
    changeWas: 'Was {old} → Now {now} ({diff})', roomChanged: 'Room {old} → {now}',
    acknowledge: 'Acknowledge change', acknowledged: 'Change acknowledged for order #{n}',
    startPreparing: 'Start preparing', markOut: 'Out for delivery', markDelivered: 'Mark delivered',
    cancelOrderStaff: 'Cancel order', cancelReason: 'Reason (optional, emailed to the teacher)',
    cancelStaffTitle: 'Cancel order #{n}?', cancelStaffBody: 'The teacher will be emailed. This cannot be undone.',
    seconds: '{n}s', minutes: '{n} min', hours: '{n} hr', ok: 'OK', printFallback: 'Press Ctrl+P (Cmd+P on a Mac) to print.',
    studentBadge: 'STUDENT', emailNotSentStaff: '{msg}, but the email to the teacher was not sent',
    colRoom: 'Room', colOrder: 'Order', colTeacher: 'Teacher', colCookies: 'Cookies', colNotes: 'Notes',
    labelAllergy: 'ALLERGY: {note}', allergyKeepSeparate: 'keep separate',
    allergyBadge: 'ALLERGY', windowLabel: 'Window', paymentLabel: 'Payment', notesLabel: 'Instructions', classLabel: 'Class',
    announceNew: 'New order #{n} for room {room}', announceChanged: 'Order #{n} was changed after dispatch',
    routeHeading: 'Out for delivery, by room', routeEmpty: 'No orders are out for delivery.',
    printSheet: '🖨 Print delivery sheet', printLabels: '🖨 Print bag labels', printOne: '🖨 Label',
    sheetTitle: 'Delivery sheet', delivered: 'Delivered',
    historySearch: 'Search order #, teacher or room', search: 'Search', clear: 'Clear',
    found: '{n} order(s) found', changeLog: 'Change log', loadingLog: 'Loading change log…',
    reportDate: 'Date', runReport: 'Show summary', ordersCount: 'Orders', cookiesSold: 'Cookies sold', revenue: 'Revenue',
    byPayment: 'Revenue by payment method', cancellations: 'Cancellations', postDispatchEdits: 'Changes after dispatch',
    controlsHeading: 'Today\'s controls', orderingOpen: 'Ordering is OPEN', orderingClosed: 'Ordering is CLOSED',
    openOrdering: 'Open ordering', closeOrdering: 'Close ordering for today',
    productsHeading: 'Cookies', available: 'Available', soldOut: 'Sold out', dailyLimit: 'Daily limit (0 = no limit)', save: 'Save',
    soldToday: '{n} ordered today', saved: 'Saved'
  }
};

/** Looks up a string ('server.busy') and fills {placeholders}. */
function t_(key, vars) {
  var parts = String(key).split('.');
  var s = STRINGS;
  for (var i = 0; i < parts.length; i++) s = s ? s[parts[i]] : undefined;
  if (typeof s !== 'string') return key;
  vars = vars || {};
  if (!('app' in vars)) {
    try { vars.app = getSettings_().APP_NAME; } catch (e) { vars.app = 'Cookie Cart'; }
  }
  return s.replace(/\{(\w+)\}/g, function (m, k) { return vars.hasOwnProperty(k) ? String(vars[k]) : m; });
}
