/**
 * Products.gs — the Products sheet. Prices ALWAYS come from here.
 *
 * Columns: ProductID | Name | Description | Price | Available | DailyLimit |
 *          Allergens | DietaryTags | ImageURL | SortOrder
 *   ProductID    short unique code, e.g. CHOC_CHIP. Never change it once used.
 *   Available    checkbox. Unticked = sold out / hidden from teachers.
 *   DailyLimit   optional. Max of this cookie sold per day (blank or 0 = no limit).
 *   Allergens    e.g. "Wheat, Milk, Eggs, Soy".
 *   DietaryTags  comma list, e.g. "vegan, nut-free".
 *   ImageURL     optional https:// link to a photo.
 *
 * Adding a cookie = adding a row. No code changes. The customer page switches
 * from the single-cookie layout to the multi-cookie layout automatically.
 */

var productsMemo_ = null;

/** All valid product rows, sorted (cached; cleared when the sheet is edited). */
function readProducts_() {
  if (productsMemo_) return productsMemo_;
  var cached = cacheGet_('products_v1');
  if (cached) { productsMemo_ = JSON.parse(cached); return productsMemo_; }
  var t = readTable_(CONFIG.SHEETS.PRODUCTS, ['ProductID', 'Name', 'Price', 'Available']);
  var seen = dict_();
  var list = [];
  t.rows.forEach(function (r, i) {
    var id = String(r[t.idx.ProductID] || '').trim();
    var name = cleanText_(r[t.idx.Name], 60);
    var price = Number(r[t.idx.Price]);
    if (!id && !name) return;
    if (!id || id.length > 40 || !name || r[t.idx.Price] === '' || !isFinite(price) || price < 0 || id in seen) {
      console.warn('Skipping invalid or duplicate Products row ' + (i + 2));
      return;
    }
    seen[id] = true;
    var col = function (h) { return (h in t.idx) ? r[t.idx[h]] : ''; };
    var limit = Number(col('DailyLimit'));
    var img = String(col('ImageURL') || '').trim();
    var so = Number(col('SortOrder'));
    list.push({
      id: id,
      name: name,
      description: cleanText_(col('Description'), 300),
      price: centsToAmount_(toCents_(price)),
      available: isTrue_(col('Available')),
      dailyLimit: isFinite(limit) && limit > 0 ? Math.floor(limit) : 0,
      allergens: cleanText_(col('Allergens'), 200),
      dietaryTags: splitListKeepCase_(cleanText_(col('DietaryTags'), 200)),
      imageUrl: /^https:\/\/[^\s"'<>]+$/i.test(img) ? img : '',
      sortOrder: col('SortOrder') !== '' && isFinite(so) ? so : 9999,
      row: i + 2
    });
  });
  list.sort(function (a, b) { return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name); });
  productsMemo_ = list;
  cachePut_('products_v1', JSON.stringify(list), CONFIG.CACHE_SECONDS);
  return list;
}

function isTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/** ProductID -> product. */
function getProductMap_() {
  var map = dict_();
  readProducts_().forEach(function (p) { map[p.id] = p; });
  return map;
}

/** Product shape sent to browsers, with today's availability. */
function productForClient_(p, soldToday) {
  var s = getSettings_();
  var left = p.dailyLimit ? Math.max(0, p.dailyLimit - (soldToday || 0)) : null;
  return {
    id: p.id, name: p.name, description: p.description, price: p.price,
    available: p.available && left !== 0,
    allergens: p.allergens, dietaryTags: p.dietaryTags, imageUrl: p.imageUrl,
    dailyLimit: p.dailyLimit, soldToday: soldToday || 0, left: left,
    lowStock: left !== null && left > 0 && left <= s.LOW_STOCK_THRESHOLD
  };
}

/* ---------------------------------------------------------- staff controls */

/** Staff: mark a cookie available / sold out. */
function setProductAvailable(productId, available) {
  return api_('setProductAvailable', function () {
    var ctx = requireStaff_();
    var id = String(productId || '').trim();
    if (!id || id.length > 40) throw new AppError(t_('server.productNotFound'));
    var on = available === true;
    withLock_(function () { writeProductCell_(id, 'Available', on); });
    console.log(ctx.email + ' set product ' + id + ' available=' + on);
    return { id: id, available: on };
  });
}

/** Staff: change a cookie's daily limit (0 = no limit). */
function setProductDailyLimit(productId, limit) {
  return api_('setProductDailyLimit', function () {
    var ctx = requireStaff_();
    var id = String(productId || '').trim();
    if (!id || id.length > 40) throw new AppError(t_('server.productNotFound'));
    var n = Number(limit);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new AppError(t_('server.limitInvalid', { max: 100000 }));
    withLock_(function () { writeProductCell_(id, 'DailyLimit', n || ''); });
    touchOrdersVersion_();
    console.log(ctx.email + ' set product ' + id + ' daily limit=' + n);
    return { id: id, dailyLimit: n };
  });
}

/** Writes one cell of a product row. Caller holds the lock. */
function writeProductCell_(id, header, value) {
  var t = readTable_(CONFIG.SHEETS.PRODUCTS, ['ProductID', header]);
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][t.idx.ProductID] || '').trim() === id) {
      t.sheet.getRange(i + 2, t.idx[header] + 1).setValue(value);
      clearCaches_();
      return;
    }
  }
  throw new AppError(t_('server.productNotFound'));
}
