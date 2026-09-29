/**
 * Menu.gs — reads the Menu sheet. Prices ALWAYS come from here, never from
 * the browser.
 *
 * Menu columns: ItemID | Name | Price | Available | Category | SortOrder
 *   ItemID     short unique code, e.g. LATTE (never change it once used)
 *   Available  checkbox (TRUE/FALSE); unchecked items are hidden from customers
 *   SortOrder  lower numbers appear first
 *   Icon       optional emoji shown on the menu card, e.g. 🥤 (blank = category default)
 *   Tag        optional short badge, e.g. Hot, Iced, Spicy, Seasonal, House special
 *   Customizable  checkbox; TRUE shows the drink-options popup (sweeteners,
 *              creamers, syrups from the Options sheet) for this item
 *
 * Options columns: OptionID | Group | Name | Price | Available | SortOrder
 *   Group      heading the option appears under, e.g. Sweeteners, Creamer, Syrups
 *   Price      extra charge per drink (0 = free). Always taken from here.
 */

/** Icon used when an item's Icon cell is blank. */
function defaultIcon_(category) {
  var c = String(category || '').toLowerCase();
  if (/snack|food|treat|bak/.test(c)) return '🍪';
  if (/coffee|hot/.test(c)) return '☕';
  return '🥤';
}

/** All valid menu rows, sorted for display. Invalid rows are skipped. */
function readMenu_() {
  var t = readTable_(CONFIG.SHEETS.MENU, ['ItemID', 'Name', 'Price', 'Available']);
  var seen = dict_();
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
      available: isTrue_(avail),
      category: t.idx.hasOwnProperty('Category') ? (String(r[t.idx.Category] || '').trim() || 'Menu') : 'Menu',
      sortOrder: t.idx.hasOwnProperty('SortOrder') && isFinite(Number(r[t.idx.SortOrder])) && r[t.idx.SortOrder] !== '' ? Number(r[t.idx.SortOrder]) : 9999,
      icon: t.idx.hasOwnProperty('Icon') ? cleanText_(r[t.idx.Icon], 8) : '',
      tag: t.idx.hasOwnProperty('Tag') ? cleanText_(r[t.idx.Tag], 20) : '',
      customizable: t.idx.hasOwnProperty('Customizable') && isTrue_(r[t.idx.Customizable]),
      row: i + 2
    });
  });

  // Categories appear in order of their lowest SortOrder.
  var catOrder = {};
  items.forEach(function (it) {
    if (!catOrder.hasOwnProperty(it.category) || it.sortOrder < catOrder[it.category]) catOrder[it.category] = it.sortOrder;
  });
  items.forEach(function (it) { if (!it.icon) it.icon = defaultIcon_(it.category); });
  items.sort(function (a, b) {
    if (a.category !== b.category) {
      return (catOrder[a.category] - catOrder[b.category]) || a.category.localeCompare(b.category);
    }
    return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name);
  });
  return items;
}

/** A checkbox cell (TRUE/FALSE or the text TRUE). */
function isTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/**
 * All valid rows of the Options sheet (sweeteners, creamers, syrups...),
 * sorted by group then SortOrder. Returns [] if the sheet does not exist yet.
 */
function readOptions_() {
  if (!getSs_().getSheetByName(CONFIG.SHEETS.OPTIONS)) return [];
  var t = readTable_(CONFIG.SHEETS.OPTIONS, ['OptionID', 'Group', 'Name', 'Available']);
  var seen = dict_();
  var list = [];
  t.rows.forEach(function (r, i) {
    var id = String(r[t.idx.OptionID] || '').trim();
    var name = cleanText_(r[t.idx.Name], 40);
    var group = cleanText_(r[t.idx.Group], 30) || 'Options';
    var price = t.idx.hasOwnProperty('Price') && r[t.idx.Price] !== '' ? Number(r[t.idx.Price]) : 0;
    if (!id && !name) return;
    if (!id || id.length > 40 || !name || !isFinite(price) || price < 0 || seen[id]) {
      console.warn('Skipping invalid or duplicate Options row ' + (i + 2));
      return;
    }
    seen[id] = true;
    var so = t.idx.hasOwnProperty('SortOrder') ? Number(r[t.idx.SortOrder]) : NaN;
    list.push({
      id: id, group: group, name: name,
      price: centsToAmount_(toCents_(price)),
      available: isTrue_(r[t.idx.Available]),
      sortOrder: isFinite(so) && r[t.idx.SortOrder] !== '' ? so : 9999
    });
  });
  var groupOrder = {};
  list.forEach(function (o) {
    if (!groupOrder.hasOwnProperty(o.group) || o.sortOrder < groupOrder[o.group]) groupOrder[o.group] = o.sortOrder;
  });
  list.sort(function (a, b) {
    if (a.group !== b.group) return (groupOrder[a.group] - groupOrder[b.group]) || a.group.localeCompare(b.group);
    return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name);
  });
  return list;
}

/** OptionID -> option. */
function getOptionMap_() {
  var map = dict_();
  readOptions_().forEach(function (o) { map[o.id] = o; });
  return map;
}

/** ItemID -> icon, so the dashboard can show icons next to order lines. */
function getMenuIcons_() {
  var cached = cacheGet_('icons_v1');
  if (cached) return dict_(JSON.parse(cached));
  var icons = dict_();
  try {
    readMenu_().forEach(function (it) { icons[it.id] = it.icon; });
    cachePut_('icons_v1', JSON.stringify(icons), CONFIG.CACHE_SECONDS);
  } catch (e) {
    logError_('getMenuIcons_', e);   // icons are decoration only; never block the dashboard
  }
  return icons;
}

/** ItemID -> menu item. */
function getMenuMap_() {
  var map = dict_();
  readMenu_().forEach(function (it) { map[it.id] = it; });
  return map;
}

/** What the customer page needs to start. */
function getCustomerBootstrap() {
  return api_('getCustomerBootstrap', function () {
    var ctx = requireCustomer_();
    rateLimit_('bootstrap', ctx.email, 60, 600);
    var s = getSettings_();
    var rules = getRules_(ctx);
    var win = getOrderingWindow_(rules);
    var options = readOptions_().filter(function (o) { return o.available; })
      .map(function (o) { return { id: o.id, group: o.group, name: o.name, price: o.price }; });
    var menu = readMenu_()
      .filter(function (it) { return it.available; })
      .map(function (it) {
        return { id: it.id, name: it.name, price: it.price, category: it.category, icon: it.icon, tag: it.tag,
          customizable: it.customizable && options.length > 0 };
      });
    var pickup = pickupStatus_(null, rules);
    var open = win.open;
    var closedMessage = win.message;
    if (open && !pickup.available && !rules.deliveryEnabled) {
      open = false;
      closedMessage = pickup.message + ' Please check back soon.';
    }
    return {
      shopName: s.SHOP_NAME,
      currency: s.CURRENCY_SYMBOL,
      user: { email: ctx.email, suggestedName: nameFromEmail_(ctx.email), isShopStaff: ctx.isShopStaff },
      orderingOpen: open,
      closedMessage: closedMessage,
      options: options,
      hours: win.hours,
      menu: menu,
      rules: {
        deliveryEnabled: rules.deliveryEnabled,
        pickupAvailable: pickup.available,
        pickupMessage: pickup.message,
        maxOptionsPerItem: CONFIG.HARD_LIMITS.MAX_OPTIONS_PER_ITEM,
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

/** Staff: the full menu and drink options, including unavailable ones. */
function getMenuAdmin() {
  return api_('getMenuAdmin', function () {
    requireStaff_();
    return {
      items: readMenu_().map(function (it) {
        return { id: it.id, name: it.name, price: it.price, available: it.available, category: it.category, icon: it.icon, tag: it.tag };
      }),
      options: readOptions_().map(function (o) {
        return { id: o.id, group: o.group, name: o.name, price: o.price, available: o.available };
      })
    };
  });
}

/** Staff: turn one drink option (e.g. Honey) on or off. */
function setOptionAvailability(optionId, available) {
  return api_('setOptionAvailability', function () {
    var ctx = requireStaff_();
    var id = String(optionId || '').trim();
    if (!id || id.length > 40) throw new AppError('That option is not valid.');
    var on = available === true;
    withLock_(function () {
      var t = readTable_(CONFIG.SHEETS.OPTIONS, ['OptionID', 'Available']);
      var found = false;
      t.rows.forEach(function (r, i) {
        if (String(r[t.idx.OptionID] || '').trim() === id) {
          t.sheet.getRange(i + 2, t.idx.Available + 1).setValue(on);
          found = true;
        }
      });
      if (!found) throw new AppError('That option was not found. It may have been removed from the Options sheet.');
    });
    console.log(ctx.email + ' set option ' + id + ' available=' + on);
    return { id: id, available: on };
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
