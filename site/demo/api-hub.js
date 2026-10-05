/* SELLINTEL demo: Seller Hub actions (answered in the browser from the synthetic dataset). */
(function () {
  'use strict';
  var D = window.__DEMO, U = D.U, VAT = D.VAT;
  var r2 = U.r2, addDays = U.addDays, isoAt = U.isoAt;
  var H = (D.hub = {});
  function UserError(msg, code) { var e = new Error(msg); e.userError = true; e.code = code || 'invalid_request'; e.status = 400; return e; }
  D.UserError = UserError;
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function sum(arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) { var v = f(arr[i]); if (v != null && isFinite(v)) t += v; } return t; }
  function nn(v) { return v == null ? null : r2(v); }
  function between(from, to, arr, key) { return arr.filter(function (x) { var d = String(x[key]).slice(0, 10); return d >= from && d <= to; }); }
  function parseDate(v) { var t = String(v || ''); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; }
  function range(body, dflt) {
    var to = parseDate(body.to) || D.today, from = parseDate(body.from) || addDays(to, -((dflt || 30) - 1));
    if (from > to) throw UserError('A valid date range (max 400 days) is required.');
    if (U.diffDays(to, from) + 1 > 400) throw UserError('A valid date range (max 400 days) is required.');
    return { from: from, to: to };
  }
  H.range = range;
  function lines(from, to) { return D.lines().filter(function (l) { return l.sale_date >= from && l.sale_date <= to; }); }
  H.lines = lines;
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function paginate(rows, body, dlim, maxlim) {
    var limit = Math.max(1, Math.min(num(body.limit, dlim) || dlim, maxlim)), offset = Math.max(0, num(body.offset, 0));
    return { limit: limit, offset: offset, rows: rows.slice(offset, offset + limit) };
  }
  function searchFilter(rows, q, keys) {
    q = String(q || '').trim().toLowerCase(); if (!q) return rows;
    return rows.filter(function (r) { return keys.some(function (k) { return String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0; }); });
  }
  function ts() { return new Date().toISOString(); }

  /* ---------- aggregate for dashboard ---------- */
  function aggregate(from, to) {
    var L = lines(from, to);
    var complete = L.filter(function (l) { return l._complete; });
    var orders = {}; L.forEach(function (l) { orders[l.amazon_order_id] = 1; });
    var refundsInRange = D.refundsRaw.filter(function (r) { return r.line.refund.date >= from && r.line.refund.date <= to; });
    var refundedSales = sum(L, function (l) { return l._l.refund ? l._l.refund.principal : 0; });
    var refundedUnits = sum(L, function (l) { return l._refUnits; });
    var gross = sum(L, function (l) { return l.revenue_gross_gbp; });
    var grossUnits = sum(L, function (l) { return l.quantity; });
    var profit = sum(complete, function (l) { return l.profit_gbp; });
    var cnet = sum(complete, function (l) { return l.revenue_net_gbp; });
    var costBase = sum(complete, function (l) { return l.cogs_net_gbp + l.prep_gbp; });
    var costBaseInc = sum(complete, function (l) { return l.cogs_gross_gbp + l.prep_gbp; });
    var costMissingSkus = {}; L.forEach(function (l) { if (l.cost_missing) costMissingSkus[l.seller_sku] = 1; });
    var salesGross = gross - refundedSales;
    var reimbSum = sum(between(from, to, D.reimb, 'reimbursement_date'), function (x) { return x.amount_gbp; });
    var cov = {
      lines: L.length, lines_actual_fees: L.filter(function (l) { return l.fee_source === 'amazon_actual'; }).length,
      lines_cost_missing: L.filter(function (l) { return l.cost_missing; }).length,
      lines_estimated_fees: L.filter(function (l) { return l.fee_source && l.fee_source !== 'amazon_actual'; }).length,
      lines_fee_missing: L.filter(function (l) { return l.fee_missing; }).length, lines_postage_missing: L.filter(function (l) { return l.postage_missing; }).length,
      lines_with_profit: complete.length, sales_share_with_profit_pct: gross > 0 ? r2(sum(complete, function (l) { return l.revenue_gross_gbp; }) / gross * 100) : 100,
      skus_cost_missing: Object.keys(costMissingSkus).length,
    };
    var allKnown = cov.lines_with_profit === cov.lines;
    var advertising = -r2(salesGross * 0.026), otherFees = -r2(grossUnits * 0.04);
    var finance = { advertising_gbp: advertising, amazon_other_fees_gbp: otherFees, refund_count: refundsInRange.length, refunds_gbp: -r2(sum(refundsInRange, function (r) { return r.line.refund.principal; })), reimbursements_gbp: r2(reimbSum) };
    var cur = {
      amazon_fees_gbp: r2(sum(L, function (l) { return l.amazon_fees_net_gbp; })), cogs_gbp: r2(sum(L, function (l) { return l.cogs_net_gbp; })), coverage: cov,
      fbm_postage_gbp: r2(sum(L, function (l) { return l.fbm_postage_gbp; })), finance: finance, gross_sales_gbp: r2(gross), gross_units: grossUnits,
      margin_pct: cnet > 0 ? r2(profit / cnet * 100) : null, net_profit_blocked_reason: allKnown ? null : 'Some order lines have no cost price, Amazon fee or postage weight yet.',
      net_profit_gbp: allKnown ? r2(profit + finance.refunds_gbp + advertising + otherFees + reimbSum) : null, orders: Object.keys(orders).length, period_adjustments_gbp: 0,
      prep_gbp: r2(sum(L, function (l) { return l.prep_gbp; })), profit_complete: allKnown, profit_gbp: r2(profit), profit_lines_sales_gbp: r2(sum(complete, function (l) { return l.revenue_gross_gbp; })),
      refunded_sales_gbp: r2(refundedSales), refunded_units: refundedUnits, roi_inc_vat_pct: costBaseInc > 0 ? r2(profit / costBaseInc * 100) : null, roi_pct: costBase > 0 ? r2(profit / costBase * 100) : null,
      sales_gbp: r2(salesGross), sales_net_gbp: r2(salesGross / VAT), units: grossUnits - refundedUnits,
    };
    return cur;
  }
  H.aggregate = aggregate;
  function dailySeries(from, to) {
    var out = [], d = from;
    var by = {};
    lines(from, to).forEach(function (l) { (by[l.sale_date] = by[l.sale_date] || []).push(l); });
    while (d <= to) {
      var ls = by[d] || [], ord = {}; ls.forEach(function (l) { ord[l.amazon_order_id] = 1; });
      out.push({ date: d, orders: Object.keys(ord).length, units: sum(ls, function (l) { return l.quantity - l._refUnits; }), sales_gbp: r2(sum(ls, function (l) { return l.revenue_gross_gbp - (l._l.refund ? l._l.refund.principal : 0); })), profit_gbp: r2(sum(ls, function (l) { return l.profit_gbp; })), profit_complete: ls.every(function (l) { return l._complete; }) });
      d = addDays(d, 1);
    }
    return out;
  }
  function topProducts(from, to, n) {
    var m = {};
    lines(from, to).forEach(function (l) {
      var x = m[l.seller_sku] = m[l.seller_sku] || { asin: l.asin, seller_sku: l.seller_sku, title: l.title, units: 0, sales_gbp: 0, profit: 0, complete: true, cost_missing: false, refunded_units: 0 };
      x.units += l.quantity - l._refUnits; x.sales_gbp += l.revenue_gross_gbp - (l._l.refund ? l._l.refund.principal : 0); x.refunded_units += l._refUnits;
      if (l._complete) x.profit += l.profit_gbp; else x.complete = false;
      if (l.cost_missing) x.cost_missing = true;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.sales_gbp - a.sales_gbp; }).slice(0, n).map(function (x) {
      return { asin: x.asin, seller_sku: x.seller_sku, title: x.title, units: x.units, sales_gbp: r2(x.sales_gbp), profit_gbp: x.cost_missing && x.profit === 0 ? null : r2(x.profit), profit_complete: x.complete, cost_missing: x.cost_missing, refunded_units: x.refunded_units, image_url: null };
    });
  }

  /* ---------- handlers ---------- */
  var A = (H.actions = {});

  A.dashboard_summary = function (b) {
    var r = range(b, 30), days = U.diffDays(r.to, r.from) + 1;
    var pTo = addDays(r.from, -1), pFrom = addDays(pTo, -(days - 1));
    var cur = aggregate(r.from, r.to), prev = aggregate(pFrom, pTo);
    return { summary: { current: cur, previous: prev, daily: dailySeries(r.from, r.to), generated_at: ts(), notes: [], period: { days: days, from: r.from, to: r.to }, previous_period: { from: pFrom, to: pTo }, top_products: topProducts(r.from, r.to, 10) } };
  };
  A.dashboard_marketplaces = function (b) {
    var r = range(b, 30), m = {};
    lines(r.from, r.to).forEach(function (l) { var x = m[l._mp] = m[l._mp] || { marketplace_id: l._mp, sales: 0, units: 0, profit: 0, complete: true }; x.sales += l.revenue_gross_gbp - (l._l.refund ? l._l.refund.principal : 0); x.units += l.quantity - l._refUnits; if (l._complete) x.profit += l.profit_gbp; else x.complete = false; });
    return { data: Object.keys(m).map(function (k) { var x = m[k]; return { marketplace_id: k, profit_complete: x.complete, profit_gbp: r2(x.profit), sales_gbp: r2(x.sales), units: x.units }; }).sort(function (a, b) { return b.sales_gbp - a.sales_gbp; }) };
  };
  function unitProfit(s) { // profit per unit at current price, null if unknown
    if (s.cost == null || s.feeMissing) return null;
    var fee = s.price * s.ref * 1.02 + (s.fulfillment === 'FBA' ? s.fbaFee : 0);
    return s.price / VAT - fee - (s.vatRecoverable ? s.cost / VAT : s.cost) - D.prepOf(s);
  }
  function statusRow(status, items) { // items: [{s, units}]
    var units = 0, cost = 0, resale = 0, profit = 0, cm = 0, pm = 0, prm = 0, baseNet = 0, baseGross = 0;
    items.forEach(function (it) {
      var s = it.s, u = it.u; if (u <= 0) return; units += u;
      resale += s.price * u;
      if (s.cost == null) cm += u; else { cost += s.cost * u; }
      var up = unitProfit(s); if (up == null) pm += u; else { profit += up * u; baseNet += ((s.vatRecoverable ? s.cost / VAT : s.cost) + D.prepOf(s)) * u; baseGross += (s.cost + D.prepOf(s)) * u; }
    });
    return { status: status, units: units, cost_gbp: r2(cost), profit_gbp: r2(profit), resale_gbp: r2(resale), roi_inc_vat_pct: baseGross > 0 ? r2(profit / baseGross * 100) : null, roi_pct: baseNet > 0 ? r2(profit / baseNet * 100) : null, units_cost_missing: cm, units_price_missing: 0, units_profit_missing: pm };
  }
  A.dashboard_inventory = function () {
    var fba = D.skus.filter(function (s) { return s.fulfillment === 'FBA'; }), fbm = D.skus.filter(function (s) { return s.fulfillment === 'FBM'; });
    var rows = [
      statusRow('Available', fba.map(function (s) { return { s: s, u: s.fulfillable }; })),
      statusRow('Available (FBM)', fbm.map(function (s) { return { s: s, u: s.fbmQty }; })),
      statusRow('Inbound', fba.map(function (s) { return { s: s, u: s.inbound }; })),
      statusRow('Researching', fba.map(function (s) { return { s: s, u: s.researching }; })),
      statusRow('Customer Orders', fba.map(function (s) { return { s: s, u: s.reserved }; })),
      statusRow('Defective', fba.map(function (s) { return { s: s, u: s.unfulfillable }; })),
      statusRow('Warehouse On Hand', D.stockOnHand.map(function (x) { return { s: D.skuByKey[x.sku], u: x.quantity }; })),
    ].filter(function (x) { return x.units > 0; });
    var tot = rows.reduce(function (a, x) { a.units += x.units; a.cost_gbp += x.cost_gbp; a.resale_gbp += x.resale_gbp; a.profit_gbp += x.profit_gbp; a.units_cost_missing += x.units_cost_missing; a.units_profit_missing += x.units_profit_missing; return a; }, { units: 0, cost_gbp: 0, resale_gbp: 0, profit_gbp: 0, units_cost_missing: 0, units_profit_missing: 0 });
    var baseNet = 0, baseGross = 0;
    D.skus.forEach(function (s) { var up = unitProfit(s); var u = s.fulfillment === 'FBA' ? s.fulfillable : s.fbmQty; if (up != null && u > 0) { baseNet += ((s.vatRecoverable ? s.cost / VAT : s.cost) + D.prepOf(s)) * u; baseGross += (s.cost + D.prepOf(s)) * u; } });
    var total = { cost_gbp: r2(tot.cost_gbp), profit_gbp: r2(tot.profit_gbp), resale_gbp: r2(tot.resale_gbp), roi_inc_vat_pct: baseGross > 0 ? r2(tot.profit_gbp / baseGross * 100) : null, roi_pct: baseNet > 0 ? r2(tot.profit_gbp / baseNet * 100) : null, units: tot.units, units_cost_missing: tot.units_cost_missing, units_profit_missing: tot.units_profit_missing };
    var latest = D.lines()[0];
    var cut = addDays(D.today, -89), soldMissing = {};
    D.lines().forEach(function (l) { if (l.sale_date >= cut && l.cost_missing) soldMissing[l.seller_sku] = 1; });
    var short = D.ships.filter(function (s) { return s.reconciliation_status === 'short_received'; });
    return { data: {
      alerts: { shipment_units_short: short.reduce(function (a, s) { return a + Math.abs(Math.min(0, s.units_difference)); }, 0), shipments_short: short.length, skus_missing_cost: Object.keys(soldMissing).length, stranded_items: D.stranded.length },
      inventory_by_status: rows, inventory_snapshot_at: isoAt(D.today, 4, 10), inventory_total: total,
      latest_sale: Object.assign(D.pubLine(latest), { fba_available: latest.fulfillment_class === 'FBA' ? D.skuByKey[latest.seller_sku].fulfillable : null, fbm_available: latest.fulfillment_class === 'FBM' ? D.skuByKey[latest.seller_sku].fbmQty : null, image_url: null }),
    } };
  };

  A.order_lines = function (b) {
    var r = range(b, 30);
    var L = lines(r.from, r.to);
    L = searchFilter(L, b.search, ['seller_sku', 'asin', 'title', 'amazon_order_id']);
    if (b.fulfillment === 'FBA' || b.fulfillment === 'FBM') L = L.filter(function (l) { return l.fulfillment_class === b.fulfillment; });
    if (b.cost_missing_only === true) L = L.filter(function (l) { return l.cost_missing; });
    if (b.profit_missing_only === true) L = L.filter(function (l) { return l.profit_gbp == null; });
    L = L.slice().sort(function (a, c) { return cmp(c.purchase_date, a.purchase_date) || cmp(a.order_item_id, c.order_item_id); });
    var p = paginate(L, b, 200, 2000);
    return { from: r.from, to: r.to, total: L.length, limit: p.limit, offset: p.offset, lines: p.rows.map(D.pubLine) };
  };

  function skuStats(from, to) {
    var m = {}, ord = {};
    lines(from, to).forEach(function (l) {
      var x = m[l.seller_sku];
      if (!x) x = m[l.seller_sku] = { s: D.skuByKey[l.seller_sku], units: 0, orders: {}, sales: 0, fees: 0, cogs: 0, profit: 0, complete: true, net: 0, base: 0, baseGross: 0, hasFee: false };
      x.units += l.quantity - l._refUnits; x.orders[l.amazon_order_id] = 1; x.sales += l.revenue_gross_gbp - (l._l.refund ? l._l.refund.principal : 0);
      if (l.amazon_fees_net_gbp != null) x.fees += l.amazon_fees_net_gbp; if (l.cogs_net_gbp != null) x.cogs += l.cogs_net_gbp;
      if (l._complete) { x.profit += l.profit_gbp; x.net += l.revenue_net_gbp; x.base += l.cogs_net_gbp + l.prep_gbp; x.baseGross += l.cogs_gross_gbp + l.prep_gbp; } else x.complete = false;
    });
    return m;
  }
  function skuRow(x, days) {
    var s = x.s, orders = Object.keys(x.orders).length, vel = days > 0 ? x.units / days : 0;
    var avail = s.fulfillment === 'FBA' ? s.fulfillable : null;
    return {
      seller_sku: s.sku, asin: s.asin, title: s.title, fulfillment: s.fulfillment, units: x.units, orders: orders, sales_gbp: r2(x.sales), avg_price_gbp: x.units > 0 ? r2(x.sales / x.units) : null,
      amazon_fees_gbp: r2(x.fees), cogs_gbp: r2(x.cogs), profit_gbp: x.profit || x.complete ? r2(x.profit) : null, roi_pct: x.base > 0 ? r2(x.profit / x.base * 100) : null, margin_pct: x.net > 0 ? r2(x.profit / x.net * 100) : null,
      profit_complete: x.complete, unit_cost_gross_gbp: s.cost, cost_source: s.cost == null ? null : s.costSource, cost_missing: s.cost == null,
      fba_fulfillable: avail, fba_inbound: s.fulfillment === 'FBA' ? s.inbound : null, fba_reserved: s.fulfillment === 'FBA' ? s.reserved : null,
      daily_velocity: r2(vel), days_of_cover: avail != null && vel > 0 ? r2(avail / vel) : null, roi_inc_vat_pct: x.baseGross > 0 ? r2(x.profit / x.baseGross * 100) : null, image_url: null,
    };
  }
  A.sku_analysis = function (b) {
    var r = range(b, 30), days = U.diffDays(r.to, r.from) + 1;
    var st = skuStats(r.from, r.to);
    var rows = Object.keys(st).map(function (k) { return skuRow(st[k], days); });
    rows = searchFilter(rows, b.search, ['seller_sku', 'asin', 'title']);
    if (b.cost_missing_only === true) rows = rows.filter(function (x) { return x.cost_missing; });
    var sortable = ['sales_gbp', 'units', 'profit_gbp', 'roi_pct', 'margin_pct', 'days_of_cover', 'daily_velocity'];
    var key = sortable.indexOf(b.sort) >= 0 ? b.sort : 'sales_gbp', asc = b.ascending === true;
    rows.sort(function (a, c) {
      var av = a[key], cv = c[key];
      if (av == null && cv == null) return cmp(a.seller_sku, c.seller_sku);
      if (av == null) return 1; if (cv == null) return -1;
      return (asc ? av - cv : cv - av) || cmp(a.seller_sku, c.seller_sku);
    });
    var tot = rows.reduce(function (a, x) { a.units += x.units; a.sales += x.sales_gbp; a.fees += x.amazon_fees_gbp; a.cogs += x.cogs_gbp; a.profit += x.profit_gbp || 0; if (!x.profit_complete) a.inc++; if (x.cost_missing) a.cm++; return a; }, { units: 0, sales: 0, fees: 0, cogs: 0, profit: 0, inc: 0, cm: 0 });
    var baseNet = 0, baseGross = 0, cnet = 0;
    rows.forEach(function (x) { if (x.roi_pct != null && x.roi_pct !== 0) baseNet += x.profit_gbp / x.roi_pct * 100; if (x.roi_inc_vat_pct) baseGross += x.profit_gbp / x.roi_inc_vat_pct * 100; if (x.margin_pct) cnet += x.profit_gbp / x.margin_pct * 100; });
    var totals = { sku_count: rows.length, units: tot.units, sales_gbp: r2(tot.sales), amazon_fees_gbp: r2(tot.fees), cogs_gbp: r2(tot.cogs), profit_gbp: r2(tot.profit), roi_pct: baseNet > 0 ? r2(tot.profit / baseNet * 100) : null, margin_pct: cnet > 0 ? r2(tot.profit / cnet * 100) : null, roi_inc_vat_pct: baseGross > 0 ? r2(tot.profit / baseGross * 100) : null, incomplete_skus: tot.inc, cost_missing_skus: tot.cm };
    var p = paginate(rows, b, 200, 2000);
    return { from: r.from, to: r.to, total: rows.length, limit: p.limit, offset: p.offset, skus: p.rows, totals: p.rows.length || p.offset === 0 ? totals : null };
  };

  /* ---------- cost of goods ---------- */
  function cogRows(days) {
    var from = addDays(D.today, -(days - 1));
    var st = {};
    lines(from, D.today).forEach(function (l) { var x = st[l.seller_sku] = st[l.seller_sku] || { u: 0, sales: 0, last: null }; x.u += l.quantity; x.sales += l.revenue_gross_gbp; if (!x.last || l.purchase_date > x.last) x.last = l.purchase_date; });
    return D.skus.filter(function (s) { return st[s.sku]; }).map(function (s) {
      var x = st[s.sku];
      var manual = s.costSource === 'manual' && s.cost != null;
      return {
        seller_sku: s.sku, asin: s.asin, title: s.title, units_sold: x.u, sales_gbp: r2(x.sales), last_sold_at: x.last, manual_cost_gross_gbp: manual ? s.cost : null, manual_vat_recoverable: manual ? s.vatRecoverable : null,
        manual_prep_gbp: manual ? s.prepManual : null, manual_updated_at: manual ? isoAt(addDays(D.today, -((s.n * 7) % 60) - 3), 11, 0) : null,
        purchase_avg_cost_gross_gbp: s.costSource === 'purchase' ? s.cost : null, inventory_default_cost_gross_gbp: s.costSource === 'inventory_default' ? s.cost : null,
        effective_cost_gross_gbp: s.cost, cost_source: s.cost == null ? null : s.costSource, cost_missing: s.cost == null, image_url: null,
      };
    });
  }
  A.cogs_list = function (b) {
    var days = Math.max(1, Math.min(num(b.days, 90) || 90, 730));
    var all = cogRows(days);
    var rows = searchFilter(all, b.search, ['seller_sku', 'asin', 'title']);
    if (b.missing_only === true) rows = rows.filter(function (x) { return x.cost_missing; });
    rows.sort(function (a, c) { return (c.cost_missing - a.cost_missing) || (c.sales_gbp - a.sales_gbp) || cmp(a.seller_sku, c.seller_sku); });
    var p = paginate(rows, b, 500, 5000);
    return { days: days, total: rows.length, limit: p.limit, offset: p.offset, missing_count: all.filter(function (x) { return x.cost_missing; }).length, sku_count: all.length, skus: p.rows };
  };
  A.cogs_set = function (b) {
    if (!Array.isArray(b.items) || !b.items.length) throw UserError('items must be a non-empty array');
    var set = 0, unchanged = 0;
    b.items.forEach(function (it) {
      it = it || {};
      var s = D.skuByKey[String(it.seller_sku || '').trim()]; if (!s) return;
      var old = { cost: s.cost, vat: s.vatRecoverable };
      if (it.remove) {
        if (s.cost != null && s.costSource === 'manual') { s.costBackup = s.cost; s.cost = null; s.costSource = null; set++; D.costLog.unshift({ id: Date.now() + set, seller_sku: s.sku, old_unit_cost_gross_gbp: old.cost, new_unit_cost_gross_gbp: null, old_vat_recoverable: old.vat, new_vat_recoverable: null, action: 'remove', actor: 'demo@sellintel.example', created_at: ts() }); } else unchanged++;
        return;
      }
      var c = it.unit_cost_gross_gbp; if (c == null || c === '') { unchanged++; return; }
      c = Number(c); if (!isFinite(c) || c < 0) throw UserError('Cost for ' + s.sku + ' must be a number of 0 or more.');
      var vr = it.vat_recoverable !== false;
      var prep = it.prep_per_unit_gbp != null && it.prep_per_unit_gbp !== '' ? Number(it.prep_per_unit_gbp) : s.prepManual;
      if (old.cost === c && old.vat === vr && prep === s.prepManual && s.costSource === 'manual') { unchanged++; return; }
      s.cost = c; s.vatRecoverable = vr; s.costSource = 'manual'; s.prepManual = prep != null && isFinite(prep) ? prep : null; s.costMissing = false; set++;
      D.costLog.unshift({ id: Date.now() + set, seller_sku: s.sku, old_unit_cost_gross_gbp: old.cost, new_unit_cost_gross_gbp: c, old_vat_recoverable: old.vat, new_vat_recoverable: vr, action: 'set', actor: 'demo@sellintel.example', created_at: ts() });
    });
    D.version++;
    return { result: { set: set, unchanged: unchanged } };
  };
  A.cogs_log = function (b) { return { log: D.costLog.slice(0, Math.max(1, Math.min(num(b.limit, 50), 500))) }; };
  A.sku_weights = function (b) {
    var skus = Array.isArray(b.skus) ? b.skus : [];
    return { weights: skus.map(function (k) { var s = D.skuByKey[k]; if (!s) return { seller_sku: k, in_inventory: false, keepa_weight_g: null, own_weight_g: null, source: null, used_weight_g: null };
      var own = s.ownWeight != null ? s.ownWeight : (s.weightMissing ? null : (s.n % 3 === 0 ? s.weight_g : null)); var keepa = s.weightMissing ? null : s.weight_g;
      return { seller_sku: s.sku, in_inventory: true, keepa_weight_g: keepa, own_weight_g: own, source: own != null ? 'own' : keepa != null ? 'keepa' : null, used_weight_g: own != null ? own : keepa }; }) };
  };
  A.weight_missing = function () {
    var cut = addDays(D.today, -89), cnt = {};
    D.lines().forEach(function (l) { if (l.sale_date >= cut && l.postage_missing) cnt[l.seller_sku] = (cnt[l.seller_sku] || 0) + 1; });
    var rows = Object.keys(cnt).map(function (k) { var s = D.skuByKey[k]; return { seller_sku: k, asin: s.asin, title: s.title, orders: cnt[k], can_save: true, image_url: null }; }).sort(function (a, c) { return c.orders - a.orders; });
    return { days: 90, fbm_skus: D.skus.filter(function (s) { return s.fulfillment === 'FBM'; }).length, skus: rows };
  };
  A.weight_set = function (b) {
    var items = Array.isArray(b.items) ? b.items : null;
    if (!items || !items.length || items.length > 500) throw UserError('Send 1 to 500 weights.');
    var n = 0;
    items.forEach(function (it) {
      it = it || {};
      var g = Number(it.weight_g), s = D.skuByKey[String(it.seller_sku || '').trim()];
      if (!s) throw UserError('Every weight needs a SKU.');
      if (!isFinite(g) || g < 1 || g > 30000) throw UserError('Weight for ' + s.sku + ' must be between 1 and 30000 grams.');
      s.weightMissing = false; s.weight_g = Math.round(g); s.ownWeight = Math.round(g); n++;
    });
    D.version++;
    return { result: { set: n, failed: 0 } };
  };

  /* ---------- payouts ---------- */
  A.payouts = function () {
    var pays = [], d = addDays(D.today, -3);
    for (var k = 0; k < 7; k++) {
      var end = addDays(d, 0), start = addDays(end, -14);
      var L = lines(start < D.firstDay ? D.firstDay : start, end);
      var proceeds = sum(L, function (l) { return l.revenue_gross_gbp - (l.amazon_fees_net_gbp != null ? l.amazon_fees_net_gbp * VAT : l.revenue_gross_gbp * 0.2) - (l._l.refund ? l._l.refund.principal : 0); });
      if (proceeds > 0) pays.push({ amount_gbp: r2(proceeds), posted_date: isoAt(end, 6, 0), settlement_id: String(2400000000 + (k + 1) * 31337 + parseInt(end.replace(/-/g, '').slice(4), 10)) });
      d = addDays(d, -14); if (d < D.firstDay) break;
    }
    var pend = [], total = 0;
    for (var q = 0; q < 7; q++) { var od = addDays(D.today, q - 7), amt = r2(sum(lines(od, od), function (l) { return l.revenue_gross_gbp * 0.78; })); pend.push({ amount_gbp: amt, release_date: addDays(D.today, q), transactions: lines(od, od).length }); total += amt; }
    var released = r2(sum(lines(addDays(D.today, -3), addDays(D.today, -1)), function (l) { return l.revenue_gross_gbp * 0.78; }) * 0.6);
    return { payouts: { data_as_of: ts(), deferred_without_maturity: 0, generated_at: ts(), last_payout_at: pays[0] ? pays[0].posted_date : null, notes: ['Amazon pays out about every 14 days. Amounts shown are as Amazon reports them, including VAT.'], payouts: pays, pending_dd7_by_release_date: pend, pending_dd7_overdue_gbp: 0, pending_dd7_total_gbp: r2(total), released_since_last_payout_gbp: released } };
  };

  /* ---------- reimbursements / returns ---------- */
  function titleFor(sku, asin) { var s = D.skuByKey[sku] || D.skuByAsin[asin]; return s ? s.title : null; }
  A.reimbursements = function (b) {
    var r = range(b, 90);
    var rows = between(r.from, r.to, D.reimb, 'reimbursement_date');
    var by = {}; rows.forEach(function (x) { var e = by[x.reason] = by[x.reason] || { amount_gbp: 0, count: 0, units: 0 }; e.amount_gbp = r2(e.amount_gbp + x.amount_gbp); e.count++; e.units += x.quantity_reimbursed; });
    var p = paginate(rows, b, 200, 2000);
    return { from: r.from, to: r.to, total: rows.length, amount_gbp: r2(sum(rows, function (x) { return x.amount_gbp; })), units: sum(rows, function (x) { return x.quantity_reimbursed; }), by_reason: by, reimbursements: p.rows.map(function (x) { return Object.assign({}, x, { title: titleFor(x.seller_sku, x.asin) }); }) };
  };
  A.returns = function (b) {
    var r = range(b, 90);
    var rows = between(r.from, r.to, D.returns, 'returned_at'), p = paginate(rows, b, 200, 2000);
    return { from: r.from, to: r.to, total: rows.length, returns: p.rows.map(function (x) { return Object.assign({}, x, { title: titleFor(x.seller_sku, x.asin) }); }) };
  };

  /* ---------- reconciliation / shipments ---------- */
  function shipPub(s) { var o = {}; for (var k in s) if (k.charAt(0) !== '_') o[k] = s[k]; return o; }
  A.reconciliation = function () {
    var by = {}; D.ships.forEach(function (s) { by[s.reconciliation_status] = (by[s.reconciliation_status] || 0) + 1; });
    var problems = D.ships.filter(function (s) { return ['short_received', 'over_received', 'check_needed'].indexOf(s.reconciliation_status) >= 0; }).map(shipPub);
    var byType = { inventory_mismatch: 3, fee_variance: 2 };
    return {
      shipments: { by_status: by, problems: problems, units_short: problems.reduce(function (a, s) { return a + Math.min(0, Number(s.units_difference || 0)); }, 0) },
      local_ledger_checks: { local_ledger_empty: true, note: "These compare Amazon FBA stock with the app's own stock ledger, which has no movements recorded yet, so 'expected' is always 0. They are not real losses; use the shipment reconciliation instead.", total: D.discrepancies.length, by_type: byType, discrepancies: D.discrepancies, recent_runs: D.reconRuns.map(function (x) { return { id: x.id, reconciliation_type: x.reconciliation_type, status: x.status, period_start: null, period_end: null, checked_count: x.checked_count, discrepancy_count: x.discrepancy_count, created_at: x.created_at, completed_at: x.completed_at }; }) },
    };
  };
  A.shipments_list = function (b) {
    var days = Math.max(1, Math.min(num(b.days, 120), 730)), cut = addDays(D.today, -(days - 1));
    var rows = D.ships.filter(function (s) { return s.created_at.slice(0, 10) >= cut; });
    if (b.status) rows = rows.filter(function (s) { return s.shipment_status === b.status; });
    if (b.reconciliation_status) rows = rows.filter(function (s) { return s.reconciliation_status === b.reconciliation_status; });
    rows = searchFilter(rows, b.search, ['amazon_shipment_id', 'shipment_name', 'destination']);
    var p = paginate(rows, b, 100, 1000);
    return { days: days, total: rows.length, limit: p.limit, offset: p.offset, receipts_tracked_from: D.firstDay, shipments: p.rows.map(shipPub) };
  };
  A.shipments_search = function (b) {
    var rows = D.ships.slice();
    var days = Math.max(1, Math.min(num(b.days, 365), 3650)); rows = rows.filter(function (s) { return s.created_at.slice(0, 10) >= addDays(D.today, -(days - 1)); });
    if (b.status) rows = rows.filter(function (s) { return s.shipment_status === b.status; });
    if (b.reconciliation_status) rows = rows.filter(function (s) { return s.reconciliation_status === b.reconciliation_status; });
    var q = String(b.search || '').trim().toLowerCase();
    if (q) rows = rows.filter(function (s) { return s.amazon_shipment_id.toLowerCase().indexOf(q) >= 0 || s.shipment_name.toLowerCase().indexOf(q) >= 0 || s._items.some(function (i) { return i.seller_sku.toLowerCase().indexOf(q) >= 0 || i.asin.toLowerCase().indexOf(q) >= 0 || i.title.toLowerCase().indexOf(q) >= 0; }); });
    if (b.created_from) rows = rows.filter(function (s) { return s.created_at.slice(0, 10) >= b.created_from; });
    if (b.created_to) rows = rows.filter(function (s) { return s.created_at.slice(0, 10) <= b.created_to; });
    var eff = function (s) { return s.last_receipt_at || s.created_at; };
    if (b.updated_from) rows = rows.filter(function (s) { return eff(s).slice(0, 10) >= b.updated_from; });
    if (b.updated_to) rows = rows.filter(function (s) { return eff(s).slice(0, 10) <= b.updated_to; });
    if (b.only_undelivered === true) rows = rows.filter(function (s) { return s.units_received < s.units_shipped && s.shipment_status !== 'CANCELLED'; });
    var p = paginate(rows, b, 50, 200);
    return { shipments: p.rows.map(function (s) { var o = shipPub(s); o.preview = s._items.slice(0, 3).map(function (i) { return { seller_sku: i.seller_sku, asin: i.asin, title: i.title, quantity_shipped: i.quantity_shipped, quantity_received: i.quantity_received, image_url: null }; }); o.updated_eff = eff(s); return o; }), total: rows.length };
  };
  A.shipment_items = function (b) {
    var s = D.ships.filter(function (x) { return x.shipment_record_id === b.shipment_record_id; })[0];
    if (!s) throw UserError('shipment_record_id must be a UUID');
    return { items: s._items };
  };
  A.shipments_refresh_received = function () { return { result: { updated: D.ships.length, refreshed_at: ts() } }; };

  /* ---------- listings / stranded ---------- */
  A.listings_list = function (b) {
    var rows = D.listings.slice();
    if (b.status) rows = rows.filter(function (x) { return x.status === b.status; });
    if (b.fulfillment === 'FBA') rows = rows.filter(function (x) { return x.fulfillment_channel.indexOf('AMAZON') === 0; });
    if (b.fulfillment === 'FBM') rows = rows.filter(function (x) { return x.fulfillment_channel.indexOf('AMAZON') !== 0; });
    rows = searchFilter(rows, b.search, ['seller_sku', 'asin', 'title']);
    rows.sort(function (a, c) { return cmp(a.seller_sku, c.seller_sku); });
    var counts = {}; D.listings.forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1; });
    var p = paginate(rows, b, 200, 2000);
    return { total: rows.length, limit: p.limit, offset: p.offset, by_status: counts, last_report: { report_id: '3350' + D.listings.length, report_created_at: isoAt(D.today, 4, 12), rows_received: D.listings.length, ingested_at: isoAt(D.today, 4, 20) },
      listings: p.rows.map(function (x) { var s = D.skuByKey[x.seller_sku]; return Object.assign({}, x, { price_gbp: s.price, quantity: x.fulfillment_channel.indexOf('AMAZON') === 0 ? s.fulfillable : s.fbmQty, qty: x.fulfillment_channel.indexOf('AMAZON') === 0 ? s.fulfillable : s.fbmQty, image_url: null }); }) };
  };
  A.stranded_list = function () {
    var items = D.stranded.slice().sort(function (a, c) { return cmp(a.auto_removal_date || 'z', c.auto_removal_date || 'z'); });
    return { count: items.length, units: items.reduce(function (a, r) { return a + r.fulfillable_qty + r.unfulfillable_qty; }, 0), last_report: { report_id: '4410' + items.length, report_created_at: isoAt(D.today, 4, 0), rows_received: items.length, ingested_at: isoAt(D.today, 4, 5) }, items: items };
  };

  /* ---------- monthly breakdown ---------- */
  A.monthly_breakdown = function () {
    var months = [], cur = new Date(D.now.getFullYear(), D.now.getMonth(), 1, 12);
    var key = function (d) { return d.getFullYear() + '-' + U.pad(d.getMonth() + 1, 2); };
    var firstKey = D.firstDay.slice(0, 7);
    var list = [];
    for (var i = 23; i >= 0; i--) { var d = new Date(cur.getFullYear(), cur.getMonth() - i, 1, 12); list.push(key(d)); }
    list.forEach(function (m, idx) {
      if (m < firstKey) {
        var growth = 1 + idx * 0.03, seas = 1 + 0.12 * Math.sin(idx / 2);
        var orders = Math.round(520 * growth * seas), units = Math.round(orders * 1.12), sales = r2(units * 10.4 * (0.97 + 0.06 * Math.cos(idx)));
        months.push({ cost_basis_gbp: null, history_only: true, margin_pct: null, month: m, ordered_orders: orders, ordered_sales_gbp: sales, ordered_units: units, orders: orders, profit_complete: null, profit_gbp: null, roi_pct: null, sales_gbp: sales, units: units });
      } else {
        var from = m + '-01', to = D.today < m + '-31' ? D.today : m + '-31';
        var ag = aggregate(from, to);
        months.push({ cost_basis_gbp: r2(ag.cogs_gbp + ag.prep_gbp), history_only: false, margin_pct: ag.margin_pct, month: m, ordered_orders: ag.orders, ordered_sales_gbp: ag.gross_sales_gbp, ordered_units: ag.gross_units, orders: ag.orders, profit_complete: ag.profit_complete, profit_gbp: ag.profit_gbp, roi_pct: ag.roi_pct, sales_gbp: ag.sales_gbp, units: ag.units });
      }
    });
    return { from: months[0].month + '-01', generated_at: ts(), months: months };
  };

  /* ---------- detail pages ---------- */
  var ORDER_RE = /^\d{3}-\d{7}-\d{7}$/;
  function findOrder(id) { return D.rawOrders.filter(function (o) { return o.id === id; })[0]; }
  A.order_detail = function (b) {
    var id = String(b.amazon_order_id || ''); if (!ORDER_RE.test(id)) throw UserError('A valid Amazon order id is required.');
    var o = findOrder(id), fees = [], inv = [];
    if (o) {
      o.lines.forEach(function (l) {
        var s = l.sku; if (s.feeMissing) return;
        var gross = l.price * l.qty, ref = r2(gross * s.ref), dsf = r2(ref * 0.02);
        fees.push({ seller_sku: s.sku, fee_type: 'Commission', net_gbp: ref, vat_gbp: r2(ref * 0.2) });
        fees.push({ seller_sku: s.sku, fee_type: 'DigitalServicesFee', net_gbp: dsf, vat_gbp: r2(dsf * 0.2) });
        if (s.fulfillment === 'FBA') fees.push({ seller_sku: s.sku, fee_type: 'FBAPerUnitFulfillmentFee', net_gbp: r2(s.fbaFee * l.qty), vat_gbp: r2(s.fbaFee * l.qty * 0.2) });
      });
      var seen = {};
      o.lines.forEach(function (l) { D.invoices.forEach(function (v) { if (!seen[v.id] && v.items.some(function (i) { return i.description === l.sku.title; })) { seen[v.id] = 1; inv.push({ id: v.id, invoice_number: v.invoice_number, supplier_name: v.supplier_name, invoice_date: v.invoice_date, total_gross_gbp: v.total_gross_gbp, invoice_url: v.invoice_url }); } }); });
    }
    return { order_id: id, settled: !!o && o.day < addDays(D.today, -3), fees: fees, invoices: inv.slice(0, 2) };
  };
  A.order_lookup = function (b) {
    var id = String(b.order_id || '').trim(); if (!ORDER_RE.test(id)) throw UserError('That is not an Amazon order number. It looks like 123-4567890-1234567.');
    var o = findOrder(id); if (!o) return { found: false };
    var ls = D.lines().filter(function (l) { return l.amazon_order_id === id; });
    var refunded = ls.filter(function (l) { return l._l.refund; });
    var status = refunded.length ? (refunded.some(function (l) { return l._l.refund.kind === 'full'; }) ? 'Refunded' : 'Partially refunded') : 'Completed';
    var money = [], total = 0;
    ls.forEach(function (l) { var net = r2(l.revenue_gross_gbp - (l.amazon_fees_net_gbp != null ? l.amazon_fees_net_gbp * 1.2 : 0)); total += net; money.push({ type: 'Shipment', posted_date: isoAt(addDays(o.day, 1), 8, 0), released: o.day < addDays(D.today, -8), net_amount: net }); if (l._l.refund) money.push({ type: 'Refund', posted_date: isoAt(l._l.refund.date, 9, 0), released: true, net_amount: -l._l.refund.principal }); });
    return {
      found: true, order_id: id, status: status, amazon_status: o.status, currency: 'GBP', fulfilled_by: o.fulfilled_by, last_updated_at: ts(), purchase_date: o.ts, order_total_gross: r2(sum(ls, function (l) { return l.revenue_gross_gbp; })),
      lines: ls.map(function (l) { return { amazon_fees_net_gbp: l.amazon_fees_net_gbp, asin: l.asin, cogs_net_gbp: l.cogs_net_gbp, cost_missing: l.cost_missing, fbm_postage_gbp: l.fbm_postage_gbp, fee_missing: l.fee_missing, fulfillment_class: l.fulfillment_class, prep_gbp: l.prep_gbp, profit_gbp: l.profit_gbp, quantity: l.quantity, revenue_gross_gbp: l.revenue_gross_gbp, revenue_net_gbp: l.revenue_net_gbp, roi_pct: l.roi_pct, seller_sku: l.seller_sku, title: l.title, postage_missing: l.postage_missing }; }),
      money: money, refunds: refunded.map(function (l) { return { seller_sku: l.seller_sku, kind: l._l.refund.kind, refunded_units: l._l.refund.kind === 'full' ? l.quantity : l._l.refund.units, refunded_principal: -l._l.refund.principal, refund_date: l._l.refund.date }; }),
      returns: D.returns.filter(function (r) { return r.amazon_order_id === id; }), reimbursements: D.reimb.filter(function (r) { return r.amazon_order_id === id; }),
    };
  };
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  H.hash = hash;
  A.sku_detail = function (b) {
    var sku = String(b.sku || '').trim(); if (!sku) throw UserError('A SKU is required.');
    var r = range(b, 30), s = D.skuByKey[sku];
    if (!s) return { seller_sku: sku, from: r.from, to: r.to, product: null, kpi: { lines: 0, lines_without_profit: 0, orders: 0, units: 0, sales_gbp: 0, profit_gbp: 0 }, pnl: {}, orders: [], orders_total: 0, refunds: [], returns: [], reimbursements: [], reimbursed_total_gbp: 0, shipments: [], movement: { awaiting_dispatch: 0, received_by_amazon: 0, refunded: 0, shipped_to_amazon: 0, sold: 0, stock: null } };
    var L = lines(r.from, r.to).filter(function (l) { return l.seller_sku === sku; }), comp = L.filter(function (l) { return l._complete; });
    var ord = {}; L.forEach(function (l) { ord[l.amazon_order_id] = 1; });
    var refUnits = sum(L, function (l) { return l._refUnits; }), grossUnits = sum(L, function (l) { return l.quantity; });
    var profit = sum(comp, function (l) { return l.profit_gbp; }), cnet = sum(comp, function (l) { return l.revenue_net_gbp; }), base = sum(comp, function (l) { return l.cogs_net_gbp + l.prep_gbp; }), baseG = sum(comp, function (l) { return l.cogs_gross_gbp + l.prep_gbp; });
    var allNet = sum(L, function (l) { return l.revenue_net_gbp; }), allGross = sum(L, function (l) { return l.revenue_gross_gbp; });
    var u30 = D.units30Map[sku] || 0;
    var rshipped = sum(D.ships, function (sh) { return sum(sh._items.filter(function (i) { return i.seller_sku === sku; }), function (i) { return i.quantity_shipped; }); });
    var rrecv = sum(D.ships, function (sh) { return sum(sh._items.filter(function (i) { return i.seller_sku === sku; }), function (i) { return i.quantity_received; }); });
    var seed = hash(sku);
    return {
      seller_sku: sku, from: r.from, to: r.to,
      product: { asin: s.asin, title: s.title, brand: s.brand, category: s.category, sales_rank: s.rank, monthly_sales_est: s.monthly, current_buy_box_gbp: s.buyBox, avg_30_buy_box_gbp: r2(s.buyBox * 1.01), avg_90_buy_box_gbp: r2(s.buyBox * 1.03), seller_count: s.sellers, keepa_updated_at: isoAt(addDays(D.today, -1), 11, 30) },
      kpi: { units: grossUnits - refUnits, units_sold_gross: grossUnits, refunded_units: refUnits, orders: Object.keys(ord).length, sales_gbp: r2(allGross - sum(L, function (l) { return l._l.refund ? l._l.refund.principal : 0; })), profit_gbp: r2(profit), roi_pct: base > 0 ? r2(profit / base * 100) : null, roi_inc_vat_pct: baseG > 0 ? r2(profit / baseG * 100) : null, margin_pct: cnet > 0 ? r2(profit / cnet * 100) : null, lines: L.length, lines_without_profit: L.length - comp.length },
      pnl: { sales_ex_vat_gbp: r2(allNet), sales_inc_vat_gbp: r2(allGross), amazon_fees_gbp: r2(sum(L, function (l) { return l.amazon_fees_net_gbp; })), cogs_ex_vat_gbp: r2(sum(L, function (l) { return l.cogs_net_gbp; })), prep_gbp: r2(sum(L, function (l) { return l.prep_gbp; })), postage_gbp: r2(sum(L, function (l) { return l.fbm_postage_gbp; })), vat_reclaimable_gbp: r2(sum(L, function (l) { return l.cogs_gross_gbp != null ? l.cogs_gross_gbp - l.cogs_net_gbp : 0; })), profit_gbp: r2(profit), lines: L.length },
      orders: L.slice(0, 50).map(function (l) { return { purchase_date: l.purchase_date, amazon_order_id: l.amazon_order_id, fulfillment_class: l.fulfillment_class, quantity: l.quantity, refunded_units: l._refUnits, revenue_gross_gbp: l.revenue_gross_gbp, amazon_fees_net_gbp: l.amazon_fees_net_gbp, cogs_gross_gbp: l.cogs_gross_gbp, profit_gbp: l.profit_gbp, roi_pct: l.roi_pct }; }),
      orders_total: L.length,
      refunds: L.filter(function (l) { return l._l.refund; }).map(function (l) { return { posted_day: l._l.refund.date, amazon_order_id: l.amazon_order_id, qty: l._l.refund.kind === 'full' ? l.quantity : l._l.refund.units, amount_gbp: l._l.refund.principal }; }),
      returns: D.returns.filter(function (x) { return x.seller_sku === sku; }).map(function (x) { return { returned_at: x.returned_at, amazon_order_id: x.amazon_order_id, quantity: x.quantity, reason: x.reason, disposition: x.disposition, status: x.status }; }),
      reimbursements: D.reimb.filter(function (x) { return x.seller_sku === sku; }).map(function (x) { return { reimbursement_date: x.reimbursement_date, reimbursement_id: x.reimbursement_id, amazon_order_id: x.amazon_order_id, reason: x.reason, quantity_reimbursed: x.quantity_reimbursed, amount_gbp: x.amount_gbp }; }),
      reimbursed_total_gbp: r2(sum(D.reimb.filter(function (x) { return x.seller_sku === sku; }), function (x) { return x.amount_gbp; })),
      shipments: D.ships.filter(function (sh) { return sh._items.some(function (i) { return i.seller_sku === sku; }); }).slice(0, 8).map(function (sh) { var it = sh._items.filter(function (i) { return i.seller_sku === sku; })[0]; return { amazon_shipment_id: sh.amazon_shipment_id, shipment_name: sh.shipment_name, shipment_status: sh.shipment_status, created_at: sh.created_at, quantity_shipped: it.quantity_shipped, quantity_received: it.quantity_received }; }),
      movement: { shipped_to_amazon: rshipped, received_by_amazon: rrecv, sold: grossUnits, awaiting_dispatch: sum(L.filter(function (l) { return l.order_status === 'Unshipped'; }), function (l) { return l.quantity; }), refunded: refUnits, stock: s.fulfillment === 'FBA' ? { fulfillable_qty: s.fulfillable, inbound: s.inbound, reserved_qty: s.reserved, unfulfillable_qty: s.unfulfillable, total_qty: s.fulfillable + s.inbound + s.reserved + s.unfulfillable, captured_at: isoAt(D.today, 4, 10) } : null },
    };
  };
  A.keepa_history = function (b) {
    var asin = String(b.asin || '').trim().toUpperCase(); if (!/^[A-Z0-9]{10}$/.test(asin)) throw UserError('A valid ASIN is required.');
    var s = D.skuByAsin[asin], base = s ? s.price : 12 + (hash(asin) % 1500) / 100, seed = hash(asin), now = Date.now(), d = 86400000;
    var bb = [], nw = [], rk = [], of = [];
    for (var k = 0; k < 90; k += 2) { var t = now - (89 - k) * d, wob = Math.sin((k + seed % 17) / 6) * 0.04 + Math.cos((k * 3 + seed % 7) / 9) * 0.025; bb.push([t, r2(base * (1 + wob))]); nw.push([t, r2(base * (1 + wob) - 0.3)]); }
    for (var q = 0; q < 90; q += 3) { var t2 = now - (89 - q) * d; rk.push([t2, Math.round((s ? s.rank : 20000 + seed % 60000) * (1 + Math.sin((q + seed % 11) / 7) * 0.25))]); }
    for (var z = 0; z < 90; z += 6) of.push([now - (89 - z) * d, 2 + ((seed + z) % 7)]);
    return { history: { asin: asin, days: 90, buy_box: bb, new: nw, amazon: [], rank: rk, offers: of } };
  };

  /* ---------- fee calculator ---------- */
  function productFor(asin) {
    var s = D.skuByAsin[asin], c = D.candidates.filter(function (x) { return x.asin === asin; })[0];
    if (s) return { asin: asin, title: s.title, brand: s.brand, category: s.category, image_url: null, ean: s.ean, upc: null, sales_rank: s.rank, price: s.price, ref: s.ref, fba: s.fbaFee };
    if (c) return { asin: asin, title: c.amazon_title, brand: c.brand, category: c.category, image_url: null, ean: null, upc: null, sales_rank: c.sales_rank, price: c.sell_price_gross_gbp, ref: c.referral_fee_pct / 100, fba: 2.6 };
    if (/^B0DEMO/.test(asin) || /^B0/.test(asin)) { var h = hash(asin), t = D.TYPES[h % D.TYPES.length], br = D.BRANDS[(h >> 3) % D.BRANDS.length]; return { asin: asin, title: br + ' ' + t[2] + ' ' + t[4][0], brand: br, category: t[0], image_url: null, ean: '50' + String(h).padStart(11, '0').slice(0, 11), upc: null, sales_rank: 2000 + h % 90000, price: r2(10 + (h % 2500) / 100), ref: 0.15, fba: 2.7 }; }
    return null;
  }
  A.product_check = function (b) {
    var asin = String(b.asin || '').trim().toUpperCase(); if (!/^[A-Z0-9]{10}$/.test(asin)) throw UserError('An ASIN is 10 letters/numbers, e.g. B0DEMO1234.');
    var p = productFor(asin);
    if (!p) return { asin: asin, found: false, product: null, eligibility: { status: 'unknown', can_list: false, reasons: [] } };
    var h = hash(asin) % 10, elig = h === 3 ? { status: 'approval_required', can_list: false, reasons: [{ code: 'APPROVAL_REQUIRED', message: 'You need approval to list this product in the Grocery category. Apply for approval in Seller Central (demo data).' }] } : { status: 'eligible', can_list: true, reasons: [] };
    return { asin: asin, found: true, product: { asin: p.asin, title: p.title, brand: p.brand, category: p.category, image_url: null, ean: p.ean, upc: p.upc, sales_rank: p.sales_rank }, eligibility: elig };
  };
  A.fee_calc = function (b) {
    var asin = b.asin ? String(b.asin).trim().toUpperCase() : null;
    if (asin && !/^[A-Z0-9]{10}$/.test(asin)) throw UserError('asin must be 10 letters/digits');
    var sell = Number(b.sell_price_gbp); if (!isFinite(sell) || sell < 0.01) throw UserError('sell_price_gbp is required');
    var ful = String(b.fulfillment || 'FBA').toUpperCase(); if (ful !== 'FBA' && ful !== 'FBM') throw UserError('fulfillment must be FBA or FBM');
    var p = asin ? productFor(asin) : null, known = !!p;
    var refPct = b.referral_fee_pct != null && b.referral_fee_pct !== '' ? Number(b.referral_fee_pct) : (p ? p.ref * 100 : 15);
    var fba = ful === 'FBA' ? (b.fba_fee_gbp != null && b.fba_fee_gbp !== '' ? Number(b.fba_fee_gbp) : (p ? p.fba : 2.7)) : 0;
    var closing = b.closing_fee_gbp != null && b.closing_fee_gbp !== '' ? Number(b.closing_fee_gbp) : 0;
    var prep = b.prep_gbp != null && b.prep_gbp !== '' ? Number(b.prep_gbp) : 0.1;
    var w = b.weight_g != null && b.weight_g !== '' ? Number(b.weight_g) : (p ? 300 : null);
    var post = ful === 'FBM' ? (b.postage_gbp != null && b.postage_gbp !== '' ? Number(b.postage_gbp) : (w == null ? 0 : (w <= 2000 ? 1.95 : 2.5))) : 0;
    var cost = b.cost_gbp != null && b.cost_gbp !== '' ? Number(b.cost_gbp) : null;
    var vr = b.supplier_vat_recoverable !== false;
    var referral = r2(sell * refPct / 100), dsf = r2(referral * 0.02), feesEx = r2(referral + dsf + fba + closing), vatFees = r2(feesEx * 0.2);
    var revNet = r2(sell / VAT), cogsNet = cost == null ? null : r2(vr ? cost / VAT : cost);
    var profit = cogsNet == null ? null : r2(revNet - feesEx - cogsNet - prep - post);
    var base = cogsNet == null ? null : cogsNet + prep;
    var be = cost == null ? null : r2((feesEx / sell > 0.6 ? 0 : (cogsNet + prep + post)) / (1 / VAT - (referral + dsf) / sell) / 1 || 0);
    var missing = []; if (cost == null) missing.push('cost_gbp'); if (!known) missing.push('product_data');
    return {
      calc: { asin: asin, break_even_price_gbp: cost == null ? null : r2(((cogsNet + prep + post + (fba + closing) ) ) / (1 / VAT - (refPct / 100) * 1.02)), buy_box_gbp: p ? r2(p.price * 0.99) : null, cogs_net_gbp: cogsNet, cost_gross_gbp: cost,
        fees: { closing_gbp: closing, cost_to_you_gbp: feesEx, digital_services_fee_gbp: dsf, fba_gbp: fba, referral_gbp: referral, total_ex_vat_gbp: feesEx, total_incl_vat_gbp: r2(feesEx + vatFees), vat_on_fees_gbp: vatFees },
        fulfillment: ful, inputs_used: { closing_fee_gbp: closing, fba_fee_gbp: fba, fbm_postage_gbp: post, prep_gbp: prep, referral_fee_pct: refPct, supplier_vat_recoverable: vr, vat_rate: 0.2, vat_registered: true, weight_g: w },
        keepa_updated_at: p ? isoAt(addDays(D.today, -1), 11, 0) : null, margin_pct: profit == null ? null : r2(profit / revNet * 100), missing_inputs: missing, monthly_sales_est: p ? 150 + hash(asin) % 700 : null, notes: known ? [] : ['This ASIN is not in the demo catalogue; standard fee rates were used.'],
        product_known: known, profit_gbp: profit, revenue_net_gbp: revNet, roi_inc_vat_pct: profit == null ? null : r2(profit / (cost + prep) * 100), roi_pct: base == null || base <= 0 ? null : r2(profit / base * 100), sales_rank: p ? p.sales_rank : null, sell_price_gross_gbp: sell, title: p ? p.title : null },
      keepa_lookup_queued: false,
    };
  };

  /* ---------- storefront stalker ---------- */
  function sfPub(f) { var o = {}; for (var k in f) if (k.charAt(0) !== '_') o[k] = f[k]; return o; }
  function sfFind(id) { var f = D.storefronts.filter(function (x) { return x.id === id; })[0]; if (!f) throw UserError('storefront not found'); return f; }
  function sfRefresh(f) { var a = f._asins; f.asin_count = a.filter(function (x) { return !x.removed_at; }).length; }
  A.storefront_list = function () { return { storefronts: D.storefronts.map(sfPub) }; };
  A.storefront_add = function (b) {
    var raw = String(b.url || b.seller_id || '').trim(); if (!raw) throw UserError('url (or seller_id) is required');
    var m = raw.match(/(?:seller|me|merchant)=([A-Za-z0-9]{8,20})/) || (/^A[A-Z0-9]{9,19}$/i.test(raw) ? [0, raw] : null);
    if (!m) throw UserError('No seller ID found in that link. Paste the seller\'s storefront link (it contains seller=… or me=…).');
    var id = m[1].toUpperCase();
    if (D.storefronts.some(function (x) { return x.seller_id === id; })) throw UserError('That storefront is already saved');
    var f = { id: D.liveUuid(), workspace_id: D.workspace.id, seller_id: id, domain_id: 2, store_url: 'https://www.amazon.co.uk/sp?seller=' + id, label: b.label ? String(b.label).trim().slice(0, 120) : null, seller_name: null, check_frequency: b.check_frequency || 'daily', active: true, last_checked_at: null, last_check_status: null, last_error: null, asin_count: 0, new_asins_last_check: 0, removed_asins_last_check: 0, check_requested_at: ts(), created_at: ts(), updated_at: ts(), _asins: [], _checks: [] };
    D.storefronts.unshift(f);
    // the "first check" completes shortly after
    setTimeout(function () {
      for (var q = 0; q < 24; q++) { var t = D.TYPES[(q * 3 + id.length) % D.TYPES.length]; f._asins.push({ asin: 'B0DEMO' + ((hash(id) + q) % 1679616).toString(36).toUpperCase().padStart(4, '0').slice(-4), title: D.BRANDS[q % D.BRANDS.length] + ' ' + t[2] + ' ' + t[4][0], buy_box_gbp: r2(8 + q * 0.9), sales_rank: 3000 + q * 1900, monthly_sales_est: 400 - q * 12, category: t[0], first_seen_at: ts(), last_seen_at: ts(), keepa_last_seen_at: ts(), removed_at: null, is_baseline: true, details_pending: false, image_url: null }); }
      f.last_checked_at = ts(); f.last_check_status = 'ok'; f.check_requested_at = null; f.seller_name = f.label || 'Seller ' + id.slice(-4); sfRefresh(f);
      f._checks.unshift({ id: Date.now(), storefront_id: f.id, checked_at: ts(), status: 'ok', asin_count: f.asin_count, new_asins: 0, removed_asins: 0, tokens_consumed: 12, error: null });
    }, 1800);
    return { storefront: sfPub(f) };
  };
  A.storefront_update = function (b) {
    var f = sfFind(b.id);
    if (b.label !== undefined) f.label = b.label && String(b.label).trim() ? String(b.label).trim().slice(0, 120) : null;
    if (b.check_frequency !== undefined) { if (['daily', 'weekly', 'manual'].indexOf(String(b.check_frequency)) < 0) throw UserError('check_frequency must be daily, weekly or manual'); f.check_frequency = String(b.check_frequency); }
    if (b.active !== undefined) f.active = !!b.active; f.updated_at = ts();
    return { storefront: sfPub(f) };
  };
  A.storefront_remove = function (b) { var f = sfFind(b.id); D.storefronts.splice(D.storefronts.indexOf(f), 1); return { removed: b.id }; };
  A.storefront_check_now = function (b) {
    var f = sfFind(b.id); f.check_requested_at = ts(); f.active = true;
    setTimeout(function () { f.last_checked_at = ts(); f.last_check_status = 'ok'; f.check_requested_at = null; f._checks.unshift({ id: Date.now(), storefront_id: f.id, checked_at: ts(), status: 'ok', asin_count: f.asin_count, new_asins: 0, removed_asins: 0, tokens_consumed: 9, error: null }); }, 1500);
    return { requested: { id: f.id, check_requested_at: f.check_requested_at } };
  };
  A.storefront_asins = function (b) {
    var f = sfFind(b.id), filter = ['new', 'removed', 'current', 'all'].indexOf(String(b.filter)) >= 0 ? String(b.filter) : 'new';
    var rows = f._asins.filter(function (a) { return filter === 'all' ? true : filter === 'new' ? !a.is_baseline && !a.removed_at : filter === 'removed' ? !!a.removed_at : !a.removed_at; });
    rows.sort(function (a, c) { return cmp(c.first_seen_at, a.first_seen_at) || cmp(a.asin, c.asin); });
    var p = paginate(rows, b, 200, 2000);
    return { filter: filter, total: rows.length, limit: p.limit, offset: p.offset, asins: p.rows };
  };
  A.storefront_checks = function (b) { return { checks: sfFind(b.id)._checks }; };

  /* ---------- repricer ---------- */
  A.repricer_view = function (b) {
    var rows = D.skus.map(function (s) {
      var rule = D.repricer.rules[s.sku], cur = s.price, bb = s.buyBox, be = s.cost != null ? r2((s.cost / VAT + D.prepOf(s) + (s.fulfillment === 'FBA' ? s.fbaFee : (D.postageOf(s) || 0))) / (1 / VAT - s.ref * 1.02)) : null;
      var sugg = null, chg = null, reason = null, warnings = [];
      if (rule) {
        var floor = Math.max(rule.min_price_gbp, be || 0), tgt = rule.strategy === 'max_price' ? rule.max_price_gbp : rule.strategy === 'beat_buy_box' ? bb - rule.beat_by_gbp : bb;
        tgt = Math.min(rule.max_price_gbp, Math.max(floor, tgt)); sugg = r2(tgt); chg = r2(sugg - cur);
        reason = rule.strategy === 'max_price' ? 'Set to your maximum' : (bb <= cur ? 'You have the buy box; hold' : (rule.strategy === 'beat_buy_box' ? 'Beat the buy box by £' + rule.beat_by_gbp.toFixed(2) : 'Match the buy box'));
        if (be == null) warnings.push('No cost price, break-even unknown');
        if (floor > rule.max_price_gbp) warnings.push('Floor is above your maximum price');
      }
      return { seller_sku: s.sku, asin: s.asin, title: s.title, fulfillment: s.fulfillment, quantity: s.fulfillment === 'FBA' ? s.fulfillable : s.fbmQty, listing_status: 'Active', current_price_gbp: cur, buy_box_gbp: bb, buy_box_seller_id: s.n % 3 === 0 ? D.hubSettings.own_seller_id : 'A2DEMOBUYBOX' + (s.n % 9 + 1), buy_box_is_yours: s.n % 3 === 0, buy_box_updated_at: isoAt(D.today, 5, 30), unit_cost_gross_gbp: s.cost, break_even_price_gbp: be, has_rule: !!rule, rule_active: rule ? rule.active : null, strategy: rule ? rule.strategy : null, min_price_gbp: rule ? rule.min_price_gbp : null, max_price_gbp: rule ? rule.max_price_gbp : null, beat_by_gbp: rule ? rule.beat_by_gbp : null, suggested_price_gbp: sugg, change_gbp: chg, suggestion_reason: reason, warnings: warnings, image_url: null };
    });
    if (b.rules_only === true) rows = rows.filter(function (x) { return x.has_rule; });
    if (b.fulfillment === 'FBA' || b.fulfillment === 'FBM') rows = rows.filter(function (x) { return x.fulfillment === b.fulfillment; });
    rows = searchFilter(rows, b.search, ['seller_sku', 'asin', 'title']);
    rows.sort(function (a, c) { return (c.has_rule - a.has_rule) || cmp(a.seller_sku, c.seller_sku); });
    var p = paginate(rows, b, 200, 2000);
    return { mode: 'suggest_only', total: rows.length, limit: p.limit, offset: p.offset, rows: p.rows };
  };
  A.repricer_rule_set = function (b) {
    var sku = String(b.seller_sku || '').trim(); if (!sku) throw UserError('seller_sku is required');
    if (!D.skuByKey[sku]) throw UserError('That SKU is not in your Amazon listings report');
    var min = Number(b.min_price_gbp), max = Number(b.max_price_gbp);
    if (!isFinite(min) || min < 0.01) throw UserError('min_price_gbp is required'); if (!isFinite(max) || max < 0.01) throw UserError('max_price_gbp is required');
    if (max < min) throw UserError('max_price_gbp must be at least min_price_gbp');
    var strategy = String(b.strategy || 'match_buy_box'); if (['match_buy_box', 'beat_buy_box', 'max_price'].indexOf(strategy) < 0) throw UserError('strategy must be match_buy_box, beat_buy_box or max_price');
    var rule = { seller_sku: sku, min_price_gbp: min, max_price_gbp: max, strategy: strategy, beat_by_gbp: b.beat_by_gbp != null ? Number(b.beat_by_gbp) : 0.01, active: b.active === undefined ? true : !!b.active, notes: b.notes ? String(b.notes).slice(0, 500) : null, updated_at: ts() };
    D.repricer.rules[sku] = rule; return { rule: rule };
  };
  A.repricer_rule_remove = function (b) { var sku = String(b.seller_sku || '').trim(); if (!D.repricer.rules[sku]) throw UserError('rule not found'); delete D.repricer.rules[sku]; return { removed: sku }; };
  A.repricer_settings_get = function () { return { settings: D.repricer.settings, saved: D.repricer.saved }; };
  A.repricer_settings_set = function (b) {
    var s = D.repricer.settings;
    ['live_enabled', 'pause_on_outside_change'].forEach(function (k) { if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') throw UserError(k + ' must be true or false'); s[k] = b[k]; } });
    [['check_interval_minutes', 5, 1440, true], ['max_step_pct', 1, 50, false], ['max_changes_per_sku_per_day', 1, 200, true], ['max_changes_per_day', 1, 10000, true]].forEach(function (x) {
      if (b[x[0]] !== undefined) { var n = Number(b[x[0]]); if (!isFinite(n) || n < x[1] || n > x[2] || (x[3] && Math.floor(n) !== n)) throw UserError(x[0] + ' must be ' + (x[3] ? 'a whole number' : 'a number') + ' between ' + x[1] + ' and ' + x[2]); s[x[0]] = n; }
    });
    s.updated_by = 'demo@sellintel.example'; s.updated_at = ts(); D.repricer.saved = true; return { settings: s };
  };
  A.repricer_actions = function (b) {
    var rows = D.repricer.actions.slice();
    if (b.seller_sku) rows = rows.filter(function (x) { return x.seller_sku === b.seller_sku; });
    if (b.outcome) rows = rows.filter(function (x) { return x.outcome === b.outcome; });
    var last24 = {}; D.repricer.actions.forEach(function (x) { if (x.decided_at > new Date(Date.now() - 86400000).toISOString()) last24[x.outcome] = (last24[x.outcome] || 0) + 1; });
    var p = paginate(rows, b, 200, 2000);
    return { total: rows.length, limit: p.limit, offset: p.offset, last_24h: last24, actions: p.rows };
  };

  /* ---------- review requests ---------- */
  A.feedback_settings_get = function () { return { settings: D.reviewSettings, saved: D.reviewSaved }; };
  A.feedback_settings_set = function (b) {
    var s = D.reviewSettings;
    if (b.sending_enabled !== undefined) { if (typeof b.sending_enabled !== 'boolean') throw UserError('sending_enabled must be true or false'); s.sending_enabled = b.sending_enabled; }
    [['min_days_after_purchase', 5, 30], ['max_days_after_purchase', 5, 30], ['daily_limit', 1, 2000]].forEach(function (x) { if (b[x[0]] !== undefined) { var n = Number(b[x[0]]); if (Math.floor(n) !== n || n < x[1] || n > x[2]) throw UserError(x[0] + ' must be a whole number between ' + x[1] + ' and ' + x[2]); s[x[0]] = n; } });
    if (s.max_days_after_purchase < s.min_days_after_purchase) throw UserError('max_days_after_purchase must be at least min_days_after_purchase');
    if (b.exclude_skus !== undefined) { if (!Array.isArray(b.exclude_skus)) throw UserError('exclude_skus must be an array (max 5000)'); s.exclude_skus = b.exclude_skus.map(String).filter(Boolean); }
    s.updated_by = 'demo@sellintel.example'; s.updated_at = ts(); D.reviewSaved = true; return { settings: s };
  };
  A.feedback_stats = function () {
    var by = {}; D.reviewReqs.forEach(function (x) { by[x.status] = (by[x.status] || 0) + 1; });
    return { sending_enabled: D.reviewSettings.sending_enabled, by_status: by, sent_today: D.reviewSettings.sending_enabled ? 14 : 0, sent_last_30_days: by.sent || 0, candidates_waiting: Math.min(100, 38), candidates_waiting_capped_at: 100, permission_missing: false };
  };
  A.feedback_list = function (b) {
    var rows = D.reviewReqs.slice(); if (b.status) rows = rows.filter(function (x) { return x.status === b.status; });
    if (b.search) rows = rows.filter(function (x) { return x.amazon_order_id.indexOf(String(b.search).trim()) >= 0; });
    var p = paginate(rows, b, 200, 2000); return { total: rows.length, limit: p.limit, offset: p.offset, requests: p.rows };
  };
  A.settings_get = function () { return { settings: D.hubSettings }; };
  A.settings_set = function (b) {
    var raw = b.own_seller_id === null ? null : String(b.own_seller_id == null ? '' : b.own_seller_id).trim().toUpperCase();
    if (raw !== null && !/^A[A-Z0-9]{9,19}$/.test(raw)) throw UserError('own_seller_id must be an Amazon seller ID such as A1B2C3D4E5F6G7');
    D.hubSettings = { own_seller_id: raw, own_seller_note: 'set by demo@sellintel.example', updated_at: ts() }; return { settings: D.hubSettings };
  };

  /* ---------- invoices (paid-by) / accountant ---------- */
  A.invoice_payment_set = function (b) {
    var v = D.invoices.filter(function (x) { return x.id === b.invoice_id; })[0]; if (!v) throw UserError('A valid invoice id is required.');
    var m = String(b.payment_method == null ? '' : b.payment_method).trim();
    if (m !== '' && ['Bank', 'American Express', 'Capital on Tap', 'PayPal'].indexOf(m) < 0) throw UserError('Payment method must be Bank, American Express, Capital on Tap or PayPal.');
    v.payment_method = m === '' ? null : m; return { invoice_id: v.id, payment_method: v.payment_method };
  };
  function quarterOf(d) { // VAT quarters Dec-Feb, Mar-May, Jun-Aug, Sep-Nov
    var dt = U.parseYmd(d), m = dt.getMonth() + 1, y = dt.getFullYear(), sm;
    if (m >= 9 && m <= 11) sm = 9; else if (m >= 6 && m <= 8) sm = 6; else if (m >= 3 && m <= 5) sm = 3; else sm = 12;
    var sy = sm === 12 && m <= 2 ? y - 1 : y;
    var start = new Date(sy, sm - 1, 1, 12), end = new Date(sy, sm + 2, 0, 12);
    var f = function (x) { return U.ymd(x); };
    return { start: f(start), end: f(end), due: f(new Date(end.getFullYear(), end.getMonth() + 2, 7, 12)) };
  }
  function vatPeriod(start, end, partialEnd) {
    var to = partialEnd && partialEnd < end ? partialEnd : end;
    var L = lines(start < D.firstDay ? D.firstDay : start, to);
    var salesGross = sum(L, function (l) { return l.revenue_gross_gbp; }), refundsGross = sum(L, function (l) { return l._l.refund ? l._l.refund.principal : 0; });
    var salesNet = r2(salesGross / VAT - refundsGross / VAT);
    var feesNet = sum(L, function (l) { return l.amazon_fees_net_gbp; });
    var invs = D.invoices.filter(function (v) { return v.invoice_date >= start && v.invoice_date <= to; });
    var outSales = r2(salesGross - salesGross / VAT), outRef = r2(refundsGross - refundsGross / VAT);
    var inFees = r2(feesNet * 0.2), inSup = r2(sum(invs, function (v) { return v.vat_gross_gbp; }));
    var inRec = r2(sum(D.recurring, function (x) { return x.active ? (x.amount_gross_gbp - x.amount_gross_gbp / (1 + x.vat_rate)) * (x.frequency === 'monthly' ? 3 : x.frequency === 'yearly' ? 0.25 : x.frequency === 'quarterly' ? 1 : 12) : 0; }));
    return { input_vat_amazon_fees_gbp: inFees, input_vat_gbp: r2(inFees + inSup), input_vat_recurring_gbp: inRec, input_vat_suppliers_gbp: inSup, not_counted: { advertising_gbp: -r2(salesGross * 0.026), amazon_other_fees_gbp: -r2(sum(L, function (l) { return l.quantity; }) * 0.04) }, output_vat_gbp: r2(outSales - outRef), output_vat_refunds_gbp: outRef, output_vat_sales_gbp: outSales, period_end: end, period_start: start, refunds_net_gbp: r2(refundsGross / VAT), sales_net_gbp: salesNet, supplier_invoices: invs.length, supplier_invoices_without_vat_number: invs.filter(function (v) { return !v.supplier_vat_number && v.vat_gross_gbp > 0; }).length, supplier_vat_not_recoverable_gbp: 0, vat_to_pay_gbp: r2(outSales - outRef - inFees - inSup) };
  }
  function invRow(v) {
    var terms = D.supplierTerms[v.supplier_id], due = v.due_date;
    var dueDate = terms === 0 ? v.invoice_date : addDays(v.invoice_date, terms);
    return { days_overdue: v._paid ? 0 : Math.max(0, U.diffDays(D.today, dueDate)), due_date: dueDate, due_source: terms === 0 ? 'instant' : 'supplier terms', invoice_date: v.invoice_date, invoice_id: v.id, invoice_number: v.invoice_number, paid: !!v._paid, paid_date: v._paid ? v._paidDate : null, paid_manual: !!v._paidManual, supplier: v.supplier_name, supplier_id: v.supplier_id, terms_days: terms, total_gbp: v.total_gross_gbp, vat_gbp: v.vat_gross_gbp };
  }
  A.accountant_overview = function () {
    var q = quarterOf(D.today), prevEnd = addDays(q.start, -1), pq = quarterOf(prevEnd);
    var rows = D.invoices.map(invRow);
    var unpaid = rows.filter(function (x) { return !x.paid; }), due = function (x) { return U.diffDays(x.due_date, D.today); };
    var owed = r2(sum(unpaid, function (x) { return x.total_gbp; })), overdue = r2(sum(unpaid.filter(function (x) { return due(x) < 0; }), function (x) { return x.total_gbp; }));
    var d7 = r2(sum(unpaid.filter(function (x) { return due(x) >= 0 && due(x) <= 7; }), function (x) { return x.total_gbp; })), d30 = r2(sum(unpaid.filter(function (x) { return due(x) >= 0 && due(x) <= 30; }), function (x) { return x.total_gbp; }));
    var pay = A.payouts().payouts;
    var rec30 = r2(sum(D.recurring, function (x) { var n = U.diffDays(x.next_due, D.today); return x.active && n >= 0 && n <= 30 ? x.amount_gross_gbp : 0; }));
    var pending = pay.pending_dd7_total_gbp, released = pay.released_since_last_payout_gbp;
    return {
      as_of: D.today, cash_in: { by_release_date: pay.pending_dd7_by_release_date.map(function (x) { return { amount_gbp: x.amount_gbp, release_date: x.release_date, transactions: x.transactions }; }), expected_total_gbp: r2(pending + released), last_payout_at: pay.last_payout_at, last_payout_gbp: pay.payouts[0] ? pay.payouts[0].amount_gbp : 0, pending_gbp: pending, released_since_last_payout_gbp: released },
      notes: ['Demo data: figures are synthetic and for illustration only.'], position: { expected_in_gbp: r2(pending + released), owed_suppliers_gbp: owed, recurring_30d_gbp: rec30, vat_to_pay_gbp: vatPeriod(q.start, q.end, D.today).vat_to_pay_gbp },
      quarter: { days_to_return_due: U.diffDays(q.due, D.today), end: q.end, return_due: q.due, start: q.start }, recurring: { due_30d_gbp: rec30, items: D.recurring.slice() },
      suppliers: { due_30d_gbp: d30, due_7d_gbp: d7, invoices: rows, overdue_gbp: overdue, owed_gbp: owed }, vat_current: vatPeriod(q.start, q.end, D.today), vat_previous: vatPeriod(pq.start, pq.end), vat_rate: 0.2,
    };
  };
  A.accountant_cogs_vat = function () {
    var q = quarterOf(D.today), L = lines(q.start < D.firstDay ? D.firstDay : q.start, D.today);
    var g = sum(L, function (l) { return l.cogs_gross_gbp; }), n = sum(L, function (l) { return l.cogs_net_gbp; });
    return { cogs_gross_gbp: r2(g), cogs_net_gbp: r2(n), cogs_vat_gbp: r2(g - n), lines: L.length, lines_cost_missing: L.filter(function (l) { return l.cost_missing; }).length, period_end: q.end, period_start: q.start };
  };
  A.accountant_terms_set = function (b) {
    var sid = String(b.supplier_id || ''), days = Number(b.days);
    if (D.supplierTerms[sid] === undefined) throw UserError('A valid supplier id is required.');
    if (!isFinite(days) || Math.floor(days) !== days || days < 0 || days > 365) throw UserError('Payment terms must be a whole number of days from 0 to 365.');
    D.supplierTerms[sid] = days; return { result: { supplier_id: sid, days: days } };
  };
  A.accountant_invoice_paid = function (b) {
    var v = D.invoices.filter(function (x) { return x.id === b.invoice_id; })[0]; if (!v) throw UserError('A valid invoice id is required.');
    v._paid = b.paid !== false; v._paidManual = v._paid; v._paidDate = v._paid ? (b.paid_date || D.today) : null; return { result: { invoice_id: v.id, paid: v._paid } };
  };
  A.accountant_recurring_set = function (b) {
    var name = String(b.name || '').trim(); if (name.length < 1 || name.length > 120) throw UserError('Give the cost a name (up to 120 characters).');
    var amt = Number(b.amount_gross_gbp); if (!isFinite(amt) || amt < 0) throw UserError('Amount must be 0 or more.');
    var vr = Number(b.vat_rate == null ? 0 : b.vat_rate); if (!isFinite(vr) || vr < 0 || vr >= 1) throw UserError('VAT rate must be between 0 and 0.99.');
    var fr = String(b.frequency || ''); if (['weekly', 'monthly', 'quarterly', 'yearly'].indexOf(fr) < 0) throw UserError('Choose weekly, monthly, quarterly or yearly.');
    var item = b.id ? D.recurring.filter(function (x) { return x.id === b.id; })[0] : null;
    if (b.id && !item) throw UserError('Invalid cost id.');
    if (!item) { item = { id: D.liveUuid() }; D.recurring.push(item); }
    item.name = name; item.amount_gross_gbp = amt; item.vat_rate = vr; item.frequency = fr; item.next_due = b.next_due || item.next_due || addDays(D.today, 14); item.active = b.active !== false; item.notes = null;
    return { result: { id: item.id } };
  };

  /* ---------- removals & storage ---------- */
  A.removals_storage = function () {
    var fbaS = D.skus.filter(function (s) { return s.fulfillment === 'FBA'; });
    var rows = [], seed = 0;
    for (var i = 0; i < 9; i++) {
      var s = fbaS[(i * 13 + 2) % fbaS.length], req = U.ri(3, 40), type = i % 3 === 0 ? 'Disposal' : 'Return', st = i < 2 ? 'Pending' : i === 2 ? 'Processing' : 'Completed';
      rows.push({ asin: s.asin, cancelled: 0, disposed: type === 'Disposal' && st === 'Completed' ? req : 0, disposition: i % 4 === 0 ? 'Unsellable' : 'Sellable', fee: r2(req * 0.32), fnsku: 'X00' + s.asin.slice(3), in_process: st === 'Completed' ? 0 : req, last_updated_date: isoAt(addDays(D.today, -i * 5 - 1), 9, 0), order_status: st, order_type: type, removal_order_id: 'RM' + (200000000 + i * 31337 + 4711), request_date: isoAt(addDays(D.today, -i * 5 - 3), 9, 0), requested: req, seller_sku: s.sku, shipped: type === 'Return' && st === 'Completed' ? req : 0, title: s.title });
    }
    var byMonth = {}, byType = {};
    rows.forEach(function (r) { var p = r.request_date.slice(0, 7); var m = byMonth[p] = byMonth[p] || { fee_gbp: 0, n: 0, period: p, units: 0 }; m.fee_gbp = r2(m.fee_gbp + r.fee); m.n++; m.units += r.requested; var t = byType[r.order_type] = byType[r.order_type] || { fee_gbp: 0, n: 0, order_type: r.order_type, units: 0 }; t.fee_gbp = r2(t.fee_gbp + r.fee); t.n++; t.units += r.requested; });
    var last = new Date(D.now.getFullYear(), D.now.getMonth() - 1, 1, 12), lm = U.ymd(last).slice(0, 7);
    var srows = fbaS.filter(function (s) { return s.fulfillable > 0; }).slice(0, 40).map(function (s) { var big = s.weight_g > 2500; return { asin: s.asin, fee: r2(s.fulfillable * (big ? 0.021 : 0.012)), fnsku: 'X00' + s.asin.slice(3), month_of_charge: lm, pending_removal: 0, product_name: s.title, product_size_tier: big ? 'Standard-size, oversize' : 'Small and light', qty: s.fulfillable }; });
    var byTier = {}; srows.forEach(function (r) { var t = byTier[r.product_size_tier] = byTier[r.product_size_tier] || { fee_gbp: 0, n: 0, tier: r.product_size_tier }; t.fee_gbp = r2(t.fee_gbp + r.fee); t.n++; });
    var sByMonth = [0, 1, 2].map(function (k) { var d = new Date(D.now.getFullYear(), D.now.getMonth() - 1 - k, 1, 12), f = r2(sum(srows, function (r) { return r.fee; }) * (1 - k * 0.07)); return { fee_gbp: f, n: srows.length, period: U.ymd(d).slice(0, 7) }; });
    return { generated_at: ts(), removals: { by_month: Object.keys(byMonth).sort().reverse().map(function (k) { return byMonth[k]; }), by_type: Object.keys(byType).map(function (k) { return byType[k]; }), rows: rows, totals: { cancelled_units: 0, disposed_units: sum(rows, function (r) { return r.disposed; }), fee_gbp: r2(sum(rows, function (r) { return r.fee; })), first_request: rows[rows.length - 1].request_date, in_process_units: sum(rows, function (r) { return r.in_process; }), last_request: rows[0].request_date, lines_without_fee: 0, orders: rows.length, requested_units: sum(rows, function (r) { return r.requested; }), shipped_units: sum(rows, function (r) { return r.shipped; }) } },
      storage: { by_month: sByMonth, by_tier: Object.keys(byTier).map(function (k) { return byTier[k]; }), rows: srows, totals: { fee_gbp: r2(sum(srows, function (r) { return r.fee; })), latest_month: lm, rows: srows.length, rows_without_fee: 0, units_on_hand: sum(srows, function (r) { return r.qty; }) } } };
  };

  /* ---------- inventory glance ---------- */
  A.inventory_glance = function () {
    var fba = D.skus.filter(function (s) { return s.fulfillment === 'FBA' && (s.fulfillable + s.inbound + s.reserved + s.unfulfillable) > 0; });
    var tot = 0; fba.forEach(function (s) { tot += s.fulfillable + s.inbound + s.reserved + s.unfulfillable; });
    var rows = fba.map(function (s) {
      var total = s.fulfillable + s.inbound + s.reserved + s.unfulfillable, u30 = D.units30Map[s.sku] || 0, perDay = u30 / 30;
      var age = s.fulfillable, b1 = Math.round(age * 0.5), b2 = Math.round(age * 0.25), b3 = Math.round(age * 0.15), b4 = Math.round(age * 0.07), b5 = Math.max(0, age - b1 - b2 - b3 - b4);
      return { age_at: isoAt(addDays(D.today, -1), 3, 0), asin: s.asin, available: s.fulfillable, category: s.category, cost_missing: s.cost == null, days_of_supply: perDay > 0 ? r2(s.fulfillable / perDay) : null, inbound: s.inbound, other: s.unfulfillable + s.researching, per_day: perDay > 0 ? r2(perDay) : null, qty_0_30: b1, qty_0_90: b1 + b2 + b3, qty_181_270: b4, qty_271_365: b5, qty_31_60: b2, qty_365_plus: 0, qty_61_90: b3, qty_91_180: 0, reserved: s.reserved, root_category: s.root_category, seller_sku: s.sku, share_pct: r2(total / tot * 100), stock_cost_gbp: s.cost != null ? r2(total * s.cost) : null, title: s.title, total: total, unit_cost_gross_gbp: s.cost, units_30d: u30, image_url: null };
    }).sort(function (a, c) { return c.total - a.total; });
    var byCat = {}; rows.forEach(function (x) { var c = byCat[x.category] = byCat[x.category] || { category: x.category, cost_gbp: 0, skus: 0, units: 0 }; c.units += x.total; c.skus++; c.cost_gbp = r2(c.cost_gbp + (x.stock_cost_gbp || 0)); });
    var buckets = [['0-30 days', 'qty_0_30'], ['31-60 days', 'qty_31_60'], ['61-90 days', 'qty_61_90'], ['91-180 days', 'qty_91_180'], ['181-270 days', 'qty_181_270'], ['271-365 days', 'qty_271_365'], ['365+ days', 'qty_365_plus']].map(function (b) { return { label: b[0], units: sum(rows, function (r) { return r[b[1]]; }) }; });
    return { age: { buckets: buckets, report_at: isoAt(addDays(D.today, -1), 3, 0), skus_with_age: rows.length, skus_without_age: 0, split: true }, by_category: Object.keys(byCat).map(function (k) { return byCat[k]; }).sort(function (a, c) { return c.units - a.units; }), generated_at: ts(), skus: rows,
      snapshot_at: isoAt(D.today, 4, 10), totals: { available: sum(rows, function (r) { return r.available; }), inbound: sum(rows, function (r) { return r.inbound; }), other: sum(rows, function (r) { return r.other; }), reserved: sum(rows, function (r) { return r.reserved; }), skus: rows.length, skus_no_cost: rows.filter(function (r) { return r.cost_missing; }).length, stock_cost_gbp: r2(sum(rows, function (r) { return r.stock_cost_gbp; })), units: tot } };
  };

  /* ---------- leads ---------- */
  var LEAD_PUB_SKIP = { _profit_ok: 1 };
  function leadPub(c, i) { var o = {}; for (var k in c) if (!LEAD_PUB_SKIP[k]) o[k] = c[k]; o.wishlisted = !!D.wishlist[c.asin]; o.ord = i; return o; }
  A.leads_search = function (b) {
    var f = b.filters && typeof b.filters === 'object' ? b.filters : {};
    var num_ = function (v) { if (v === undefined || v === null || v === '') return null; var n = Number(v); if (!isFinite(n)) throw UserError('Filter values must be numbers.'); return n; };
    var minRoi = num_(f.min_roi), minProfit = num_(f.min_profit), minSales = num_(f.min_sales);
    var all = D.candidates.map(leadPub);
    var counts = { all_n: all.length, data_gap_n: all.filter(function (c) { return c.data_gap && c.profit_gbp > 0; }).length, qualified_n: all.filter(function (c) { return c.qualification_status === 'qualified'; }).length, rejected_n: all.filter(function (c) { return c.qualification_status === 'rejected'; }).length, review_n: all.filter(function (c) { return c.qualification_status === 'review'; }).length, wishlist_n: all.filter(function (c) { return c.wishlisted; }).length };
    var rows = all;
    var st = String(f.status || 'all');
    if (st === 'data_gap') rows = rows.filter(function (c) { return c.data_gap && c.profit_gbp > 0; }); else if (st === 'wishlist') rows = rows.filter(function (c) { return c.wishlisted; }); else if (st !== 'all' && st !== '') rows = rows.filter(function (c) { return c.qualification_status === st; });
    if (f.confidence) rows = rows.filter(function (c) { return c.confidence_label === f.confidence; });
    if (f.category) rows = rows.filter(function (c) { return c.category === f.category; });
    if (minRoi != null) rows = rows.filter(function (c) { return c.roi_pct >= minRoi; });
    if (minProfit != null) rows = rows.filter(function (c) { return c.profit_gbp >= minProfit; });
    if (minSales != null) rows = rows.filter(function (c) { return (c.monthly_sales_est || 0) >= minSales; });
    if (f.search) rows = searchFilter(rows, f.search, ['amazon_title', 'asin', 'brand', 'supplier_name', 'supplier_title']);
    var sort = f.sort || 'default';
    rows = rows.slice().sort(function (a, c) {
      if (sort === 'roi') return c.roi_pct - a.roi_pct; if (sort === 'profit') return c.profit_gbp - a.profit_gbp; if (sort === 'sales') return (c.monthly_sales_est || 0) - (a.monthly_sales_est || 0); if (sort === 'rank') return (a.sales_rank || 1e9) - (c.sales_rank || 1e9);
      if (sort === 'newest') return cmp(c.created_at, a.created_at);
      var w = { qualified: 0, review: 1, rejected: 2 }; return (w[a.qualification_status] - w[c.qualification_status]) || cmp(c.created_at, a.created_at);
    });
    var lim = Math.min(1000, Math.max(1, Math.trunc(num(b.limit, 100)) || 100)), off = Math.max(0, Math.trunc(num(b.offset, 0)));
    var cats = Array.from(new Set(D.candidates.map(function (c) { return c.category; }))).sort();
    return { categories: cats, counts: counts, rows: rows.slice(off, off + lim), total: rows.length };
  };
  A.wishlist_set = function (b) {
    var asin = String(b.asin || '').trim().toUpperCase(); if (!/^[A-Z0-9]{10}$/.test(asin)) throw UserError('A valid ASIN is required.');
    if (b.on === false) delete D.wishlist[asin]; else D.wishlist[asin] = true;
    return { asin: asin, on: b.on !== false };
  };
  A.lead_alerts_get = function () { return D.leadAlerts; };
  A.lead_alerts_set = function (b) {
    var rec = Array.isArray(b.recipients) ? b.recipients.map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean) : [];
    if (rec.length > 5) throw UserError('At most 5 recipient emails.');
    if (rec.some(function (x) { return !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(x); })) throw UserError('One of the recipient emails is not valid.');
    if (b.enabled === true && rec.length === 0) throw UserError('Add at least one recipient before turning alerts on.');
    var n = function (v, lo, hi, label) { var x = Number(v); if (!isFinite(x) || x < lo || x > hi) throw UserError(label + ' must be a number between ' + lo + ' and ' + hi + '.'); return x; };
    D.leadAlerts = { enabled: b.enabled === true, enabled_since: b.enabled === true ? (D.leadAlerts.enabled_since || ts()) : null, include_data_gap: b.include_data_gap !== false, min_profit: n(b.min_profit, 0, 100000, 'Minimum profit'), min_roi: n(b.min_roi, 0, 10000, 'Minimum ROI'), recipients: rec, updated_at: ts(), updated_by: 'demo@sellintel.example' };
    return D.leadAlerts;
  };
})();
