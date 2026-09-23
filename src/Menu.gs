/**
 * Menu.gs — reads the Menu sheet. Prices ALWAYS come from here, never from
 * the browser.
 *
 * Menu columns: ItemID | Name | Price | Available | Category | SortOrder
 *   ItemID     short unique code, e.g. LATTE (never change it once used)
 *   Available  checkbox (TRUE/FALSE); unchecked items are hidden from customers
 *   SortOrder  lower numbers appear first
 */

/** All valid menu rows, sorted for display. Invalid rows are skipped. */
function readMenu_() {
  var t = readTable_(CONFIG.SHEETS.MENU, ['ItemID', 'Name', 'Price', 'Available']);
  var seen = {};
  var items = [];
  t.rows.forEach(function (r, i) {
    var id = String(r[t.idx.ItemID] || '').trim();
    var name = String(r[t.idx.Name] || '').trim();
    var price = Number(r[t.idx.Price]);
    if (!id && !name) return;                         // blank row
    if (!id || !name || !isFinite(price) || price < 0 || seen[id]) {
      console.warn('Skipping invalid or duplicate Menu row ' + (i + 2));
      return;
    }
    seen[id] = true;
    var avail = r[t.idx.Available];
    items.push({
      id: id,
      name: name,
      price: centsToAmount_(toCents_(price)),
      available: avail === true || String(avail).trim().toUpperCase() === 'TRUE',
      category: t.idx.hasOwnProperty('Category') ? (String(r[t.idx.Category] || '').trim() || 'Menu') : 'Menu',
      sortOrder: t.idx.hasOwnProperty('SortOrder') && isFinite(Number(r[t.idx.SortOrder])) && r[t.idx.SortOrder] !== '' ? Number(r[t.idx.SortOrder]) : 9999,
      row: i + 2
    });
  });

  // Categories appear in order of their lowest SortOrder.
  var catOrder = {};
  items.forEach(function (it) {
    if (!catOrder.hasOwnProperty(it.category) || it.sortOrder < catOrder[it.category]) catOrder[it.category] = it.sortOrder;
  });
  items.sort(function (a, b) {
    if (a.category !== b.category) {
      return (catOrder[a.category] - catOrder[b.category]) || a.category.localeCompare(b.category);
    }
    return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name);
  });
  return items;
}

/** ItemID -> menu item. */
function getMenuMap_() {
  var map = {};
  readMenu_().forEach(function (it) { map[it.id] = it; });
  return map;
}

/** What the customer page needs to start. */
function getCustomerBootstrap() {
  return api_('getCustomerBootstrap', function () {
    var ctx = requireCustomer_();
    var s = getSettings_();
    var rules = getRules_(ctx);
    var win = getOrderingWindow_(rules);
    var menu = readMenu_()
      .filter(function (it) { return it.available; })
      .map(function (it) { return { id: it.id, name: it.name, price: it.price, category: it.category }; });
    return {
      shopName: s.SHOP_NAME,
      currency: s.CURRENCY_SYMBOL,
      user: { email: ctx.email, suggestedName: nameFromEmail_(ctx.email), isShopStaff: ctx.isShopStaff },
      orderingOpen: win.open,
      closedMessage: win.message,
      menu: menu,
      rules: {
        deliveryEnabled: rules.deliveryEnabled,
        allowedRooms: rules.allowedRooms,
        roomPattern: s.ROOM_PATTERN,
        namedRooms: splitList_(s.NAMED_ROOMS).map(function (r) { return r.toUpperCase(); }),
        maxQtyPerItem: rules.maxQtyPerItem,
        maxItemsPerOrder: rules.maxItemsPerOrder,
        nameMax: CONFIG.HARD_LIMITS.NAME_MAX,
        roomMax: CONFIG.HARD_LIMITS.ROOM_MAX
      }
    };
  });
}

/** "jane.doe@x.org" -> "Jane Doe" (a starting suggestion; the user can edit it). */
function nameFromEmail_(email) {
  var local = String(email || '').split('@')[0].replace(/[0-9]+/g, '');
  return local.split(/[._-]+/).filter(function (p) { return p; })
    .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); })
    .join(' ').slice(0, CONFIG.HARD_LIMITS.NAME_MAX);
}

/** Staff: the full menu including unavailable items. */
function getMenuAdmin() {
  return api_('getMenuAdmin', function () {
    requireStaff_();
    return readMenu_().map(function (it) {
      return { id: it.id, name: it.name, price: it.price, available: it.available, category: it.category };
    });
  });
}

/** Staff: turn one menu item on or off. */
function setMenuItemAvailability(itemId, available) {
  return api_('setMenuItemAvailability', function () {
    var ctx = requireStaff_();
    var id = String(itemId || '').trim();
    if (!id || id.length > 60) throw new AppError('That menu item is not valid.');
    var on = available === true;
    withLock_(function () { setMenuAvailabilityNoLock_([id], on); });
    console.log(ctx.email + ' set menu item ' + id + ' available=' + on);
    return { id: id, available: on };
  });
}

/** Sets Available for the given ItemIDs. Caller must hold the lock. */
function setMenuAvailabilityNoLock_(ids, available) {
  var t = readTable_(CONFIG.SHEETS.MENU, ['ItemID', 'Available']);
  var col = t.idx.Available + 1;
  var found = 0;
  t.rows.forEach(function (r, i) {
    if (ids.indexOf(String(r[t.idx.ItemID] || '').trim()) !== -1) {
      t.sheet.getRange(i + 2, col).setValue(available);   // only a handful of cells
      found++;
    }
  });
  if (!found) throw new AppError('That menu item was not found. It may have been removed from the Menu sheet.');
  return found;
}
