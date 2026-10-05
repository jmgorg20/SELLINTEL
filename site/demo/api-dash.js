/* SELLINTEL demo: dashboard actions + the smaller function routes + the spend-summary rpc. */
(function () {
  'use strict';
  var D = window.__DEMO, U = D.U, VAT = D.VAT, UserError = D.UserError;
  var r2 = U.r2, addDays = U.addDays, isoAt = U.isoAt, isoDaysAgo = U.isoDaysAgo, ri = U.ri, pick = U.pick, chance = U.chance;
  var G = (D.dash = {});
  var A = (G.actions = {});
  var nowIso = function () { return new Date().toISOString(); };
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function strip(o) { var x = {}; for (var k in o) if (k.charAt(0) !== '_') x[k] = o[k]; return x; }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function lim(b, d, max) { return Math.max(1, Math.min(Math.trunc(num(b.limit, d)) || d, max || 500)); }
  function sum(a, f) { var t = 0; a.forEach(function (x) { var v = f(x); if (v != null && isFinite(v)) t += v; }); return t; }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function later(fn, ms) { try { setTimeout(function () { try { fn(); } catch (e) { /* ignore */ } }, ms); } catch (e) { /* ignore */ } }
  function supplierByName(n) { n = String(n || '').trim().toLowerCase(); return D.suppliers.filter(function (s) { return s.name.toLowerCase() === n; })[0] || null; }

  // supplier orders: the review state is called review_required in the product
  D.supplierOrders.forEach(function (o) { if (o.status === 'awaiting_approval') o.status = 'review_required'; });

  /* ================= reorders (derived from stock + sales) ================= */
  function reorderRows() {
    var sohBy = {}; D.stockOnHand.forEach(function (x) { sohBy[x.sku] = x; });
    var rows = D.skus.map(function (s) {
      var inv = D.invItems[s.n];
      var avg = (D.units30Map[s.sku] || 0) / 30;
      var fba = s.fulfillment === 'FBA' ? s.fulfillable : 0;
      var wh = sohBy[s.sku] ? sohBy[s.sku].quantity : (s.fulfillment === 'FBM' ? s.fbmQty : 0);
      var inbound = s.inbound || 0, reserved = s.reserved || 0;
      var avail = fba + wh + inbound;
      var lead = inv.supplier_lead_time_days || 7;
      var cover = avg > 0 ? avail / avg : 999;
      var due = avg >= 0.12 && cover < lead + 26;
      var rec = due ? Math.max(6, Math.ceil((avg * (30 + lead) - avail) / 6) * 6) : 0;
      return {
        workspace_id: D.workspace.id, inventory_item_id: inv.id, merchant_sku: s.sku, title: s.title, image_url: null, asin: s.asin, supplier_name: s.supplier.name,
        warehouse_qty: wh, fba_qty: fba, inbound_qty: inbound, reserved_qty: reserved, available_qty: avail, avg_daily_sales_30d: r2(avg), days_of_cover: avg > 0 ? r2(cover) : null,
        reorder_point_qty: Math.ceil(avg * lead) + inv.safety_stock_qty, supplier_lead_time_days: lead, reorder_due: due, recommended_order_qty: rec,
        reorder_product_url: s.supplier.site + '/p/' + s.typeCode.toLowerCase() + '-' + s.n,
        _cover: cover,
      };
    });
    return rows;
  }
  G.reorderRows = reorderRows;
  function reorderAlerts() {
    return reorderRows().filter(function (r) { return r.reorder_due; }).map(function (r) {
      var h = hash(r.merchant_sku);
      return {
        alert_id: 'ra-' + hash(r.merchant_sku).toString(16), workspace_id: D.workspace.id, inventory_item_id: r.inventory_item_id, status: (D.reorderAck || {})[r.merchant_sku] ? 'acknowledged' : 'open',
        severity: r._cover < 7 ? 'critical' : 'warning', title: r.title, merchant_sku: r.merchant_sku, current_available_qty: r.available_qty, recommended_order_qty: r.recommended_order_qty,
        reorder_product_url: r.reorder_product_url, created_at: isoDaysAgo(h % 5, 6 + (h % 8)),
      };
    });
  }
  G.reorderAlerts = reorderAlerts;

  A.reorders_list = function (b) {
    var rows = reorderRows();
    if (b.reorder_due !== undefined) rows = rows.filter(function (r) { return r.reorder_due === (b.reorder_due === true); });
    rows.sort(function (a, c) { return c.recommended_order_qty - a.recommended_order_qty || cmp(a.title, c.title); });
    return { ok: true, items: rows.slice(0, lim(b, 200, 500)).map(strip) };
  };
  A.reorder_alerts_list = function (b) {
    var rows = reorderAlerts().filter(function (a) { return !b.status || a.status === b.status; });
    return { ok: true, alerts: rows.slice(0, lim(b, 100, 500)) };
  };
  A.reorder_alerts_detail_list = function (b) {
    var st = b.status || 'open';
    var rows = reorderAlerts().filter(function (a) { return a.status === st; }).sort(function (a, c) { return cmp(c.created_at, a.created_at); });
    return { ok: true, alerts: rows.slice(0, lim(b, 1000, 2000)) };
  };
  A.reorders_refresh = function () {
    return { ok: true, reorder_due_count: reorderAlerts().length };
  };

  /* ================= purchases / inventory / invoices ================= */
  A.inventory_list = function (b) {
    var rows = D.invItems.filter(function (x) { return b.active === undefined || x.active === (b.active === true); });
    return { ok: true, items: rows.slice(0, lim(b, 100, 500)) };
  };
  A.purchases_list = function (b) {
    var rows = D.purchases.slice().sort(function (a, c) { return cmp(c.ordered_at, a.ordered_at); }).filter(function (p) { return !b.status || p.status === b.status; });
    return { ok: true, purchases: rows.slice(0, lim(b, 100, 500)).map(strip) };
  };
  A.purchase_items_detail_list = function (b) {
    var rows = D.purchaseItems.slice().sort(function (a, c) { return cmp(c.ordered_at, a.ordered_at); });
    if (b.purchase_id) rows = rows.filter(function (x) { return x.purchase_id === String(b.purchase_id); });
    return { ok: true, items: rows.slice(0, lim(b, 100, 500)) };
  };
  A.supplier_orders_list = function (b) {
    var rows = D.supplierOrders.filter(function (o) { return !b.status || o.status === b.status; });
    return { ok: true, orders: rows.slice(0, lim(b, 100, 500)) };
  };
  A.supplier_order_approve = function (b) {
    if (!b.supplier_order_id) throw new UserError('supplier_order_id is required');
    var o = D.supplierOrders.filter(function (x) { return x.id === String(b.supplier_order_id); })[0];
    if (!o || o.status !== 'review_required') throw new UserError('This supplier order is not waiting for approval.');
    o.status = 'approved'; o.approved_by = D.userId; o.approved_at = nowIso(); o.updated_at = nowIso(); o.approval_required = false;
    return { ok: true, order: o };
  };
  A.invoices_list = function (b) {
    var rows = D.invoices.filter(function (v) { return !b.status || v.status === b.status; }).sort(function (a, c) { return cmp(c.invoice_date, a.invoice_date); });
    return { ok: true, invoices: rows.slice(0, lim(b, 100, 500)).map(strip) };
  };
  A.invoice_match = function (b) {
    if (!b.invoice_id || !b.purchase_id) throw new UserError('invoice_id and purchase_id are required');
    var v = D.invoices.filter(function (x) { return x.id === String(b.invoice_id); })[0];
    if (v) { v.status = 'matched'; v._purchase = String(b.purchase_id); v.updated_at = nowIso(); }
    return { ok: true, match: { id: D.liveUuid(), invoice_id: String(b.invoice_id), purchase_id: String(b.purchase_id), match_status: 'confirmed', confidence: b.confidence == null ? 1 : num(b.confidence, 1), updated_at: nowIso() } };
  };
  A.invoice_correct = function (b) {
    if (!b.invoice_id) throw new UserError('invoice_id is required');
    var v = D.invoices.filter(function (x) { return x.id === String(b.invoice_id); })[0];
    if (!v) throw new UserError('Invoice not found in this workspace.');
    ['invoice_number', 'invoice_date', 'due_date', 'currency', 'subtotal_gross_gbp', 'vat_gross_gbp', 'total_gross_gbp', 'supplier_vat_number'].forEach(function (k) { if (b[k] !== undefined && b[k] !== '') v[k] = (/_gbp$/.test(k) ? num(b[k]) : b[k]); });
    if (typeof b.supplier_name === 'string' && b.supplier_name.trim()) {
      var sup = supplierByName(b.supplier_name);
      if (sup) v.supplier_id = sup.id;
      v.supplier_name = b.supplier_name.trim();
    }
    if (v.status === 'review_required') v.status = 'matched';
    v.updated_at = nowIso();
    return { ok: true, invoice: strip(v) };
  };
  function pickCol(row, re) { for (var k in row) if (re.test(k) && row[k] != null && row[k] !== '') return row[k]; return null; }
  A.purchases_csv_import = function (b) {
    var rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) throw new UserError('rows is required');
    if (rows.length > 2000) throw new UserError('A single upload is limited to 2000 rows');
    var inserted = 0, skipped = 0, errors = [];
    rows.forEach(function (row, i) {
      var title = pickCol(row, /product|title|name|item|description/i);
      var cost = num(String(pickCol(row, /cost|price|unit/i) || '').replace(/[^0-9.\-]/g, ''), NaN);
      var qty = Math.max(1, Math.round(num(pickCol(row, /qty|quantity|units/i), 1)));
      if (!title || !isFinite(cost) || cost <= 0) { errors.push({ row: i + 1, error: 'Missing product name or a valid cost price.' }); return; }
      var key = String(title).toLowerCase();
      if (D.purchaseItems.some(function (x) { return x._csvKey === key; })) { skipped++; return; }
      var sup = supplierByName(pickCol(row, /store|supplier|vendor/i)) || pick(D.suppliers);
      var sk = D.skus.filter(function (s) { return s.title.toLowerCase() === key; })[0] || null;
      var sale = sk ? sk.price : r2(cost * 2.4);
      var feeG = r2(sale * 0.153 + 2.4), prof = r2(sale / VAT - feeG / VAT - (sup.vat ? cost / VAT : cost) - 0.1);
      var pid = D.liveUuid(), num_ = 'PO-' + (3000 + D.purchases.length);
      var ordered = nowIso();
      D.purchases.unshift({ id: pid, workspace_id: D.workspace.id, purchase_number: num_, supplier_id: sup.id, source: 'csv_import', status: 'ordered', ordered_at: ordered, expected_at: isoAt(addDays(D.today, 4), 12, 0), received_at: null, currency: 'GBP', subtotal_gross_gbp: r2(cost * qty), shipping_gross_gbp: 0, vat_gross_gbp: 0, total_gross_gbp: r2(cost * qty), external_ref: null, idempotency_key: 'demo-' + pid, notes: null, metadata: {}, created_at: ordered, updated_at: ordered, _supplier: sup });
      var item = { workspace_id: D.workspace.id, purchase_item_id: D.liveUuid(), purchase_id: pid, purchase_number: num_, ordered_at: ordered, source: 'csv_import', purchase_status: 'ordered', store_name: sup.name, product_name: String(title), asin: sk ? sk.asin : null, merchant_sku: sk ? sk.sku : null, supplier_sku: pickCol(row, /sku|code/i), brand: sk ? sk.brand : null, category: sk ? sk.category : null, cost_price_gbp: cost, sale_price_gbp: sale, profit_per_unit_gbp: prof, potential_roi_pct: r2(prof / ((sup.vat ? cost / VAT : cost) + 0.1) * 100), quantity: qty, cost_total_gbp: r2(cost * qty), profit_total_gbp: r2(prof * qty), source_url: null, amazon_url: sk ? 'https://www.amazon.co.uk/dp/' + sk.asin : null, amazon_fee_gross_gbp: feeG, fee_is_estimated: true, _csvKey: key };
      D.purchaseItems.unshift(item);
      inserted++;
    });
    return { ok: true, total_rows: rows.length, inserted: inserted, skipped_duplicates: skipped, errors: errors };
  };

  /* ================= profit views ================= */
  function dayRows() {
    var by = {};
    D.lines().forEach(function (l) { (by[l.sale_date] = by[l.sale_date] || []).push(l); });
    return by;
  }
  function profitRows(days) {
    var by = dayRows(), start = addDays(D.today, -(days - 1)), out = [];
    Object.keys(by).forEach(function (d) {
      if (d < start) return;
      var L = by[d], complete = L.filter(function (l) { return l._complete; });
      var est = r2(sum(complete, function (l) { return l.profit_gbp; }));
      var old = d <= addDays(D.today, -14);
      out.push({
        workspace_id: D.workspace.id, metric_date: d, revenue_gross_gbp: r2(sum(L, function (l) { return l.revenue_gross_gbp; })), estimated_profit_gbp: est,
        settled_profit_gbp: old ? r2(est * 0.985) : null, units_sold: sum(L, function (l) { return l.quantity; }), reconciliation_status: old ? 'settled' : (d >= addDays(D.today, -2) ? 'pending' : 'estimated'),
        created_at: isoAt(addDays(d, 1), 3, 10), updated_at: isoAt(addDays(d, 1), 3, 10),
      });
    });
    out.sort(function (a, c) { return cmp(c.metric_date, a.metric_date); });
    return out;
  }
  G.profitRows = profitRows;
  A.profit_list = function (b) { return { ok: true, rows: profitRows(Math.max(1, Math.min(num(b.days, 30), 366))) }; };
  A.profit_channel_list = function (b) {
    var days = Math.max(1, Math.min(num(b.days, 30), 366)), start = addDays(D.today, -(days - 1)), m = {};
    D.lines().forEach(function (l) {
      if (l.sale_date < start) return;
      var fb = l.fulfillment_class === 'FBA' ? 'AMAZON' : 'MERCHANT', k = l.sale_date + '|' + fb;
      var r = m[k] = m[k] || { workspace_id: D.workspace.id, metric_date: l.sale_date, fulfilled_by: fb, units_sold: 0, revenue_gross_gbp: 0, orders: 0 };
      r.units_sold += l.quantity; r.revenue_gross_gbp = r2(r.revenue_gross_gbp + l.revenue_gross_gbp); r.orders++;
    });
    var rows = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, c) { return cmp(c.metric_date, a.metric_date) || cmp(a.fulfilled_by, c.fulfilled_by); });
    return { ok: true, rows: rows };
  };
  A.profit_day_detail_list = function (b) {
    var d = String(b.metric_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new UserError('metric_date (YYYY-MM-DD) is required');
    var rows = D.lines().filter(function (l) { return l.sale_date === d; }).map(function (l) {
      return { workspace_id: D.workspace.id, metric_date: d, order_item_id: l.order_item_id, amazon_order_id: l.amazon_order_id, product_title: l.title, asin: l.asin, seller_sku: l.seller_sku, fulfillment_class: l.fulfillment_class, quantity: l.quantity,
        revenue_gross_gbp: l.revenue_gross_gbp, cogs_net_gbp: l.cogs_net_gbp, amazon_fee_net_gbp: l.amazon_fees_net_gbp, fbm_postage_gbp: l.fulfillment_class === 'FBM' ? l.fbm_postage_gbp : 0, net_profit_gbp: l.profit_gbp };
    }).sort(function (a, c) { return c.revenue_gross_gbp - a.revenue_gross_gbp; });
    return { ok: true, lines: rows.slice(0, lim(b, 500, 1000)) };
  };
  A.amazon_orders_list = function (b) {
    var by = {}, order = [];
    D.lines().forEach(function (l) {
      var o = by[l.amazon_order_id];
      if (!o) { o = by[l.amazon_order_id] = { workspace_id: D.workspace.id, amazon_order_record_id: 'rec-' + l.amazon_order_id, amazon_order_id: l.amazon_order_id, purchase_date: l.purchase_date, order_status: l.order_status, fulfilled_by: l._o.fulfilled_by, item_count: 0, _asins: [], order_total_gross: 0, proceeds_gross: 0 }; order.push(o); }
      o.item_count += l.quantity; o._asins.push(l.asin); o.order_total_gross = r2(o.order_total_gross + l.revenue_gross_gbp);
      o.proceeds_gross = r2(o.proceeds_gross + l.revenue_gross_gbp - (l.amazon_fees_net_gbp || 0) * VAT);
    });
    var rows = order.map(function (o) { o.asins = o._asins.join(', '); return strip(o); });
    if (b.fulfilled_by) rows = rows.filter(function (o) { return o.fulfilled_by === String(b.fulfilled_by).toUpperCase(); });
    rows.sort(function (a, c) { return cmp(c.purchase_date, a.purchase_date); });
    return { ok: true, orders: rows.slice(0, lim(b, 200, 500)) };
  };

  /* ================= alerts, discrepancies, discord, health, settings ================= */
  A.alerts_list = function (b) {
    var rows = D.alerts.filter(function (a) { return (!b.status || a.status === b.status) && (!b.severity || a.severity === b.severity); }).sort(function (a, c) { return cmp(c.created_at, a.created_at); });
    return { ok: true, alerts: rows.slice(0, lim(b, 100, 500)) };
  };
  A.discrepancies_list = function (b) {
    var rows = D.discrepancies.filter(function (a) { return a.status === 'open' && (!b.severity || a.severity === b.severity); }).sort(function (a, c) { return cmp(c.created_at, a.created_at); });
    return { ok: true, discrepancies: rows.slice(0, lim(b, 100, 500)) };
  };
  A.discord_list = function (b) {
    var rows = D.discord.filter(function (e) { return !b.status || e.status === b.status; });
    return { ok: true, events: rows.slice(0, lim(b, 100, 500)) };
  };
  A.integrations_health = function () { return { ok: true, integrations: D.integrations }; };
  A.settings_get = function () {
    var s = {}; for (var k in D.sourcingSettings) s[k] = D.sourcingSettings[k];
    var suppliers = D.suppliers.map(function (x, i) {
      return { id: x.id, slug: x.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: x.name, website_url: x.site, access_type: x.terms > 0 ? 'trade_account' : 'public_web', connector_strategy: i % 3 === 0 ? 'feed_import' : 'page_scan', enabled: true, priority: (i + 1) * 10, notes: null };
    });
    return { ok: true, workspace: D.workspace, settings: s, suppliers: suppliers };
  };

  /* ================= price watch ================= */
  function liveWatches() { return D.watches.filter(function (w) { return !w.deleted_at; }); }
  A.price_watch_list = function (b) {
    var rows = liveWatches().filter(function (w) { return b.include_inactive === true || w.active; });
    return { ok: true, watches: rows.slice().sort(function (a, c) { return cmp(c.created_at, a.created_at); }) };
  };
  A.price_watch_get = function (b) {
    if (!b.watch_id) throw new UserError('watch_id is required');
    var w = liveWatches().filter(function (x) { return x.id === String(b.watch_id); })[0];
    if (!w) throw new UserError('Watch not found.');
    return { ok: true, watch: w, observations: D.watchObs.filter(function (o) { return o.watch_id === w.id; }).slice(0, 30) };
  };
  A.price_watch_upsert = function (b) {
    var d = b.watch || {};
    var title = String(d.product_title || d.name || '').trim(), url = String(d.product_url || '').trim(), target = num(d.target_price_gbp, 0);
    if (!title) throw new UserError('product_title is required');
    if (!/^https:\/\//i.test(url)) throw new UserError('product_url must be a valid https URL');
    if (!(target > 0)) throw new UserError('target_price_gbp must be greater than zero');
    var iv = Math.round(num(d.check_interval_minutes, 60));
    if (iv < 30 || iv > 1440) throw new UserError('check_interval_minutes must be between 30 and 1440');
    var w = d.id ? liveWatches().filter(function (x) { return x.id === String(d.id); })[0] : null;
    var sup = supplierByName(d.supplier_name);
    var fresh = !w;
    if (!w) {
      w = { id: D.liveUuid(), workspace_id: D.workspace.id, supplier_id: sup ? sup.id : null, name: title, product_title: title, supplier_sku: null, ean: null, upc: null, mpn: null, active: true, threshold_state: null, trigger_sequence: 0, last_checked_at: null,
        next_check_at: new Date(Date.now() + 120000).toISOString(), last_price_gbp: null, last_in_stock: null, last_source: null, last_error: null, consecutive_failures: 0, last_triggered_at: null, last_alert_price_gbp: null, last_alert_id: null, metadata: {}, deleted_at: null, created_at: nowIso() };
      D.watches.unshift(w);
    }
    w.name = title; w.product_title = title; w.product_url = url; w.supplier_name = d.supplier_name ? String(d.supplier_name).trim() : (sup ? sup.name : null); w.asin = d.asin ? String(d.asin).trim().toUpperCase() : null;
    w.target_price_gbp = target; w.check_interval_minutes = iv; w.email_alert_enabled = d.email_alert_enabled === true; w.email_to = w.email_alert_enabled ? String(d.email_to || '') : null; w.updated_at = nowIso();
    if (d.active !== undefined) w.active = d.active === true;
    if (fresh) later(function () {
      var p = r2(target * (0.9 + Math.random() * 0.4));
      w.last_checked_at = nowIso(); w.last_price_gbp = p; w.last_in_stock = true; w.last_source = 'html'; w.threshold_state = p <= target ? 'below_target' : 'above_target';
      D.watchObs.unshift({ id: D.liveUuid(), workspace_id: D.workspace.id, watch_id: w.id, observed_at: nowIso(), price_gbp: p, in_stock: true, source: 'html', source_url: url, confidence: 0.95, raw_payload: {}, created_at: nowIso() });
    }, 2500);
    return { ok: true, watch: w };
  };
  function watchById(b) {
    if (!b.watch_id) throw new UserError('watch_id is required');
    var w = liveWatches().filter(function (x) { return x.id === String(b.watch_id); })[0];
    if (!w) throw new UserError('Watch not found.');
    return w;
  }
  A.price_watch_pause = function (b) { var w = watchById(b); w.active = false; w.updated_at = nowIso(); return { ok: true, watch: w }; };
  A.price_watch_resume = function (b) { var w = watchById(b); w.active = true; w.updated_at = nowIso(); w.next_check_at = new Date(Date.now() + 90000).toISOString(); return { ok: true, watch: w }; };
  A.price_watch_delete = function (b) { var w = watchById(b); w.deleted_at = nowIso(); w.active = false; return { ok: true, deleted: true, watch_id: w.id }; };

  /* ================= sourcing: runs, queue, candidates, scans ================= */
  function profileById(id) { return D.profiles.filter(function (p) { return p.id === id; })[0] || null; }
  function profileBySlug(s) { return D.profiles.filter(function (p) { return p.slug === s; })[0] || null; }
  function newCandidate(opts) {
    var t = opts.type || pick(D.TYPES), brand = pick(D.BRANDS), size = pick(t[4]);
    var sell = r2(ri(Math.round(t[5][0] * 90), Math.round(t[5][1] * 120)) / 100); sell = Math.floor(sell) + (chance(0.5) ? 0.99 : 0.49); if (sell < 3.49) sell = 3.49;
    var buy = opts.buy != null ? opts.buy : r2(sell * (0.34 + Math.random() * 0.34));
    var sup = opts.supplier || D.suppliers.filter(function (x) { return x.code === pick(t[10]); })[0] || D.suppliers[0], feeG = r2(sell * t[8] * 1.02 + t[7]);
    var buyNet = sup.vat ? r2(buy / VAT) : buy, prep = 0.35;
    var profit = r2(sell / VAT - feeG / VAT - buyNet - prep), roi = r2(profit / (buyNet + prep) * 100), margin = r2(profit / (sell / VAT) * 100);
    var monthly = ri(60, 900), rank = ri(2000, 70000);
    var status = roi >= 30 && profit >= 2 ? 'qualified' : (roi >= 18 && profit >= 1.2 ? 'review' : 'rejected');
    var pf = opts.profile || D.profiles[0];
    var title = opts.title || (brand + ' ' + t[2] + ' ' + size);
    var asin = 'B0DEMO' + (900000 + D.candidates.length * 7 + ri(0, 6)).toString(36).toUpperCase().slice(-4);
    return {
      workspace_id: D.workspace.id, id: D.liveUuid(), created_at: nowIso(), asin: asin, amazon_title: title, brand: brand, sell_price_gross_gbp: sell, buy_cost_gross_gbp: buy, profit_gbp: profit, roi_pct: roi, margin_pct: margin,
      sales_rank: rank, monthly_sales_est: monthly, seller_count: ri(1, 9), competing_stock: null, stock_to_spm_ratio: null, amazon_on_listing: null, amazon_buy_box_shared: null, qualification_status: status,
      qualification_reasons: status === 'qualified' ? ['roi_meets_threshold', 'profit_meets_threshold'] : status === 'review' ? ['low_match_confidence', 'needs_manual_check'] : ['roi_below_threshold'], needs_review: status === 'review',
      supplier_product_url: opts.url || (sup.site + '/p/' + t[3].toLowerCase() + '-' + ri(100, 999)), supplier_title: opts.title ? opts.title : title + ' (case of ' + pick([6, 12, 24]) + ')', supplier_name: sup.name,
      match_method: opts.ean ? 'ean' : 'title_similarity', match_confidence: opts.ean ? 0.97 : 0.62, exact_match: !!opts.ean, sourcing_profile_id: pf.id, sourcing_profile_slug: pf.slug, sourcing_profile_name: pf.name, amazon_fees_gross_gbp: feeG,
      max_cost_gbp: r2(sell * 0.62), referral_fee_pct: t[8] * 100, run_id: opts.runId || null, supplier_match_id: D.liveUuid(), idempotency_key: 'demo-cand-live-' + D.liveUuid(), prep_shipping_gbp: prep, other_costs_gbp: 0,
      supplier_vat_recoverable: sup.vat, amazon_fee_vat_recoverable: true, buy_cost_net_gbp: buyNet,
      category: t[0], confidence_label: opts.ean ? 'high' : 'low', confidence_pct: opts.ean ? 97 : 62, data_gap: false, sales_source: 'keepa', wishlisted: false, ord: 0, _profit_ok: profit > 0,
    };
  }
  function startRun(profile, target, extra) {
    var run = {
      id: D.liveUuid(), run_type: 'reverse_sourcing', status: 'running', rules_version: 'v3', target_lead_count: target, started_at: nowIso(), completed_at: null, candidates_discovered: 0, supplier_matches_found: 0, qualified_count: 0, rejected_count: 0, review_count: 0, error_count: 0,
      metadata: { source: 'manual' }, created_at: nowIso(), updated_at: nowIso(), workspace_id: D.workspace.id, sourcing_profile_id: profile ? profile.id : null, queue_id: null, queue_position: null, sourcing_profiles: { name: profile ? profile.name : 'Default' },
    };
    for (var k in (extra || {})) run[k] = extra[k];
    D.runs.unshift(run);
    // simulate the run finishing a few seconds later and adding some leads
    var n = Math.max(2, Math.min(target, 6));
    later(function () {
      var made = [], i;
      for (i = 0; i < n; i++) { var c = newCandidate({ profile: profile || D.profiles[0], runId: run.id, supplier: extra && extra._supplier }); made.push(c); }
      made.forEach(function (c) { D.candidates.unshift(c); });
      var q = made.filter(function (c) { return c.qualification_status === 'qualified'; }).length, rv = made.filter(function (c) { return c.qualification_status === 'review'; }).length;
      run.status = 'completed'; run.completed_at = nowIso(); run.updated_at = run.completed_at; run.candidates_discovered = n * 24 + ri(0, 30); run.supplier_matches_found = n * 6;
      run.qualified_count = q; run.review_count = rv; run.rejected_count = n - q - rv;
      if (run.queue_id) advanceQueue(run);
    }, 6500);
    return run;
  }
  A.sourcing_start = function (b) {
    var pf = b.sourcing_profile_id ? profileById(String(b.sourcing_profile_id)) : (D.profiles.filter(function (p) { return p.is_default; })[0] || D.profiles[0]);
    if (b.sourcing_profile_id && !pf) throw new UserError('Sourcing profile not found.');
    var target = Math.max(1, Math.min(num(b.target_lead_count, 10), 50));
    return { ok: true, run: startRun(pf, target) };
  };
  A.sourcing_runs_list = function (b) {
    var rows = D.runs.filter(function (r) { return !b.status || r.status === b.status; }).slice().sort(function (a, c) { return cmp(c.created_at, a.created_at); });
    return { ok: true, runs: rows.slice(0, lim(b, 50, 200)) };
  };
  A.candidates_list = function (b) {
    var rows = D.candidates.filter(function (c) { return !b.status || c.qualification_status === b.status; });
    return { ok: true, candidates: rows.slice(0, lim(b, 100, 500)).map(strip) };
  };
  function candidateById(id) { return D.candidates.filter(function (c) { return c.id === String(id); })[0] || null; }
  A.candidate_status_update = function (b) {
    if (!b.candidate_id || !b.qualification_status) throw new UserError('candidate_id and qualification_status are required');
    var st = String(b.qualification_status);
    if (['qualified', 'review', 'rejected', 'skipped'].indexOf(st) < 0) throw new UserError('qualification_status must be one of: qualified, review, rejected, skipped');
    var c = candidateById(b.candidate_id); if (!c) throw new UserError('Candidate not found in this workspace.');
    c.qualification_status = st; c.needs_review = st === 'review';
    return { ok: true, candidate: strip(c) };
  };
  A.candidate_cost_update = function (b) {
    if (!b.candidate_id) throw new UserError('candidate_id is required');
    var cost = Number(b.buy_cost_gross_gbp);
    if (!isFinite(cost) || cost <= 0) throw new UserError('buy_cost_gross_gbp must be a positive number');
    var c = candidateById(b.candidate_id); if (!c) throw new UserError('Candidate not found in this workspace.');
    c.buy_cost_gross_gbp = r2(cost);
    c.buy_cost_net_gbp = c.supplier_vat_recoverable ? r2(cost / VAT) : r2(cost);
    c.profit_gbp = r2(c.sell_price_gross_gbp / VAT - c.amazon_fees_gross_gbp / VAT - c.buy_cost_net_gbp - c.prep_shipping_gbp - c.other_costs_gbp);
    c.roi_pct = r2(c.profit_gbp / (c.buy_cost_net_gbp + c.prep_shipping_gbp) * 100);
    c.margin_pct = r2(c.profit_gbp / (c.sell_price_gross_gbp / VAT) * 100);
    c._profit_ok = c.profit_gbp > 0;
    var ok = c.roi_pct >= 30 && c.profit_gbp >= 2;
    c.qualification_status = ok ? 'qualified' : (c.roi_pct >= 18 && c.profit_gbp >= 1.2 ? 'review' : 'rejected'); c.needs_review = c.qualification_status === 'review';
    return { ok: true, candidate: strip(c) };
  };
  function scanName(b) { return String(b.supplier_name || b.supplier_slug || '').trim(); }
  A.scan_items_batch = function (b) {
    var name = scanName(b); if (!name) throw new UserError('supplier_name is required');
    var items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) throw new UserError('items is required and must be a non-empty array');
    if (items.length > 300) throw new UserError('Maximum 300 items per scan batch request - send larger catalogs in multiple calls');
    items.forEach(function (it, i) {
      var title = String(it && it.title || '').trim(), price = Number(it && (it.price != null ? it.price : it.buy_price_gbp));
      if (!title) throw new UserError('item ' + (i + 1) + ' is missing a title');
      if (!price || price <= 0) throw new UserError('item ' + (i + 1) + ' (' + title + ') is missing a valid price');
    });
    var pf = b.profile_slug ? profileBySlug(String(b.profile_slug)) : D.profiles[0];
    var sup = supplierByName(name) || { id: D.liveUuid(), name: name, site: 'https://' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.example', vat: true };
    var run = startRun(pf, Math.min(items.length, 6), { _supplier: sup, metadata: { source: 'catalog_scan', supplier: name, items: items.length } });
    return { ok: true, accepted: true, run: { run_id: run.id, accepted_items: items.length } };
  };
  A.scan_supplier_url = function (b) {
    var url = String(b.url || '').trim(); if (!url) throw new UserError('url is required');
    var name = scanName(b); if (!name) throw new UserError('supplier_name is required');
    var pf = b.profile_slug ? profileBySlug(String(b.profile_slug)) : D.profiles[0];
    var sup = supplierByName(name) || { id: D.liveUuid(), name: name, site: url.replace(/^(https?:\/\/[^\/]+).*$/, '$1'), vat: true };
    var run = startRun(pf, 4, { _supplier: sup, metadata: { source: 'url_scan', supplier: name, url: url } });
    return { ok: true, accepted: true, run: { run_id: run.id, accepted_items: 4 } };
  };

  function queueItemsOut() {
    return D.queueItems.slice().sort(function (a, c) { return a.position - c.position; }).map(function (it) {
      var p = profileById(it.sourcing_profile_id) || {};
      var o = {}; for (var k in it) o[k] = it[k];
      o.sourcing_profiles = { name: p.name, slug: p.slug, min_buy_price_gbp: p.min_buy_price_gbp, max_buy_price_gbp: p.max_buy_price_gbp, target_daily_leads_max: p.target_daily_leads_max };
      return o;
    });
  }
  A.sourcing_queue_list = function () { return { ok: true, queue: D.queue, items: queueItemsOut() }; };
  A.sourcing_queue_upsert = function (b) {
    var items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) throw new UserError('items is required');
    items.forEach(function (it) { if (!it || !it.sourcing_profile_id) throw new UserError('Each queue item requires a sourcing_profile_id'); });
    if (!D.queue || (b.queue_id && b.queue_id !== D.queue.id)) D.queue = { id: D.liveUuid(), workspace_id: D.workspace.id, name: 'Queue', status: 'idle', current_position: 0, created_at: nowIso(), updated_at: nowIso() };
    D.queue.status = 'idle'; D.queue.current_position = 0; D.queue.updated_at = nowIso();
    D.queueItems = items.map(function (it, k) {
      return { id: D.liveUuid(), queue_id: D.queue.id, sourcing_profile_id: String(it.sourcing_profile_id), position: num(it.position, k + 1), target_lead_count: Math.max(1, Math.min(num(it.target_lead_count, 10), 50)), status: 'queued', run_id: null, created_at: nowIso(), updated_at: nowIso() };
    });
    return { ok: true, queue_id: D.queue.id };
  };
  function runNextQueueItem() {
    var it = D.queueItems.filter(function (x) { return x.status === 'queued'; }).sort(function (a, c) { return a.position - c.position; })[0];
    if (!it) { D.queue.status = 'completed'; D.queue.updated_at = nowIso(); return null; }
    D.queue.status = 'running'; D.queue.current_position = it.position; D.queue.updated_at = nowIso();
    it.status = 'running'; it.updated_at = nowIso();
    var run = startRun(profileById(it.sourcing_profile_id), it.target_lead_count, { queue_id: D.queue.id, queue_position: it.position });
    it.run_id = run.id;
    return it;
  }
  function advanceQueue(run) {
    var it = D.queueItems.filter(function (x) { return x.run_id === run.id; })[0];
    if (!it || D.queue.status === 'stopped') return;
    it.status = 'completed'; it.updated_at = nowIso();
    runNextQueueItem();
  }
  A.sourcing_queue_start = function (b) {
    if (!b.queue_id) throw new UserError('queue_id is required');
    if (!D.queue || D.queue.id !== String(b.queue_id)) throw new UserError('Queue not found.');
    D.queueItems.forEach(function (x) { if (x.status === 'completed') { x.status = 'queued'; x.run_id = null; } });
    var it = runNextQueueItem();
    if (!it) return { ok: true, message: 'No queued items' };
    return { ok: true, started_item: it };
  };
  A.sourcing_queue_stop = function (b) {
    if (!b.queue_id) throw new UserError('queue_id is required');
    if (!D.queue || D.queue.id !== String(b.queue_id)) throw new UserError('Queue not found.');
    D.queue.status = 'stopped'; D.queue.updated_at = nowIso();
    D.queueItems.forEach(function (x) { if (x.status === 'running') x.status = 'queued'; });
    return { ok: true, queue: D.queue };
  };

  /* ================= smaller function routes ================= */
  var R = (G.routes = {});

  R.overview = function () {
    var L7 = D.lines().filter(function (l) { return l.sale_date >= addDays(D.today, -6); });
    var comp = L7.filter(function (l) { return l._complete; });
    var prof = profitRows(7);
    return {
      summary: {
        generated_at: nowIso(), inventory_items: D.invItems.length, latest_profit_date: prof.length ? prof[1] ? prof[1].metric_date : prof[0].metric_date : null,
        open_alerts: D.alerts.filter(function (a) { return a.status === 'open'; }).length + reorderAlerts().length, open_discrepancies: D.discrepancies.filter(function (a) { return a.status === 'open'; }).length,
        open_reorders: reorderAlerts().length, open_supplier_orders: D.supplierOrders.filter(function (o) { return o.status === 'review_required' || o.status === 'draft' || o.status === 'approved'; }).length,
        profit_7d: r2(sum(comp, function (l) { return l.profit_gbp; })), qualified_sourcing_leads: D.candidates.filter(function (c) { return c.qualification_status === 'qualified'; }).length,
        revenue_7d: r2(sum(L7, function (l) { return l.revenue_gross_gbp; })), units_7d: sum(L7, function (l) { return l.quantity; }),
        unmatched_invoices: D.invoices.filter(function (v) { return v.status === 'review_required' || (v.status === 'pending' && !v._purchase); }).length,
      },
    };
  };

  R.automation = function () {
    var jobs = D.jobs, sum_ = {};
    jobs.forEach(function (j) {
      var s = sum_[j.job_type] = sum_[j.job_type] || { job_type: j.job_type, queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, total: 0, latest_at: null, latest_error: null };
      if (s[j.status] !== undefined) s[j.status]++;
      s.total++;
      var at = j.updated_at || j.created_at; if (at && (!s.latest_at || at > s.latest_at)) { s.latest_at = at; s.latest_error = j.last_error || null; }
    });
    var watches = liveWatches(), act = watches.filter(function (w) { return w.active; });
    var last = act.map(function (w) { return w.last_checked_at; }).filter(Boolean).sort().pop() || null;
    var obs = D.watchObs.slice(0, 30);
    return {
      generated_at: nowIso(), timezone: 'Europe/London',
      worker_summary: Object.keys(sum_).sort().map(function (k) { return sum_[k]; }),
      price_watch_summary: { active: act.length, configured: watches.length, last_checked_at: last, observations_loaded: obs.length },
      source_errors: [],
      jobs: jobs.slice().sort(function (a, c) { return cmp(c.updated_at, a.updated_at); }).slice(0, 500),
      sourcing_runs: D.runs.slice(0, 40), spapi_sync_runs: D.syncRuns.slice(0, 40), amazon_reports: D.reportJobs.slice(0, 40), reconciliation_runs: D.reconRuns.slice(0, 20), integration_logs: D.logs.slice(0, 80),
      profit_daily: profitRows(14).slice(0, 14), daily_leads: D.dailyLeads.slice(0, 30), price_watches: watches.slice(0, 100), price_observations: obs,
    };
  };

  R.inventory_status = function () {
    var rows = D.syncRuns.filter(function (r) { return r.sync_type === 'inventory'; }).slice(0, 20);
    var latestSuccess = rows.filter(function (r) { return r.status === 'completed' && !r.error_count; })[0] || null;
    return { latest_attempt: rows[0] || null, latest_successful_sync: latestSuccess, sync_mode: latestSuccess ? ((latestSuccess.metadata && latestSuccess.metadata.sync_mode) || 'incremental') : null };
  };

  // sourcing profiles
  function findProfile(b) {
    var p = b.profile_id ? profileById(String(b.profile_id)) : (b.slug ? profileBySlug(String(b.slug)) : null);
    if (!p) throw new UserError('Sourcing profile not found.');
    return p;
  }
  var PNUM = ['standard_min_roi_pct', 'high_ticket_threshold_gbp', 'high_ticket_min_roi_pct', 'min_profit_gbp', 'min_sell_price_gbp', 'max_sell_price_gbp', 'min_buy_price_gbp', 'max_buy_price_gbp', 'max_sales_rank', 'min_monthly_sales', 'max_seller_count', 'max_competing_stock', 'competition_warn_stock_to_spm_ratio', 'competition_reject_stock_to_spm_ratio', 'target_daily_leads_min', 'target_daily_leads_max'];
  R.sourcing_profiles = function (b) {
    var a = String(b.action || '');
    if (a === 'list_profiles') {
      var rows = D.profiles.filter(function (p) { return b.include_inactive === true || p.active; });
      rows = rows.slice().sort(function (x, y) { return (y.is_default ? 1 : 0) - (x.is_default ? 1 : 0) || cmp(x.name, y.name); });
      return { ok: true, profiles: rows };
    }
    if (a === 'get_profile') return { ok: true, profile: findProfile(b) };
    if (a === 'set_default_profile') { var p = findProfile(b); D.profiles.forEach(function (x) { x.is_default = x === p; }); p.updated_at = nowIso(); return { ok: true, profile: p }; }
    if (a === 'archive_profile') {
      var q = findProfile(b);
      if (q.is_default) throw new UserError('The default profile cannot be archived. Choose another default first.');
      q.active = false; q.updated_at = nowIso(); return { ok: true, profile: q };
    }
    if (a === 'upsert_profile') {
      var d = b.profile || {};
      var name = String(d.name || '').trim(); if (!name) throw new UserError('name is required');
      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      var ex = d.id ? profileById(String(d.id)) : profileBySlug(slug);
      if (!ex) {
        ex = { id: D.liveUuid(), workspace_id: D.workspace.id, slug: slug, name: name, description: null, is_default: false, active: true, rules_version: 'v3', metadata: {}, created_at: nowIso() };
        PNUM.forEach(function (k) { ex[k] = null; });
        ex.require_shared_buy_box_if_amazon = true; ex.standard_min_roi_pct = 30; ex.high_ticket_threshold_gbp = 100; ex.high_ticket_min_roi_pct = 20; ex.min_profit_gbp = 2; ex.max_sales_rank = 100000; ex.min_monthly_sales = 50; ex.target_daily_leads_min = 5; ex.target_daily_leads_max = 10;
        D.profiles.push(ex);
      }
      ex.name = name; if (d.description !== undefined) ex.description = d.description || null;
      PNUM.forEach(function (k) { if (d[k] !== undefined) ex[k] = (d[k] === '' || d[k] === null) ? null : num(d[k], null); });
      if (d.require_shared_buy_box_if_amazon !== undefined) ex.require_shared_buy_box_if_amazon = d.require_shared_buy_box_if_amazon === true;
      if (d.is_default === true) D.profiles.forEach(function (x) { x.is_default = x === ex; });
      ex.updated_at = nowIso();
      return { ok: true, profile: ex };
    }
    return {};
  };

  // stock on hand
  function skuKey(s) { return String(s).toUpperCase().replace(/\s+/g, ''); }
  R.stock_on_hand = function (b) {
    var a = String(b.action || '');
    if (a === 'list') {
      var out = { items: D.stockOnHand.slice().sort(function (x, y) { return cmp(x.sku_key, y.sku_key); }).map(function (x) { return { sku: x.sku, sku_key: x.sku_key, quantity: x.quantity, title: x.title, asin: x.asin, image_url: null, updated_at: x.updated_at }; }) };
      if (b.include_picklists === true) {
        var by = {};
        D.stockLog.forEach(function (l) {
          if (l.reason !== 'used_for_picklist' || !l.picklist_key || l.picklist_key.indexOf('#') >= 0) return;
          var e = by[l.picklist_key] = by[l.picklist_key] || { key: l.picklist_key, applied_at: l.created_at, lines: [] };
          if (l.created_at < e.applied_at) e.applied_at = l.created_at;
          e.lines.push({ sku_key: l.sku_key, taken: -l.quantity_change, stock_before: l.quantity_before, stock_after: l.quantity_after });
        });
        out.picklists = Object.keys(by).map(function (k) { return by[k]; });
      }
      return out;
    }
    if (a === 'recent_log') return { log: D.stockLog.slice(0, 200) };
    var items = Array.isArray(b.items) ? b.items : [];
    function logRow(it, reason, before, after, extra) {
      var r = { id: D.liveUuid(), workspace_id: D.workspace.id, sku: it.sku, sku_key: it.sku_key, reason: reason, quantity_before: before, quantity_after: after, quantity_change: after - before, picklist_key: null, picklist_label: null, created_by: D.userId, created_at: nowIso() };
      for (var k in (extra || {})) r[k] = extra[k];
      D.stockLog.unshift(r);
    }
    function row(skuText, title) {
      var key = skuKey(skuText), it = D.stockOnHand.filter(function (x) { return x.sku_key === key; })[0] || null;
      return { key: key, it: it };
    }
    if (a === 'set_items') {
      if (!items.length) throw new UserError('items must be a non-empty array');
      if (items.length > 5000) throw new UserError('at most 5000 SKUs per save');
      var created = 0, updated = 0, unchanged = 0;
      items.forEach(function (x) {
        var sku = String(x && x.sku != null ? x.sku : '').trim();
        if (!sku) throw new UserError('every row needs a SKU');
        var qs = String(x.quantity == null ? '' : x.quantity).trim();
        if (!/^\d+$/.test(qs)) throw new UserError('quantity for ' + sku + ' must be a whole number, 0 or more');
        var q = parseInt(qs, 10), r = row(sku);
        if (!r.it) {
          var ref = D.skuByKey[sku] || D.skus.filter(function (s) { return skuKey(s.sku) === r.key; })[0] || null;
          var it = { id: D.liveUuid(), workspace_id: D.workspace.id, sku: ref ? ref.sku : sku, sku_key: r.key, quantity: q, title: ref ? ref.title : (x.title || null), asin: ref ? ref.asin : null, image_url: null, updated_at: nowIso(), created_at: nowIso() };
          D.stockOnHand.push(it); logRow(it, 'set', 0, q); created++;
        } else if (r.it.quantity === q) unchanged++;
        else { var before = r.it.quantity; r.it.quantity = q; r.it.updated_at = nowIso(); logRow(r.it, 'set', before, q); updated++; }
      });
      return { created: created, updated: updated, unchanged: unchanged };
    }
    if (a === 'remove_item') {
      var sku2 = String(b.sku || '').trim(); if (!sku2) throw new UserError('every row needs a SKU');
      var r2_ = row(sku2); if (!r2_.it) throw new UserError('That SKU is not in your stock list.');
      logRow(r2_.it, 'removed', r2_.it.quantity, 0);
      D.stockOnHand = D.stockOnHand.filter(function (x) { return x !== r2_.it; });
      return { removed: true, sku: r2_.it.sku };
    }
    if (a === 'use_for_picklist') {
      var pk = String(b.picklist_key || '').trim().slice(0, 200); if (!pk) throw new UserError('picklist_key is required');
      if (!items.length) throw new UserError('items must be a non-empty array');
      var prior = D.stockLog.filter(function (l) { return l.reason === 'used_for_picklist' && l.picklist_key === pk; });
      if (prior.length && b.force !== true) return { already_applied: true, applied_at: prior[prior.length - 1].created_at, units_taken: -prior.reduce(function (t, l) { return t + l.quantity_change; }, 0) };
      var key2 = prior.length ? pk + '#' + Date.now() : pk, taken = 0, lines = 0;
      items.forEach(function (x) {
        var q = Math.max(0, parseInt(String(x.quantity || '0'), 10) || 0), r = row(String(x.sku || ''));
        if (!r.it || q <= 0 || r.it.quantity <= 0) return;
        var take = Math.min(q, r.it.quantity), before = r.it.quantity;
        r.it.quantity = before - take; r.it.updated_at = nowIso(); taken += take; lines++;
        logRow(r.it, 'used_for_picklist', before, before - take, { picklist_key: key2, picklist_label: String(b.picklist_label || '').slice(0, 300) || null });
      });
      return { already_applied: false, units_taken: taken, skus_taken: lines, applied_at: nowIso() };
    }
    return {};
  };

  /* ================= rpc purchase_spend_summary ================= */
  G.spendSummary = function () {
    var items = D.purchaseItems;
    function mondayOf(d) { var dt = U.parseYmd(d), wd = (dt.getDay() + 6) % 7; return addDays(d, -wd); }
    function agg(rows) {
      var spent = sum(rows, function (x) { return x.cost_total_gbp; });
      var withProfit = rows.filter(function (x) { return x.profit_total_gbp != null; });
      var prof = sum(withProfit, function (x) { return x.profit_total_gbp; }), spentP = sum(withProfit, function (x) { return x.cost_total_gbp; });
      var pur = {}; rows.forEach(function (x) { pur[x.purchase_id] = 1; });
      return { units: sum(rows, function (x) { return x.quantity; }), purchases: Object.keys(pur).length, spent: r2(spent), est_profit: withProfit.length ? r2(prof) : null, roi_pct: spentP > 0 ? r2(prof / spentP * 100) : null };
    }
    var dayOf = function (x) { return String(x.ordered_at).slice(0, 10); };
    var byDay = {}, byWeek = {};
    items.forEach(function (x) { var d = dayOf(x); (byDay[d] = byDay[d] || []).push(x); var w = mondayOf(d); (byWeek[w] = byWeek[w] || []).push(x); });
    var daily = [];
    for (var i = 0; i < 14; i++) { var d = addDays(D.today, -i), a = agg(byDay[d] || []); a.day = d; daily.push(a); }
    var thisWeek = mondayOf(D.today), weekly = [];
    for (var w = 0; w < 12; w++) { var ws = addDays(thisWeek, -7 * w), a2 = agg(byWeek[ws] || []); a2.week_start = ws; weekly.push(a2); }
    var growth = [1, 2, 3].map(function (k) {
      var cur = weekly[k].spent, prev = weekly[k + 1] ? weekly[k + 1].spent : 0;
      return { pct: prev > 0 ? r2(cur / prev * 100) : null, spent: cur, prev_spent: prev };
    });
    var cut = addDays(D.today, -90);
    function top(keyFn) {
      var m = {};
      items.filter(function (x) { return dayOf(x) >= cut; }).forEach(function (x) { var k = keyFn(x); if (!k) return; (m[k] = m[k] || []).push(x); });
      return Object.keys(m).map(function (k) { var a = agg(m[k]); a.name = k; return a; }).sort(function (p, q) { return q.spent - p.spent; }).slice(0, 100);
    }
    var tot = agg(items); tot.missing_profit = items.filter(function (x) { return x.profit_total_gbp == null; }).length;
    return { timezone: 'Europe/London', today: D.today, week_start: thisWeek, daily: daily, weekly: weekly, growth: growth, top_brands_90d: top(function (x) { return x.brand; }), top_stores_90d: top(function (x) { return x.store_name; }), totals: tot };
  };
})();
