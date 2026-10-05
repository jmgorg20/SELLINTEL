/* SELLINTEL demo: orders, order lines, refunds, returns, reimbursements, shipments, payouts. */
(function () {
  'use strict';
  var D = window.__DEMO, U = D.U, R = D.R, VAT = D.VAT;
  var ri = U.ri, pick = U.pick, chance = U.chance, r2 = U.r2, pad = U.pad, addDays = U.addDays, isoAt = U.isoAt;
  var skus = D.skus;
  D.version = 1; // bump after any mutation that changes derived numbers

  function orderId() { return pad(ri(200, 408), 3) + '-' + pad(ri(0, 9999999), 7) + '-' + pad(ri(0, 9999999), 7); }

  // weights for choosing SKUs
  var cum = [], tot = 0;
  skus.forEach(function (s) { tot += s.vel; cum.push(tot); });
  function pickSku() { var x = R() * tot; for (var i = 0; i < cum.length; i++) if (x <= cum[i]) return skus[i]; return skus[skus.length - 1]; }

  var rawOrders = []; // {id, ts, day, lines:[{item,sku,qty,price}], status, fulfilled_by, mp}
  var used = {};
  var nowHour = D.now.getHours();
  for (var back = D.DAYS - 1; back >= 0; back--) {
    var day = addDays(D.today, -back);
    var dow = U.parseYmd(day).getDay();
    var base = 26 + (dow === 0 ? -6 : dow === 6 ? -3 : dow === 1 ? 4 : 0) + Math.round((D.DAYS - back) / D.DAYS * 5);
    var nOrders = Math.max(8, base + ri(-6, 8));
    if (back === 0) nOrders = Math.max(3, Math.round(nOrders * (nowHour + 1) / 24));
    for (var o = 0; o < nOrders; o++) {
      var id; do { id = orderId(); } while (used[id]); used[id] = 1;
      var hour = back === 0 ? ri(0, nowHour) : ri(0, 23);
      var ts = isoAt(day, hour, ri(0, 59), ri(0, 59));
      var nl = chance(0.14) ? 2 : 1;
      var lines = [];
      var seenSku = {};
      for (var l = 0; l < nl; l++) {
        var s = pickSku(); if (seenSku[s.sku]) continue; seenSku[s.sku] = 1;
        var qty = chance(0.82) ? 1 : (chance(0.7) ? 2 : ri(3, 5));
        var promo = chance(0.1) ? 0.92 : 1;
        lines.push({ item: D.uuid(), sku: s, qty: qty, price: r2(s.price * promo) });
      }
      var anyFbm = lines.some(function (x) { return x.sku.fulfillment === 'FBM'; });
      var fresh = back <= 1;
      var status = anyFbm && fresh && chance(0.55) ? 'Unshipped' : (back === 0 && chance(0.12) ? 'Pending' : 'Shipped');
      var mp = chance(0.955) ? 'A1F83G8C2ARO7P' : pick(['A28R8C7NBKEWEA', 'A1PA6795UKMFR9', 'A13V1IB3VIYZZH']);
      rawOrders.push({ id: id, ts: ts, day: day, lines: lines, status: status, fulfilled_by: anyFbm ? 'MERCHANT' : 'AMAZON', mp: mp });
    }
  }
  rawOrders.sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  D.rawOrders = rawOrders;

  // refunds (stored on the raw line)
  var refunds = [];
  rawOrders.forEach(function (o) {
    o.lines.forEach(function (l) {
      if (o.status === 'Pending') return;
      if (!chance(0.032)) return;
      var rd = addDays(o.day, ri(4, 22));
      if (rd > D.today) return;
      var partial = chance(0.3) || l.qty > 1 && chance(0.4);
      var units = partial && l.qty > 1 ? 1 : l.qty;
      var principal = partial && l.qty === 1 ? r2(l.price * 0.4) : r2(l.price * units);
      l.refund = { kind: partial ? 'partial' : 'full', units: partial && l.qty === 1 ? 0 : units, principal: principal, date: rd };
      refunds.push({ order: o, line: l });
    });
  });
  D.refundsRaw = refunds;

  /* ---------- order line computation (depends on current SKU state) ---------- */
  var cache = { v: -1, lines: null };
  D.lines = function () {
    if (cache.v === D.version) return cache.lines;
    var out = [];
    var recentCut = addDays(D.today, -14);
    rawOrders.forEach(function (o) {
      o.lines.forEach(function (l) {
        var s = l.sku, q = l.qty;
        var gross = r2(l.price * q), net = r2(gross / VAT);
        var costMissing = s.cost == null;
        var feeMissing = !!s.feeMissing;
        var pu = D.postageOf(s);
        var postageMissing = s.fulfillment === 'FBM' && pu == null;
        var fee = feeMissing ? null : r2(gross * s.ref * 1.02 + (s.fulfillment === 'FBA' ? s.fbaFee * q : 0));
        var cogsGross = costMissing ? null : r2(s.cost * q);
        var cogsNet = costMissing ? null : r2((s.vatRecoverable ? s.cost / VAT : s.cost) * q);
        var prep = r2(D.prepOf(s) * q);
        var post = s.fulfillment === 'FBM' ? (postageMissing ? null : r2(pu * q)) : 0;
        var complete = !costMissing && !feeMissing && !postageMissing;
        var profit = complete ? r2(net - fee - cogsNet - prep - post) : null;
        var roi = complete && cogsNet + prep > 0 ? r2(profit / (cogsNet + prep) * 100) : null;
        var roiInc = complete && cogsGross + prep > 0 ? r2(profit / (cogsGross + prep) * 100) : null;
        var margin = complete && net > 0 ? r2(profit / net * 100) : null;
        var refUnits = l.refund ? (l.refund.kind === 'full' ? q : l.refund.units) : 0;
        out.push({
          order_item_id: l.item, amazon_order_id: o.id, purchase_date: o.ts, sale_date: o.day,
          order_status: o.status, fulfillment_class: s.fulfillment, seller_sku: s.sku, asin: s.asin, title: s.title,
          inventory_item_id: s.invId, quantity: q,
          revenue_gross_gbp: gross, revenue_net_gbp: net, amazon_fees_net_gbp: fee,
          fee_source: feeMissing ? null : (o.day < recentCut ? 'amazon_actual' : (chance01(l.item) ? 'amazon_estimate' : 'keepa_estimate')),
          unit_cost_gross_gbp: costMissing ? null : s.cost, cost_source: costMissing ? null : s.costSource,
          cogs_net_gbp: cogsNet, cogs_gross_gbp: cogsGross, prep_gbp: prep, fbm_postage_gbp: post,
          profit_gbp: profit, roi_pct: roi, margin_pct: margin, roi_inc_vat_pct: roiInc,
          cost_missing: costMissing, fee_missing: feeMissing, postage_missing: postageMissing,
          // internal helpers (stripped before sending)
          _o: o, _l: l, _refUnits: refUnits, _mp: o.mp, _complete: complete,
        });
      });
    });
    cache.v = D.version; cache.lines = out;
    return out;
  };
  function chance01(k) { var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; return (h & 1) === 0; }
  D.pubLine = function (l) {
    var o = {}; for (var k in l) if (k.charAt(0) !== '_') o[k] = l[k]; return o;
  };

  /* ---------- per-SKU stats over lines (used by many pages) ---------- */
  D.lastSold = {};
  rawOrders.forEach(function (o) { o.lines.forEach(function (l) { var p = D.lastSold[l.sku.sku]; if (!p || o.ts > p) D.lastSold[l.sku.sku] = o.ts; }); });
  D.units30 = function (s) {
    var cut = addDays(D.today, -29), n = 0;
    rawOrders.forEach(function (o) { if (o.day >= cut) o.lines.forEach(function (l) { if (l.sku === s) n += l.qty; }); });
    return n;
  };
  // update stock figures so they remain plausible against sales (units shipped etc.)
  D.units30Map = (function () {
    var cut = addDays(D.today, -29), m = {};
    rawOrders.forEach(function (o) { if (o.day >= cut) o.lines.forEach(function (l) { m[l.sku.sku] = (m[l.sku.sku] || 0) + l.qty; }); });
    return m;
  })();
  skus.forEach(function (s) {
    var u = D.units30Map[s.sku] || 0, perDay = u / 30;
    if (s.fulfillment === 'FBA') {
      s.fulfillable = Math.max(0, Math.round(perDay * ri(6, 75)) + ri(0, 4));
      if (chance(0.06)) s.fulfillable = 0; // a few out of stock
      s.reserved = Math.min(s.fulfillable, Math.round(perDay * ri(0, 2)));
      s.inbound = chance(0.22) ? Math.max(6, Math.round(perDay * ri(12, 40))) : 0;
    } else {
      s.fbmQty = Math.max(0, Math.round(perDay * ri(8, 60)) + ri(0, 5));
    }
  });

  /* ---------- returns, reimbursements ---------- */
  var returns = [];
  refunds.forEach(function (r) {
    if (r.line.sku.fulfillment === 'FBA' && chance(0.8) || chance(0.4)) {
      var rd = addDays(r.line.refund.date, ri(1, 6)); if (rd > D.today) rd = D.today;
      returns.push({
        amazon_order_id: r.order.id, seller_sku: r.line.sku.sku, asin: r.line.sku.asin, fnsku: 'X00' + r.line.sku.asin.slice(3),
        quantity: Math.max(1, r.line.refund.units || 1),
        reason: pick(['Not as described', 'No longer needed', 'Damaged in transit', 'Wrong item sent', 'Changed mind', 'Defective', 'Item arrived too late']),
        disposition: pick(['SELLABLE', 'SELLABLE', 'CUSTOMER_DAMAGED', 'DEFECTIVE', 'CARRIER_DAMAGED']),
        status: pick(['Unit returned to inventory', 'Unit returned to inventory', 'Reimbursed', 'Pending']),
        returned_at: isoAt(rd, ri(7, 17), ri(0, 59)),
      });
    }
  });
  returns.sort(function (a, b) { return a.returned_at < b.returned_at ? 1 : -1; });
  D.returns = returns;

  var reimb = [];
  var REASONS = [['Lost_Warehouse', 8], ['Damaged_Warehouse', 5], ['CustomerReturn', 6], ['Reimbursement_Reversal', 1]];
  for (var ri_ = 0; ri_ < 26; ri_++) {
    var s = pickSku(); var rr = pick(REASONS.map(function (x) { return x[0]; }).concat(['Lost_Warehouse', 'Damaged_Warehouse']));
    var q = rr === 'Reimbursement_Reversal' ? -1 : ri(1, 4);
    var amt = r2(Math.abs(q) * (s.cost != null ? s.cost : s.price * 0.4) * (rr === 'CustomerReturn' ? 1.5 : 1) * (rr === 'Reimbursement_Reversal' ? -1 : 1));
    reimb.push({
      reimbursement_id: String(ri(2000000000, 2999999999)), case_id: chance(0.6) ? String(ri(10000000000, 19999999999)) : null,
      amazon_order_id: rr === 'CustomerReturn' ? orderId() : null, seller_sku: s.sku, fnsku: 'X00' + s.asin.slice(3), asin: s.asin,
      reason: rr, quantity_reimbursed: q, amount_gbp: amt, reimbursement_date: isoAt(addDays(D.today, -ri(1, D.DAYS - 2)), 0, 0, 0),
    });
  }
  reimb.sort(function (a, b) { return a.reimbursement_date < b.reimbursement_date ? 1 : -1; });
  D.reimb = reimb;

  /* ---------- FBA inbound shipments ---------- */
  var ships = [];
  var NAMES = ['FBA STA', 'Inbound', 'Restock', 'Replen'];
  var DEST = ['LTN4', 'BHX4', 'MAN1', 'EUK5', 'LBA4', 'EDI4', 'BHX1', 'XUKD'];
  var fbaSkus = skus.filter(function (s) { return s.fulfillment === 'FBA'; });
  for (var i = 0; i < 26; i++) {
    var created = addDays(D.today, -Math.round(i * (D.DAYS - 2) / 26) - ri(0, 2));
    var n = ri(1, 5), picked = [], seen = {};
    for (var j = 0; j < n; j++) { var sk = pick(fbaSkus); if (!seen[sk.sku]) { seen[sk.sku] = 1; picked.push(sk); } }
    var age = U.diffDays(D.today, created);
    var statusKey = age < 4 ? pick(['WORKING', 'SHIPPED', 'IN_TRANSIT']) : age < 9 ? pick(['RECEIVING', 'IN_TRANSIT', 'DELIVERED', 'CLOSED']) : (chance(0.04) ? 'CANCELLED' : 'CLOSED');
    var items = picked.map(function (sk) {
      var shipped = ri(24, 240);
      var recv = statusKey === 'CLOSED' || statusKey === 'DELIVERED' ? (chance(0.18) ? shipped - ri(1, 8) : shipped) : statusKey === 'RECEIVING' ? Math.round(shipped * R() * 0.8) : 0;
      if (statusKey === 'CANCELLED') { shipped = 0; recv = 0; }
      return { seller_sku: sk.sku, fnsku: 'X00' + sk.asin.slice(3), asin: sk.asin, title: sk.title, quantity_shipped: shipped, quantity_received: recv, difference: recv - shipped, image_url: null };
    });
    var us = items.reduce(function (a, b) { return a + b.quantity_shipped; }, 0), ur = items.reduce(function (a, b) { return a + b.quantity_received; }, 0);
    var recon = statusKey === 'CANCELLED' ? 'cancelled' : (statusKey === 'CLOSED' || statusKey === 'DELIVERED') ? (ur === us ? 'matched' : ur < us ? 'short_received' : 'over_received') : statusKey === 'RECEIVING' ? 'receiving' : 'in_transit';
    var tracked = statusKey !== 'WORKING';
    var id = 'FBA15' + ('0000' + ri(0, 1679615).toString(36).toUpperCase()).slice(-6) + ['', 'X', 'Z'][ri(0, 2)];
    ships.push({
      shipment_record_id: D.uuid(), amazon_shipment_id: id, shipment_name: NAMES[ri(0, 3)] + ' (' + U.ymd(U.parseYmd(created)).slice(5).replace('-', '/') + ') #' + (i + 1),
      shipment_status: statusKey, destination: pick(DEST), created_at: isoAt(created, ri(8, 17), ri(0, 59)),
      last_synced_at: isoAt(D.today, 5, ri(0, 30)), expected_arrival_at: statusKey === 'IN_TRANSIT' || statusKey === 'WORKING' ? isoAt(addDays(D.today, ri(1, 6)), 12, 0) : null,
      inbound_plan_id: 'wf' + D.uuid().slice(0, 8), v2024_shipment_id: 'sh' + D.uuid().slice(0, 8),
      sku_count: items.length, units_shipped: us, units_received: ur, units_difference: ur - us,
      receipt_tracking: tracked, reconciliation_status: recon, tracking_ids: statusKey === 'WORKING' ? [] : ['JD' + ri(1000000000, 9999999999) + 'GB'],
      _items: items, last_receipt_at: ur > 0 ? isoAt(addDays(created, ri(3, 8) > age ? 0 : ri(3, 8)), 10, 0) : null,
    });
  }
  ships.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  ships.forEach(function (s) { if (s.last_receipt_at && s.last_receipt_at > new Date().toISOString()) s.last_receipt_at = new Date().toISOString(); });
  D.ships = ships;

  /* ---------- listings / stranded ---------- */
  var listings = skus.map(function (s) {
    var inactive = chance(0.05), incomplete = chance(0.03);
    return {
      seller_sku: s.sku, asin: s.asin, title: s.title, price_gbp: s.price, quantity: s.fulfillment === 'FBM' ? s.fbmQty : 0,
      status: incomplete ? 'Incomplete' : inactive ? 'Inactive' : 'Active', fulfillment_channel: s.fulfillment === 'FBA' ? 'AMAZON_EU' : 'DEFAULT',
      listing_id: 'L' + pad(s.n * 7919 % 100000000, 9), open_date_text: U.ymd(U.parseYmd(addDays(D.today, -ri(30, 600)))), in_latest_report: true,
      report_created_at: isoAt(D.today, 4, 12), updated_at: isoAt(D.today, 4, 20),
    };
  });
  D.listings = listings;
  D.stranded = (function () {
    var out = [];
    var cands = fbaSkus.slice().sort(function () { return R() - 0.5; }).slice(0, 7);
    var REASONS2 = ['Listing closed', 'Missing product information', 'Missing item attributes', 'Restricted product', 'Listing suppressed'];
    cands.forEach(function (s, i) {
      out.push({
        seller_sku: s.sku, asin: s.asin, fnsku: 'X00' + s.asin.slice(3), product_name: s.title,
        primary_action: pick(['Create removal order', 'Fix listing', 'Reactivate listing']), stranded_reason: pick(REASONS2),
        status_primary: 'Stranded', status_secondary: pick(['Inactive', 'Incomplete listing', 'Suppressed']), error_message: i % 3 === 0 ? 'Missing required attribute: product_type' : null,
        date_stranded: isoAt(addDays(D.today, -ri(5, 70)), 0, 0), auto_removal_date: i % 2 === 0 ? isoAt(addDays(D.today, ri(5, 60)), 0, 0) : null,
        fulfillable_qty: ri(0, 40), unfulfillable_qty: ri(0, 4), reserved_qty: 0, inbound_shipped_qty: ri(0, 12), your_price_gbp: s.price,
        report_created_at: isoAt(D.today, 4, 0), updated_at: isoAt(D.today, 4, 5),
      });
    });
    return out;
  })();
})();
