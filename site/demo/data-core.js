/* SELLINTEL demo: synthetic, deterministic dataset (all fictional). */
(function () {
  'use strict';
  var D = (window.__DEMO = window.__DEMO || {});

  /* ---------- utilities ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var R = mulberry32(20261005);
  D.R = R;
  function ri(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
  function chance(p) { return R() < p; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r4(n) { return Math.round(n * 10000) / 10000; }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function uuid(prefix) {
    var h = '';
    for (var i = 0; i < 32; i++) h += '0123456789abcdef'[Math.floor(R() * 16)];
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
  }
  D.uuid = uuid;
  var liveSeq = 0;
  D.liveUuid = function () {
    // for rows created at runtime (does not disturb the seeded stream)
    liveSeq++;
    var h = (Date.now().toString(16) + pad(liveSeq.toString(16), 6) + 'abcdef0123456789abcdef').slice(0, 32);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
  };

  /* dates: everything relative to "today" in the viewer's local calendar */
  var NOW = new Date();
  D.now = NOW;
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
  var TODAY = ymd(NOW);
  D.today = TODAY;
  function parseYmd(s) { var p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDays(a, b) { return Math.round((parseYmd(a) - parseYmd(b)) / 86400000); }
  function isoAt(day, h, m, s) {
    var d = parseYmd(day); d.setHours(h, m || 0, s || 0, 0);
    return d.toISOString();
  }
  function isoDaysAgo(n, h) { return isoAt(addDays(TODAY, -n), h == null ? 10 : h, ri(0, 59), ri(0, 59)); }
  D.U = { mulberry32: mulberry32, ri: ri, pick: pick, chance: chance, r2: r2, r4: r4, pad: pad, ymd: ymd, parseYmd: parseYmd, addDays: addDays, diffDays: diffDays, isoAt: isoAt, isoDaysAgo: isoDaysAgo };
  var VAT = 1.2;
  D.VAT = VAT;
  // window starts on the 1st of the month three months back (about 3 to 4 months of history)
  var _fd = new Date(NOW.getFullYear(), NOW.getMonth() - 3, 1, 12, 0, 0);
  var FIRST_DAY = ymd(_fd);
  var DAYS = diffDays(TODAY, FIRST_DAY) + 1;
  D.DAYS = DAYS;
  D.firstDay = FIRST_DAY;

  /* ---------- workspace / identity ---------- */
  D.workspace = {
    id: '5a1b0c2d-0000-4000-a000-000000000001', slug: 'demo-workspace', name: 'Demo Trading Ltd',
    timezone: 'Europe/London', currency: 'GBP', marketplace: 'amazon_uk', is_active: true,
  };
  D.userId = '7d3e0f10-0000-4000-a000-0000000000d1';
  D.membership = { role: 'owner' };

  /* ---------- suppliers ---------- */
  var SUPPLIERS = [
    { code: 'NGW', name: 'Northgate Wholesale', site: 'https://northgate-wholesale.example', terms: 30, vat: true },
    { code: 'BLT', name: 'Brightline Trading', site: 'https://brightline-trading.example', terms: 14, vat: true },
    { code: 'HVD', name: 'Harbour & Vale Distribution', site: 'https://harbourvale.example', terms: 0, vat: true },
    { code: 'KHS', name: 'Kestrel Home Supplies', site: 'https://kestrel-home.example', terms: 30, vat: true },
    { code: 'MCC', name: 'Meridian Cash & Carry', site: 'https://meridian-cc.example', terms: 0, vat: false },
    { code: 'OTD', name: 'Oakridge Trade Direct', site: 'https://oakridge-trade.example', terms: 21, vat: true },
    { code: 'PBW', name: 'Pennine Beauty Wholesale', site: 'https://pennine-beauty.example', terms: 14, vat: true },
    { code: 'SBD', name: 'Silverbrook Distributors', site: 'https://silverbrook-dist.example', terms: 30, vat: true },
  ];
  SUPPLIERS.forEach(function (s, i) { s.id = uuid(); s.index = i; s.slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
  D.suppliers = SUPPLIERS;

  /* ---------- catalogue (~150 SKUs) ---------- */
  var BRANDS = ['Aurelia', 'Fernwood', 'Kindred Home', 'Bramble & Co', 'Lumenly', 'Tidewell', 'Hollis & Pike', 'Cedarline', 'Nimbus Pure', 'Marlowe', 'Quillon', 'Sorrel & Stone', 'Brightleaf', 'Northfield', 'Pebblebrook', 'Wrenfield'];
  // [category, root, type, code, sizes, price range, cost ratio, fba fee, ref%, weight g, supplier codes]
  var TYPES = [
    ['Skin Care', 'Health & Beauty', 'Hydrating Face Serum', 'SER', ['30ml', '50ml'], [8, 22], 0.38, 2.45, 0.15, 160, ['PBW', 'BLT']],
    ['Skin Care', 'Health & Beauty', 'Daily Moisturising Cream', 'CRM', ['50ml', '100ml', '200ml'], [5, 14], 0.36, 2.40, 0.15, 260, ['PBW', 'BLT']],
    ['Hair Care', 'Health & Beauty', 'Nourishing Shampoo', 'SHA', ['250ml', '400ml', '500ml'], [4, 10], 0.42, 2.55, 0.15, 520, ['PBW', 'NGW']],
    ['Hair Care', 'Health & Beauty', 'Smoothing Hair Mask', 'MSK', ['200ml', '300ml'], [6, 15], 0.37, 2.50, 0.15, 380, ['PBW']],
    ['Oral Care', 'Health & Beauty', 'Whitening Toothpaste', 'TPA', ['75ml', '100ml'], [2.5, 6], 0.45, 2.30, 0.08, 150, ['NGW', 'MCC']],
    ['Shaving', 'Health & Beauty', 'Sensitive Shaving Gel', 'SHV', ['200ml'], [3, 7], 0.43, 2.35, 0.15, 290, ['NGW', 'HVD']],
    ['Fragrance', 'Beauty', 'Eau de Toilette Spray', 'EDT', ['50ml', '100ml'], [14, 38], 0.40, 2.60, 0.15, 340, ['PBW', 'BLT']],
    ['Cleaning', 'Home & Kitchen', 'Multi-Surface Cleaner Spray', 'MSC', ['500ml', '750ml'], [2.5, 6], 0.44, 2.45, 0.15, 820, ['KHS', 'MCC']],
    ['Cleaning', 'Home & Kitchen', 'Laundry Detergent Pods', 'LDP', ['30 pack', '50 pack'], [7, 16], 0.46, 3.10, 0.15, 1300, ['KHS', 'HVD']],
    ['Cleaning', 'Home & Kitchen', 'Fabric Conditioner', 'FBC', ['1.5L', '2L'], [3.5, 8], 0.45, 3.05, 0.15, 2100, ['KHS', 'MCC']],
    ['Air Fresheners', 'Home & Kitchen', 'Plug-in Air Freshener Refill', 'AFR', ['2 pack', '3 pack'], [5, 11], 0.42, 2.35, 0.15, 160, ['KHS', 'OTD']],
    ['Candles', 'Home & Kitchen', 'Scented Soy Candle', 'CND', ['220g', '300g'], [6, 18], 0.35, 2.75, 0.15, 480, ['OTD', 'SBD']],
    ['Kitchen', 'Home & Kitchen', 'Non-Stick Frying Pan', 'FRY', ['24cm', '28cm'], [10, 24], 0.48, 3.60, 0.15, 1100, ['OTD', 'SBD']],
    ['Kitchen', 'Home & Kitchen', 'Glass Food Storage Set', 'GLS', ['3 piece', '5 piece'], [12, 28], 0.47, 3.80, 0.15, 2400, ['OTD', 'SBD']],
    ['Kitchen', 'Home & Kitchen', 'Cast Iron Casserole Dish', 'CIC', ['3.2L'], [32, 55], 0.50, 4.60, 0.15, 4600, ['SBD']],
    ['Pet Supplies', 'Pet Supplies', 'Natural Dog Treats', 'DGT', ['200g', '500g'], [4, 10], 0.46, 2.50, 0.15, 560, ['HVD', 'NGW']],
    ['Pet Supplies', 'Pet Supplies', 'Clumping Cat Litter', 'CLT', ['10L'], [8, 14], 0.52, 4.20, 0.15, 6200, ['HVD']],
    ['Baby', 'Baby Products', 'Sensitive Baby Wipes', 'BWP', ['3 x 64', '6 x 64'], [4, 11], 0.44, 2.90, 0.08, 1500, ['NGW', 'BLT']],
    ['Stationery', 'Office Products', 'A5 Hardback Notebook', 'NTB', ['Ruled', 'Dotted'], [4, 9], 0.38, 2.45, 0.15, 340, ['BLT', 'OTD']],
    ['Stationery', 'Office Products', 'Gel Pen Set', 'PEN', ['12 pack', '24 pack'], [4, 10], 0.36, 2.30, 0.15, 180, ['BLT']],
    ['Garden', 'Garden', 'Slow Release Plant Feed', 'PLF', ['1kg', '2kg'], [6, 15], 0.45, 3.20, 0.15, 2100, ['HVD', 'OTD']],
    ['Garden', 'Garden', 'Solar Garden Lights', 'SGL', ['4 pack', '8 pack'], [9, 24], 0.42, 3.30, 0.15, 900, ['SBD', 'OTD']],
    ['DIY', 'DIY & Tools', 'Multi-Purpose Sealant', 'SLT', ['290ml'], [3, 7], 0.44, 2.40, 0.15, 400, ['OTD', 'MCC']],
    ['DIY', 'DIY & Tools', 'Magnetic Screwdriver Set', 'SCD', ['32 piece', '60 piece'], [10, 22], 0.40, 3.00, 0.15, 650, ['SBD', 'OTD']],
    ['Health', 'Health & Beauty', 'Vitamin C Effervescent Tablets', 'VTC', ['20 tablets', '60 tablets'], [3, 9], 0.40, 2.30, 0.08, 150, ['NGW', 'PBW']],
    ['Grocery', 'Grocery', 'Herbal Tea Selection Box', 'TEA', ['40 bags', '80 bags'], [4, 11], 0.43, 2.60, 0.08, 280, ['MCC', 'HVD']],
    ['Grocery', 'Grocery', 'Dark Chocolate Gift Box', 'CHC', ['250g'], [6, 14], 0.45, 2.70, 0.08, 400, ['MCC', 'HVD']],
    ['Toys', 'Toys & Games', 'Wooden Puzzle', 'PZL', ['100 piece', '250 piece'], [7, 16], 0.42, 3.00, 0.15, 520, ['BLT', 'SBD']],
    ['Electronics', 'Electronics', 'USB-C Fast Charging Cable', 'USB', ['1m', '2m'], [5, 12], 0.34, 2.30, 0.15, 90, ['SBD', 'BLT']],
    ['Electronics', 'Electronics', 'Rechargeable AA Batteries', 'BAT', ['4 pack', '8 pack'], [8, 19], 0.44, 2.60, 0.15, 260, ['SBD', 'OTD']],
  ];
  D.BRANDS = BRANDS; D.TYPES = TYPES;
  var SUP_BY_CODE = {}; SUPPLIERS.forEach(function (s) { SUP_BY_CODE[s.code] = s; });
  var skus = [];
  var skuSeen = {};
  var idx = 0;
  while (skus.length < 150) {
    var t = TYPES[idx % TYPES.length];
    var brand = BRANDS[(idx * 5 + Math.floor(idx / TYPES.length) * 3) % BRANDS.length];
    var size = t[4][Math.floor(idx / TYPES.length + idx) % t[4].length];
    var key = brand + t[2] + size;
    idx++;
    if (skuSeen[key]) continue;
    skuSeen[key] = 1;
    var n = skus.length;
    var sup = SUP_BY_CODE[t[10][ri(0, t[10].length - 1)]];
    var price = r2(ri(Math.round(t[5][0] * 100), Math.round(t[5][1] * 100)) / 100);
    price = Math.floor(price) + (price % 1 > 0.5 ? 0.99 : 0.49); // charm prices
    if (price < 2.49) price = 2.49;
    var heavy = t[9] > 4000;
    var fba = heavy ? chance(0.3) : chance(0.72);
    var cost = r2(price * t[6] * (0.85 + R() * 0.3));
    var weight = Math.round(t[9] * (0.85 + R() * 0.3) + (size.indexOf('L') >= 0 ? 150 : 0));
    var s = {
      n: n,
      sku: sup.code + '-' + brand.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() + '-' + t[3] + String(size).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) + (fba ? '-FBA' : ''),
      asin: 'B0DEMO' + (n + 46656).toString(36).toUpperCase(),
      brand: brand, category: t[0], root_category: t[1],
      title: brand + ' ' + t[2] + ' ' + size + (t[2].indexOf('Pack') < 0 && chance(0.25) ? ', Pack of 2' : ''),
      fulfillment: fba ? 'FBA' : 'FBM',
      price: price, cost: cost, vatRecoverable: sup.vat, prepManual: null,
      ref: t[8], fbaFee: r2(t[7] * (0.9 + R() * 0.2)), weight_g: weight,
      supplier: sup, typeCode: t[3],
      // demand
      vel: Math.pow(R(), 2.2) * 2.4 + 0.12,
      rank: ri(1200, 140000), monthly: ri(40, 1400), sellers: ri(1, 14),
      // states used for the "attention" flags
      costMissing: false, feeMissing: false, weightMissing: false, costSource: 'manual',
      fulfillable: 0, inbound: 0, reserved: 0, unfulfillable: 0, researching: 0, fbmQty: 0,
      ean: '50' + pad(ri(0, 99999999999), 11),
    };
    skus.push(s);
  }
  // sku uniqueness safety
  (function () { var seen = {}; skus.forEach(function (s) { while (seen[s.sku]) s.sku += 'X'; seen[s.sku] = 1; }); })();

  // ~15% with missing cost, ~5% with missing fee, some FBM missing weight
  skus.forEach(function (s, i) {
    var x = R();
    if (x < 0.14) { s.costMissing = true; s.costBackup = s.cost; s.cost = null; s.costSource = null; }
    else if (x < 0.30) s.costSource = chance(0.5) ? 'purchase' : 'inventory_default';
    if (chance(0.05) && !s.costMissing) s.feeMissing = true;
    if (s.fulfillment === 'FBM' && chance(0.2)) { s.weightMissing = true; s.weightBackup = s.weight_g; }
    if (chance(0.25) && s.cost != null && !s.costMissing) s.prepManual = pick([0.1, 0.15, 0.2, 0.25]);
    // stock
    if (s.fulfillment === 'FBA') {
      s.fulfillable = Math.max(0, Math.round(s.vel * ri(8, 70)));
      s.inbound = chance(0.3) ? ri(20, 200) : 0;
      s.reserved = Math.round(s.vel * ri(0, 3));
      s.unfulfillable = chance(0.08) ? ri(1, 6) : 0;
      s.researching = chance(0.04) ? ri(1, 5) : 0;
    } else {
      s.fbmQty = Math.max(0, Math.round(s.vel * ri(10, 60)));
    }
    s.buyBox = r2(s.price * (0.97 + R() * 0.08));
  });
  D.skus = skus;
  D.skuByKey = {}; skus.forEach(function (s) { D.skuByKey[s.sku] = s; });
  D.skuByAsin = {}; skus.forEach(function (s) { D.skuByAsin[s.asin] = s; });
  D.imageFor = function (s) { return null; }; // no external images
  D.weightOf = function (s) { return s.weightMissing ? null : s.weight_g; };

  /* ---------- derived cost helpers ---------- */
  D.unitCostGross = function (s) { return s.cost; };
  D.prepOf = function (s) { return s.prepManual != null ? s.prepManual : 0.1; };
  D.postageOf = function (s) { // FBM postage rule, ex VAT
    if (s.fulfillment !== 'FBM') return 0;
    var w = D.weightOf(s);
    if (w == null) return null;
    return w <= 2000 ? 1.95 : (w <= 15000 ? 2.5 : null);
  };
})();
