/* SELLINTEL demo: purchasing, invoices, stock, sourcing, leads and operations data. */
(function () {
  'use strict';
  var D = window.__DEMO, U = D.U, R = D.R, VAT = D.VAT;
  var ri = U.ri, pick = U.pick, chance = U.chance, r2 = U.r2, pad = U.pad, addDays = U.addDays, isoAt = U.isoAt, isoDaysAgo = U.isoDaysAgo;
  var skus = D.skus, SUPPLIERS = D.suppliers;
  var nowIso = function () { return new Date().toISOString(); };

  /* ---------- inventory items ---------- */
  skus.forEach(function (s) { s.invId = D.uuid(); });
  D.invItems = skus.map(function (s) {
    return {
      id: s.invId, workspace_id: D.workspace.id, merchant_sku: s.sku, fnsku: 'X00' + s.asin.slice(3), asin: s.asin, ean: s.ean, barcode: s.ean,
      title: s.title, brand: s.brand, default_supplier_id: s.supplier.id, default_supplier_sku: s.typeCode + '-' + pad(s.n * 37 % 10000, 4),
      default_unit_cost_gross_gbp: s.cost != null ? s.cost : null, reorder_point_qty: null, safety_stock_qty: ri(5, 20), target_days_cover: 30,
      supplier_lead_time_days: pick([3, 5, 7, 10]), active: true, metadata: {}, created_at: isoDaysAgo(ri(100, 400)), updated_at: isoDaysAgo(ri(0, 10)),
      weight_g: s.weightMissing ? null : s.weight_g, image_url: null,
    };
  });

  /* ---------- purchases, items, invoices ---------- */
  var bySupplier = {};
  skus.forEach(function (s) { (bySupplier[s.supplier.code] = bySupplier[s.supplier.code] || []).push(s); });
  var purchases = [], purchaseItems = [], invoices = [];
  var supplierVatNo = {};
  SUPPLIERS.forEach(function (s) { supplierVatNo[s.code] = s.vat ? 'GB' + (100000000 + s.index * 7391827 % 899999999) : null; });
  var nPurch = 36;
  for (var i = 0; i < nPurch; i++) {
    var sup = SUPPLIERS[(i * 3 + (i >> 2)) % SUPPLIERS.length];
    var pool = bySupplier[sup.code] || skus;
    var back = Math.round((nPurch - 1 - i) * (D.DAYS - 3) / (nPurch - 1)) + ri(0, 1);
    var ordered = addDays(D.today, -back);
    var n = Math.min(pool.length, ri(3, 7)), items = [], seen = {};
    for (var j = 0; j < n; j++) {
      var sk = pick(pool); if (seen[sk.sku]) continue;
      // a sensible buyer only orders things that still clear a margin
      var cst = sk.cost != null ? sk.cost : (sk.costBackup != null ? sk.costBackup : sk.price * 0.4), fg = sk.price * sk.ref * 1.02 + (sk.fulfillment === 'FBA' ? sk.fbaFee : 0);
      var cn_ = sup.vat ? cst / VAT : cst; if ((sk.price / VAT - fg - cn_ - 0.1) / (cn_ + 0.1) < 0.16) continue;
      seen[sk.sku] = 1; items.push(sk);
    }
    if (!items.length) items.push(pool[0]);
    var pid = D.uuid();
    var num = 'PO-' + (2400 + i * 3 + ri(0, 2));
    var pitems = items.map(function (sk) {
      var qty = ri(2, 8) * 6;
      var cost = sk.cost != null ? sk.cost : (sk.costBackup != null ? sk.costBackup : r2(sk.price * 0.4));
      var feeGross = r2(sk.price * sk.ref * 1.02 * VAT + (sk.fulfillment === 'FBA' ? sk.fbaFee * VAT : 0));
      var prof = r2(sk.price / VAT - feeGross / VAT - (sup.vat ? cost / VAT : cost) - 0.1);
      var roi = r2(prof / ((sup.vat ? cost / VAT : cost) + 0.1) * 100);
      return {
        workspace_id: D.workspace.id, purchase_item_id: D.uuid(), purchase_id: pid, purchase_number: num, ordered_at: isoAt(ordered, ri(8, 17), ri(0, 59)),
        source: pick(['website', 'website', 'trade_account', 'csv_import']), purchase_status: back < 3 ? 'ordered' : 'received', store_name: sup.name, product_name: sk.title, asin: sk.asin,
        merchant_sku: sk.sku, supplier_sku: sk.typeCode + '-' + pad(sk.n * 37 % 10000, 4), brand: sk.brand, category: sk.category,
        cost_price_gbp: cost, sale_price_gbp: sk.price, profit_per_unit_gbp: prof, potential_roi_pct: roi, quantity: qty, cost_total_gbp: r2(cost * qty), profit_total_gbp: r2(prof * qty),
        source_url: sup.site + '/p/' + sk.typeCode.toLowerCase() + '-' + sk.n, amazon_url: 'https://www.amazon.co.uk/dp/' + sk.asin, amazon_fee_gross_gbp: feeGross, fee_is_estimated: chance(0.4),
      };
    });
    var sub = r2(pitems.reduce(function (a, b) { return a + b.cost_total_gbp; }, 0));
    var ship = chance(0.35) ? pick([4.99, 5.99, 7.5]) : 0;
    var total = r2(sub + ship);
    var vatG = r2(sup.vat ? total - total / VAT : 0);
    purchases.push({
      id: pid, workspace_id: D.workspace.id, purchase_number: num, supplier_id: sup.id, source: pitems[0].source, status: back < 3 ? 'ordered' : 'received', ordered_at: pitems[0].ordered_at,
      expected_at: isoAt(addDays(ordered, ri(2, 7)), 12, 0), received_at: back < 3 ? null : isoAt(addDays(ordered, ri(2, 6)), 11, 0), currency: 'GBP', subtotal_gross_gbp: sub, shipping_gross_gbp: ship,
      vat_gross_gbp: vatG, total_gross_gbp: total, external_ref: 'WEB' + ri(100000, 999999), idempotency_key: 'demo-' + pid, notes: null, metadata: {}, created_at: pitems[0].ordered_at, updated_at: pitems[0].ordered_at,
      _supplier: sup,
    });
    pitems.forEach(function (x) { purchaseItems.push(x); });
    if (chance(0.9)) {
      var invDate = addDays(ordered, ri(0, 2));
      var invTotal = total, invVat = vatG, invSub = r2(invTotal - invVat);
      var st = back < 4 ? 'pending' : chance(0.07) ? 'review_required' : 'matched';
      invoices.push({
        id: D.uuid(), workspace_id: D.workspace.id, supplier_id: sup.id, email_ingest_event_id: null, invoice_number: 'INV-' + (sup.code) + '-' + ri(10000, 99999), invoice_date: invDate,
        due_date: addDays(invDate, sup.terms), currency: 'GBP', subtotal_gross_gbp: invSub, vat_gross_gbp: invVat, total_gross_gbp: invTotal, supplier_vat_number: supplierVatNo[sup.code],
        extraction_method: pick(['pdf', 'pdf', 'vision', 'email_body']), extraction_confidence: r2(0.8 + R() * 0.19), status: st, raw_extraction: {}, idempotency_key: 'demo-inv-' + pid,
        created_at: isoAt(invDate, 9, ri(0, 59)), updated_at: isoAt(invDate, 9, ri(0, 59)), payment_method: chance(0.7) ? pick(['Bank', 'Bank', 'American Express', 'Capital on Tap', 'PayPal']) : null,
        supplier_name: sup.name, invoice_url: '/demo/sample-invoice.html',
        items: pitems.map(function (x, k) {
          return { id: D.uuid(), line_number: k + 1, supplier_sku: x.supplier_sku, ean: skus.filter(function (z) { return z.sku === x.merchant_sku; })[0].ean, description: x.product_name, quantity: x.quantity, unit_price_gross_gbp: x.cost_price_gbp, line_total_gross_gbp: x.cost_total_gbp, vat_rate: sup.vat ? 0.2 : 0 };
        }),
        _purchase: pid, _paid: null, _paidManual: false, _paidDate: null, _terms: sup.terms,
      });
    }
  }
  // a few unmatched invoices (no purchase) and review ones
  for (var u = 0; u < 3; u++) {
    var supx = SUPPLIERS[ri(0, SUPPLIERS.length - 1)], d0 = addDays(D.today, -ri(2, 40)), tot = r2(ri(8000, 60000) / 100), vt = r2(supx.vat ? tot - tot / VAT : 0);
    invoices.push({
      id: D.uuid(), workspace_id: D.workspace.id, supplier_id: supx.id, email_ingest_event_id: null, invoice_number: 'INV-' + supx.code + '-' + ri(10000, 99999), invoice_date: d0, due_date: addDays(d0, supx.terms),
      currency: 'GBP', subtotal_gross_gbp: r2(tot - vt), vat_gross_gbp: vt, total_gross_gbp: tot, supplier_vat_number: u === 1 ? null : supplierVatNo[supx.code], extraction_method: 'vision', extraction_confidence: r2(0.62 + R() * 0.2),
      status: 'review_required', raw_extraction: {}, idempotency_key: 'demo-inv-x' + u, created_at: isoAt(d0, 10, 5), updated_at: isoAt(d0, 10, 5), payment_method: null, supplier_name: supx.name, invoice_url: '/demo/sample-invoice.html',
      items: [{ id: D.uuid(), line_number: 1, supplier_sku: 'MISC-' + u, ean: null, description: 'Assorted trade goods', quantity: ri(2, 10), unit_price_gross_gbp: r2(tot / 5), line_total_gross_gbp: tot, vat_rate: supx.vat ? 0.2 : 0 }],
      _purchase: null, _paid: null, _paidManual: false, _paidDate: null, _terms: supx.terms,
    });
  }
  invoices.sort(function (a, b) { return a.invoice_date < b.invoice_date ? 1 : -1; });
  // paid status: older invoices are mostly paid already
  invoices.forEach(function (v) {
    var due = v.due_date;
    if (due < addDays(D.today, -6) && !chance(0.07)) { v._paid = true; v._paidDate = addDays(due, -ri(0, 3)); }
    else if (v._terms === 0 && v.invoice_date < addDays(D.today, -2)) { v._paid = true; v._paidDate = v.invoice_date; }
    else v._paid = false;
  });
  D.purchases = purchases; D.purchaseItems = purchaseItems; D.invoices = invoices;
  D.supplierTerms = {}; SUPPLIERS.forEach(function (s) { D.supplierTerms[s.id] = s.terms; });

  /* ---------- supplier orders ---------- */
  D.supplierOrders = [];
  var SO_ST = ['awaiting_approval', 'awaiting_approval', 'approved', 'submitted', 'draft', 'submitted', 'approved', 'cancelled'];
  for (var so = 0; so < 8; so++) {
    var sp = SUPPLIERS[(so * 5) % SUPPLIERS.length], st2 = SO_ST[so];
    D.supplierOrders.push({
      id: D.uuid(), workspace_id: D.workspace.id, supplier_id: sp.id, source_picklist_id: null, status: st2, approval_required: st2 === 'awaiting_approval' || st2 === 'draft',
      approved_by: st2 === 'approved' || st2 === 'submitted' ? D.userId : null, approved_at: st2 === 'approved' || st2 === 'submitted' ? isoDaysAgo(ri(1, 9)) : null,
      submitted_at: st2 === 'submitted' ? isoDaysAgo(ri(0, 8)) : null, supplier_order_reference: st2 === 'submitted' ? 'REF-' + ri(100000, 999999) : null, current_total_gross_gbp: r2(ri(15000, 140000) / 100),
      idempotency_key: 'demo-so-' + so, error_message: null, metadata: { supplier_name: sp.name }, created_at: isoDaysAgo(so * 3 + ri(0, 2)), updated_at: isoDaysAgo(so * 3),
    });
  }
  D.supplierOrders.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });

  /* ---------- stock on hand ---------- */
  D.stockOnHand = skus.slice().sort(function () { return R() - 0.5; }).slice(0, 44).map(function (s) {
    return { id: D.uuid(), workspace_id: D.workspace.id, sku: s.sku, sku_key: s.sku.toUpperCase().replace(/\s+/g, ''), quantity: ri(0, 6) === 0 ? 0 : ri(4, 140), title: s.title, asin: s.asin, image_url: null, updated_at: isoDaysAgo(ri(0, 30)), created_at: isoDaysAgo(ri(40, 90)) };
  }).sort(function (a, b) { return a.sku_key < b.sku_key ? -1 : 1; });
  D.stockLog = [];
  for (var g = 0; g < 18; g++) {
    var it = pick(D.stockOnHand), reason = pick(['set', 'set', 'used_for_picklist', 'removed']), before = ri(5, 90), chg = reason === 'removed' ? -before : reason === 'used_for_picklist' ? -ri(1, Math.min(before, 12)) : ri(-10, 30);
    D.stockLog.push({ id: D.uuid(), workspace_id: D.workspace.id, sku: it.sku, sku_key: it.sku_key, reason: reason, quantity_before: before, quantity_after: Math.max(0, before + chg), quantity_change: Math.max(-before, chg), picklist_key: reason === 'used_for_picklist' ? 'pl-' + ri(1000, 9999) : null, picklist_label: reason === 'used_for_picklist' ? 'Weekly pick list ' + ri(1, 40) : null, created_by: D.userId, created_at: isoDaysAgo(g * 2 + ri(0, 1), ri(8, 17)) });
  }
  D.stockLog.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });

  /* ---------- sourcing: profiles, runs, queue ---------- */
  function profile(slug, name, desc, isDef, o) {
    var p = {
      id: D.uuid(), workspace_id: D.workspace.id, slug: slug, name: name, description: desc, is_default: isDef, active: true, standard_min_roi_pct: 30, high_ticket_threshold_gbp: 60, high_ticket_min_roi_pct: 20,
      min_profit_gbp: 2, min_sell_price_gbp: 8, max_sell_price_gbp: 60, min_buy_price_gbp: 2, max_buy_price_gbp: 30, max_sales_rank: 80000, min_monthly_sales: 60, max_seller_count: 12, max_competing_stock: null,
      require_shared_buy_box_if_amazon: true, competition_warn_stock_to_spm_ratio: 6, competition_reject_stock_to_spm_ratio: 12, target_daily_leads_min: 8, target_daily_leads_max: 15, rules_version: 'v3',
      metadata: {}, created_at: isoDaysAgo(120), updated_at: isoDaysAgo(ri(2, 30)),
    };
    for (var k in o) p[k] = o[k];
    return p;
  }
  D.profiles = [
    profile('wholesale-low-ticket', 'Wholesale low-ticket', 'Everyday consumables bought in cases, quick turnover.', true, {}),
    profile('high-ticket', 'High-ticket', 'Higher-value items where a smaller ROI still returns solid profit.', false, { min_sell_price_gbp: 40, max_sell_price_gbp: 250, min_buy_price_gbp: 25, max_buy_price_gbp: 180, standard_min_roi_pct: 22, min_profit_gbp: 8, max_sales_rank: 40000, min_monthly_sales: 30, target_daily_leads_min: 3, target_daily_leads_max: 8 }),
    profile('brand-sweep', 'Brand sweep (beauty)', 'Targeted sweeps of beauty brands from approved trade suppliers.', false, { min_sell_price_gbp: 6, max_sell_price_gbp: 45, max_buy_price_gbp: 22, min_monthly_sales: 80, target_daily_leads_max: 12 }),
  ];
  D.runs = [];
  for (var r = 0; r < 16; r++) {
    var pf = D.profiles[r % 3 === 2 ? 2 : (r % 4 === 1 ? 1 : 0)], disc = ri(180, 420), match = Math.round(disc * (0.3 + R() * 0.2)), qual = ri(3, 11), rev = ri(4, 12), rej = Math.max(0, match - qual - rev);
    var started = isoAt(addDays(D.today, -Math.floor(r * 1.4)), ri(5, 9), ri(0, 59));
    D.runs.push({
      id: D.uuid(), run_type: 'reverse_sourcing', status: r === 0 && chance(0.0) ? 'running' : 'completed', rules_version: 'v3', target_lead_count: pick([10, 10, 15, 20]), started_at: started,
      completed_at: new Date(new Date(started).getTime() + ri(12, 55) * 60000).toISOString(), candidates_discovered: disc, supplier_matches_found: match, qualified_count: qual, rejected_count: rej, review_count: rev, error_count: chance(0.15) ? ri(1, 3) : 0,
      metadata: { source: 'scheduled' }, created_at: started, updated_at: started, workspace_id: D.workspace.id, sourcing_profile_id: pf.id, queue_id: null, queue_position: null, sourcing_profiles: { name: pf.name },
    });
  }
  D.queue = { id: D.uuid(), workspace_id: D.workspace.id, name: 'Morning sweep', status: 'idle', current_position: 0, created_at: isoDaysAgo(6), updated_at: isoDaysAgo(1) };
  D.queueItems = D.profiles.map(function (p, k) {
    return { id: D.uuid(), queue_id: D.queue.id, sourcing_profile_id: p.id, position: k + 1, target_lead_count: [15, 8, 10][k], status: 'queued', run_id: null, created_at: isoDaysAgo(6), updated_at: isoDaysAgo(1) };
  });

  /* ---------- leads / candidates ---------- */
  var CAT_NAMES = ['Skin Care', 'Hair Care', 'Home & Kitchen', 'Pet Supplies', 'Grocery', 'Health & Beauty', 'Garden', 'Toys & Games', 'Stationery', 'Electronics'];
  var candidates = [];
  var cn = 0;
  var MATCH = [['ean', 'high', 96], ['ean', 'high', 99], ['brand_model', 'medium', 78], ['title_similarity', 'low', 55], ['manual', 'manual', 100]];
  while (candidates.length < 70) {
    var t = D.TYPES[ri(0, D.TYPES.length - 1)], brand = D.BRANDS[ri(0, D.BRANDS.length - 1)], size = pick(t[4]);
    var sell = r2(ri(Math.round(t[5][0] * 100 * 0.9), Math.round(t[5][1] * 100 * 1.3)) / 100); sell = Math.floor(sell) + (chance(0.5) ? 0.99 : 0.49); if (sell < 3.49) sell = 3.49;
    var costR = 0.34 + R() * 0.38;
    var buy = r2(sell * costR);
    var supx = SUP_BY_CODE_(pick(t[10]));
    var feeG = r2(sell * t[8] * 1.02 + t[7] * 1.0);
    var vr = supx.vat;
    var buyNet = vr ? r2(buy / VAT) : buy;
    var prep = 0.35, other = 0;
    var profit = r2(sell / VAT - feeG / VAT - buyNet - prep - other);
    var roi = r2(profit / (buyNet + prep) * 100);
    var margin = r2(profit / (sell / VAT) * 100);
    var monthly = ri(30, 1200), rank = ri(900, 130000), sellers = ri(1, 15);
    var m = pick(MATCH), conf = m[2], dataGap = chance(0.12);
    var status = roi >= 30 && profit >= 2 && monthly >= 60 && rank <= 80000 ? 'qualified' : (roi >= 18 && profit >= 1.2 ? (chance(0.6) ? 'review' : 'rejected') : 'rejected');
    if (dataGap) { status = 'review'; }
    var reasons = status === 'qualified' ? ['roi_meets_threshold', 'profit_meets_threshold', 'sales_rank_ok'] : status === 'review' ? [dataGap ? 'missing_sales_data' : 'low_match_confidence', 'needs_manual_check'] : [roi < 18 ? 'roi_below_threshold' : 'profit_below_threshold', sellers > 12 ? 'too_many_sellers' : 'sales_rank_high'];
    var pf2 = pick(D.profiles), run = pick(D.runs), asin = 'B0DEMO' + (cn + 70000).toString(36).toUpperCase().slice(-4); cn++;
    candidates.push({
      workspace_id: D.workspace.id, id: D.uuid(), created_at: isoAt(addDays(D.today, -ri(0, 28)), ri(5, 18), ri(0, 59)), asin: asin, amazon_title: brand + ' ' + t[2] + ' ' + size, brand: brand,
      sell_price_gross_gbp: sell, buy_cost_gross_gbp: buy, profit_gbp: profit, roi_pct: roi, margin_pct: margin, sales_rank: dataGap ? null : rank, monthly_sales_est: dataGap ? null : monthly, seller_count: sellers,
      competing_stock: null, stock_to_spm_ratio: null, amazon_on_listing: null, amazon_buy_box_shared: null, qualification_status: status, qualification_reasons: reasons, needs_review: status === 'review',
      supplier_product_url: supx.site + '/p/' + t[3].toLowerCase() + '-' + ri(100, 999), supplier_title: brand + ' ' + t[2] + ' ' + size + ' (case of ' + pick([6, 12, 24]) + ')', supplier_name: supx.name,
      match_method: m[0], match_confidence: conf / 100, exact_match: m[0] === 'ean', sourcing_profile_id: pf2.id, sourcing_profile_slug: pf2.slug, sourcing_profile_name: pf2.name, amazon_fees_gross_gbp: feeG,
      max_cost_gbp: r2(sell * 0.62), referral_fee_pct: t[8] * 100, run_id: run.id, supplier_match_id: D.uuid(), idempotency_key: 'demo-cand-' + cn, prep_shipping_gbp: prep, other_costs_gbp: other,
      supplier_vat_recoverable: vr, amazon_fee_vat_recoverable: true, buy_cost_net_gbp: buyNet,
      // leads-search extras
      category: t[0], confidence_label: m[1], confidence_pct: conf, data_gap: dataGap, sales_source: dataGap ? null : pick(['keepa', 'keepa', 'keepa', 'estimate']), wishlisted: chance(0.08), ord: 0,
      _profit_ok: profit > 0,
    });
  }
  candidates.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  D.candidates = candidates;

  /* ---------- price watches ---------- */
  D.watches = [];
  var WT = [['Hydrating Face Serum 50ml (case of 12)', 'PBW'], ['Laundry Detergent Pods 50 pack', 'KHS'], ['Non-Stick Frying Pan 28cm', 'SBD'], ['Natural Dog Treats 500g (case)', 'HVD'], ['USB-C Fast Charging Cable 2m (x20)', 'SBD'], ['Scented Soy Candle 300g (x6)', 'OTD'], ['Sensitive Baby Wipes 6 x 64', 'NGW'], ['Herbal Tea Selection Box 80 bags', 'MCC']];
  WT.forEach(function (w, k) {
    var sup = SUP_BY_CODE_(w[1]), target = r2(ri(500, 3200) / 100), last = r2(target * (0.85 + R() * 0.4)), active = k !== 6, err = false;
    var state = last <= target ? 'below_target' : 'above_target';
    D.watches.push({
      id: D.uuid(), workspace_id: D.workspace.id, supplier_id: sup.id, name: w[0], product_title: w[0], product_url: sup.site + '/p/watch-' + (k + 1), supplier_name: sup.name, asin: skus[k * 9].asin, supplier_sku: 'W-' + (100 + k), ean: null, upc: null, mpn: null,
      target_price_gbp: target, active: active, check_interval_minutes: pick([30, 60, 240]), email_alert_enabled: k % 2 === 0, email_to: k % 2 === 0 ? 'alerts@demo-trading.example' : null, threshold_state: state, trigger_sequence: k, last_checked_at: isoDaysAgo(0, ri(1, 8)),
      next_check_at: new Date(Date.now() + ri(10, 200) * 60000).toISOString(), last_price_gbp: last, last_in_stock: true, last_source: 'html', last_error: err ? 'Supplier page layout changed (price element not found)' : null, consecutive_failures: err ? 2 : 0,
      last_triggered_at: state === 'below_target' ? isoDaysAgo(ri(0, 6)) : null, last_alert_price_gbp: null, last_alert_id: null, metadata: {}, deleted_at: null, created_at: isoDaysAgo(ri(20, 80)), updated_at: isoDaysAgo(ri(0, 3)),
    });
  });
  function SUP_BY_CODE_(c) { return SUPPLIERS.filter(function (s) { return s.code === c; })[0]; }
  D.watchObs = [];
  D.watches.forEach(function (w) {
    for (var q = 0; q < 8; q++) D.watchObs.push({ id: D.uuid(), workspace_id: D.workspace.id, watch_id: w.id, observed_at: isoDaysAgo(q * 2, 9), price_gbp: r2(w.target_price_gbp * (0.9 + R() * 0.35)), in_stock: true, source: 'html', source_url: w.product_url, confidence: 0.95, raw_payload: {}, created_at: isoDaysAgo(q * 2, 9) });
  });
  D.watchObs.sort(function (a, b) { return a.observed_at < b.observed_at ? 1 : -1; });

  /* ---------- alerts, discrepancies, discord, integrations, jobs ---------- */
  var ALERT_T = [['reorder_due', 'warning', 'Reorder due', 'Stock is below the reorder point for a fast-moving SKU.'], ['invoice_review', 'warning', 'Invoice needs review', 'An uploaded supplier invoice could not be matched to a purchase.'], ['price_watch', 'info', 'Price watch target hit', 'A watched supplier price dropped below your target.'], ['stranded', 'critical', 'Stranded inventory', 'FBA stock without an active listing.'], ['cost_missing', 'warning', 'Cost price missing', 'Recent sales have no cost price, profit cannot be worked out.'], ['shipment_short', 'critical', 'Shipment received short', 'Amazon received fewer units than were shipped.'], ['sync_delay', 'info', 'Sync delayed', 'The overnight finances sync finished later than usual.']];
  D.alerts = [];
  for (var a = 0; a < 14; a++) {
    var at = ALERT_T[a % ALERT_T.length];
    D.alerts.push({ id: D.uuid(), workspace_id: D.workspace.id, alert_type: at[0], severity: at[1], title: at[2], body: at[3], entity_type: null, entity_id: null, status: a < 9 ? 'open' : (a < 12 ? 'acknowledged' : 'resolved'), dedupe_key: 'demo-' + a, payload: {}, created_at: isoDaysAgo(a, ri(7, 18)), updated_at: isoDaysAgo(a), acknowledged_at: a >= 9 ? isoDaysAgo(a - 1) : null, resolved_at: a >= 12 ? isoDaysAgo(a - 1) : null });
  }
  D.discrepancies = [];
  var DT = [['inventory_mismatch', 'warning', 'Stock ledger differs from Amazon'], ['shipment_short_received', 'critical', 'Inbound shipment received short'], ['fee_variance', 'info', 'Fee estimate differs from actual'], ['missing_cost', 'warning', 'Sold SKU has no cost price'], ['refund_without_return', 'warning', 'Refund with no matching return'], ['duplicate_invoice', 'info', 'Possible duplicate supplier invoice']];
  DT.forEach(function (d, k) {
    var sk = skus[k * 11 + 3];
    D.discrepancies.push({ id: D.uuid(), workspace_id: D.workspace.id, reconciliation_run_id: null, discrepancy_type: d[0], severity: d[1], status: 'open', entity_type: 'sku', entity_id: sk.sku, seller_sku: sk.sku, asin: sk.asin, expected_value: ri(10, 60), actual_value: ri(0, 9), difference_value: -ri(1, 25), currency: null, title: d[2], details: {}, evidence: {}, dedupe_key: 'demo-d-' + k, created_at: isoDaysAgo(ri(1, 20)), updated_at: isoDaysAgo(ri(0, 5)), resolved_at: null });
  });
  var DISC = ['Laundry pods 50ct - case price drop at trade site', 'Multi-surface cleaner 750ml x12 - clearance', 'Slow-release plant feed 2kg bundle', 'Glass storage sets - 3 piece, pallet deal', 'Dog treats 500g 20% off trade price', 'Vitamin C effervescent 60s - bulk offer', 'Wooden puzzle 250pc - last chance stock', 'Rechargeable batteries 8 pack case'];
  D.discord = DISC.map(function (t, k) {
    return { id: D.uuid(), workspace_id: D.workspace.id, posted_at: isoDaysAgo(k * 2 + ri(0, 1), ri(8, 20)), message_content: 'Deal alert: ' + t, extracted_product_title: t.split(' - ')[0], extracted_asin: skus[(k * 17 + 5) % 150].asin, extracted_price_gbp: r2(ri(300, 3500) / 100), ai_confidence: r2(0.6 + R() * 0.38), status: pick(['enriched', 'enriched', 'queued_for_review', 'ignored']) };
  });
  D.integrations = [
    ['amazon_sp_api', 'Amazon Selling Partner (UK)', 'connected'], ['keepa', 'Keepa product data', 'connected'], ['gmail', 'Invoice inbox (email)', 'connected'], ['discord', 'Deal alerts channel', 'connected'], ['serpapi', 'Search API (sourcing)', 'connected'], ['automation_engine', 'Workflow automation engine', 'connected'], ['sheets_export', 'Spreadsheet export', 'needs_attention'],
  ].map(function (x, k) { return { provider: x[0], connection_name: x[1], status: x[2], last_checked_at: isoDaysAgo(0, ri(1, 9)), last_error: x[2] === 'connected' ? null : 'Authorisation expires soon, reconnect to keep exports running.', non_secret_config: x[0] === 'amazon_sp_api' ? { marketplace: 'amazon.co.uk', region: 'eu' } : {} }; });
  D.sourcingSettings = { id: D.uuid(), currency: 'GBP', marketplace: 'amazon_uk', marketplace_domain_id: 2, vat_registered: true, vat_rate: 0.2, standard_min_roi_pct: 30, high_ticket_threshold_gbp: 60, high_ticket_min_roi_pct: 20, min_profit_gbp: 2, max_sales_rank: 80000, min_monthly_sales: 60, default_prep_shipping_gbp: 0.35, require_shared_buy_box_if_amazon: true, competition_warn_stock_to_spm_ratio: 6, competition_reject_stock_to_spm_ratio: 12, target_daily_leads_min: 8, target_daily_leads_max: 15, rules_version: 'v3', notes: 'Demo settings', created_at: isoDaysAgo(200), updated_at: isoDaysAgo(9), workspace_id: D.workspace.id, fbm_postage_0_2kg_net_gbp: 1.95, fbm_postage_2_15kg_net_gbp: 2.5, fbm_postage_low_max_weight_g: 2000, fbm_postage_high_max_weight_g: 15000 };

  // operations (automation activity)
  var JT = ['orders_sync', 'inventory_sync', 'finances_sync', 'keepa_refresh', 'invoice_ingest', 'price_watch_check', 'reorder_materialise', 'sourcing_run'];
  D.jobs = [];
  for (var jn = 0; jn < 90; jn++) {
    var jt = JT[jn % JT.length], failed = false, running = jn < 2;
    D.jobs.push({ id: D.uuid(), job_type: jt, status: failed ? 'failed' : running ? 'running' : jn < 5 ? 'queued' : 'succeeded', attempts: failed ? 3 : 1, max_attempts: 3, available_at: isoDaysAgo(jn / 8), last_error: failed ? 'Timeout talking to upstream API (retry scheduled)' : null, result: {}, created_at: isoDaysAgo(jn / 8, 3), updated_at: isoDaysAgo(jn / 10, 6), completed_at: failed || running ? null : isoDaysAgo(jn / 10, 6) });
  }
  D.syncRuns = [];
  ['orders', 'inventory', 'finances'].forEach(function (ty, k) {
    for (var q = 0; q < 8; q++) D.syncRuns.push({ id: D.uuid(), sync_type: ty, api_name: ty === 'inventory' ? 'FBA Inventory' : ty === 'orders' ? 'Orders' : 'Finances', api_version: 'v0', status: 'completed', records_received: ri(40, 400), records_upserted: ri(30, 380), error_count: 0, started_at: isoDaysAgo(q * 0.4 + k * 0.05, 4 + k), completed_at: isoDaysAgo(q * 0.4 + k * 0.05, 4 + k), last_error: null, metadata: { sync_mode: q % 4 === 3 ? 'full' : 'incremental' }, data_start_time: q % 4 === 3 ? null : isoDaysAgo(q * 0.4 + 1), data_end_time: isoDaysAgo(q * 0.4), created_at: isoDaysAgo(q * 0.4, 4), updated_at: isoDaysAgo(q * 0.4, 4) });
  });
  D.syncRuns.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  D.reportJobs = ['GET_MERCHANT_LISTINGS_ALL_DATA', 'GET_STRANDED_INVENTORY_UI_DATA', 'GET_FBA_REIMBURSEMENTS_DATA', 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA', 'GET_FBA_STORAGE_FEE_CHARGES_DATA'].flatMap(function (rt, k) { return [0, 1, 2].map(function (q) { return { id: D.uuid(), report_type: rt, amazon_report_id: String(ri(300000000, 399999999)), report_document_id: 'amzn1.spdoc.1.4.eu.' + D.uuid().slice(0, 8), processing_status: 'DONE', data_start_time: isoDaysAgo(q + 1), data_end_time: isoDaysAgo(q), document_downloaded_at: isoDaysAgo(q, 5), parsed_at: isoDaysAgo(q, 5), raw_metadata: {}, created_at: isoDaysAgo(q, 4 + k), updated_at: isoDaysAgo(q, 5) }; }); }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  D.reconRuns = [0, 1, 2, 3, 4].map(function (q) { return { id: D.uuid(), reconciliation_type: pick(['shipments', 'inventory', 'fees']), status: 'completed', checked_count: ri(80, 300), discrepancy_count: ri(0, 6), metadata: {}, created_at: isoDaysAgo(q * 2, 3), completed_at: isoDaysAgo(q * 2, 3) }; });
  D.logs = []; ['amazon_sp_api', 'keepa', 'gmail', 'serpapi', 'automation_engine'].forEach(function (ig, k) { for (var q = 0; q < 14; q++) D.logs.push({ id: k * 100 + q, integration: ig, operation: pick(['sync', 'fetch', 'ingest', 'search']), status: q % 13 === 5 ? 'warning' : 'ok', message: q % 13 === 5 ? 'Rate limit reached, backing off (retry ok)' : 'Completed ' + pick(['page 1 of 3', 'batch of 50', 'refresh', 'delta sync']), created_at: isoDaysAgo(q * 0.3 + k * 0.05, 5) }); });
  D.logs.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  D.dailyLeads = candidates.filter(function (c) { return c.qualification_status === 'qualified'; }).slice(0, 12).map(function (c, k) { return { id: D.uuid(), lead_date: c.created_at.slice(0, 10), candidate_id: c.id, position: k + 1, selection_reason: 'top_roi', delivered_to_dashboard: true, delivered_to_sheet: k % 3 !== 0, delivered_at: c.created_at, created_at: c.created_at }; });

  /* ---------- storefront stalker ---------- */
  D.storefronts = [
    ['A2DEMOSELLER1', 'Greenfield Home Goods', 'daily'], ['A2DEMOSELLER2', 'Corner Pharmacy Direct', 'weekly'], ['A2DEMOSELLER3', 'Trade Pantry UK', 'manual'],
  ].map(function (x, k) {
    var f = { id: D.uuid(), workspace_id: D.workspace.id, seller_id: x[0], domain_id: 2, store_url: 'https://www.amazon.co.uk/sp?seller=' + x[0], label: x[1], seller_name: x[1], check_frequency: x[2], active: true, last_checked_at: isoDaysAgo(k, 6), last_check_status: 'ok', last_error: null, asin_count: 0, new_asins_last_check: 0, removed_asins_last_check: 0, check_requested_at: null, created_at: isoDaysAgo(30 + k * 10), updated_at: isoDaysAgo(k) };
    var asins = [];
    for (var q = 0; q < 28 + k * 9; q++) {
      var t = D.TYPES[ri(0, D.TYPES.length - 1)], br = pick(D.BRANDS);
      var removed = chance(0.06), isNew = q < 4 + k, base = chance(0.5);
      asins.push({ asin: 'B0DEMO' + ((k * 100 + q) + 90000).toString(36).toUpperCase().slice(-4), title: br + ' ' + t[2] + ' ' + pick(t[4]), buy_box_gbp: r2(ri(Math.round(t[5][0] * 100), Math.round(t[5][1] * 100)) / 100), sales_rank: ri(1500, 150000), monthly_sales_est: ri(30, 900), category: t[0], first_seen_at: isNew ? isoDaysAgo(ri(0, 4)) : isoDaysAgo(ri(10, 29)), last_seen_at: isoDaysAgo(removed ? ri(3, 9) : 0), keepa_last_seen_at: isoDaysAgo(ri(0, 3)), removed_at: removed ? isoDaysAgo(ri(1, 8)) : null, is_baseline: !isNew, details_pending: chance(0.04), image_url: null });
    }
    f.asin_count = asins.filter(function (a) { return !a.removed_at; }).length; f.new_asins_last_check = asins.filter(function (a) { return !a.is_baseline && !a.removed_at; }).length; f.removed_asins_last_check = asins.filter(function (a) { return a.removed_at; }).length;
    f._asins = asins;
    f._checks = [0, 1, 2, 3, 4, 5].map(function (q) { return { id: k * 10 + q, storefront_id: f.id, checked_at: isoDaysAgo(q * (k + 1), 6), status: 'ok', asin_count: f.asin_count - q, new_asins: q === 0 ? f.new_asins_last_check : ri(0, 3), removed_asins: ri(0, 2), tokens_consumed: ri(5, 20), error: null }; });
    return f;
  });

  /* ---------- repricer ---------- */
  D.repricer = { settings: { workspace_id: D.workspace.id, live_enabled: false, check_interval_minutes: 15, max_step_pct: 10, max_changes_per_sku_per_day: 24, max_changes_per_day: 500, pause_on_outside_change: true, updated_by: null, updated_at: null }, saved: false, rules: {}, actions: [] };
  skus.filter(function (s) { return s.cost != null; }).slice(0, 14).forEach(function (s, k) {
    D.repricer.rules[s.sku] = { seller_sku: s.sku, min_price_gbp: r2(s.price * 0.8), max_price_gbp: r2(s.price * 1.3), strategy: pick(['match_buy_box', 'beat_buy_box', 'max_price']), beat_by_gbp: 0.01, active: k % 5 !== 4, notes: null, updated_at: isoDaysAgo(k) };
  });
  for (var ac = 0; ac < 30; ac++) {
    var rs = pick(Object.keys(D.repricer.rules)), s = D.skuByKey[rs], oc = pick(['changed', 'changed', 'held', 'held', 'skipped']);
    D.repricer.actions.push({ id: 1000 - ac, seller_sku: rs, asin: s.asin, outcome: oc, live: false, strategy: D.repricer.rules[rs].strategy, old_price_gbp: s.price, target_price_gbp: r2(s.price * 0.97), new_price_gbp: oc === 'changed' ? r2(s.price * 0.97) : null, floor_gbp: r2(s.price * 0.8), ceiling_gbp: r2(s.price * 1.3), buy_box_gbp: s.buyBox, buy_box_seller_id: 'A2DEMOBUYBOX' + ri(1, 9), buy_box_is_yours: chance(0.3), offer_count: ri(2, 12), reason: oc === 'changed' ? 'Suggested: match buy box' : oc === 'held' ? 'you have the buy box; holding price' : 'live repricing is off', decided_at: isoDaysAgo(ac / 3, ri(6, 20)) });
  }

  /* ---------- review requests ---------- */
  D.reviewSettings = { workspace_id: D.workspace.id, sending_enabled: false, min_days_after_purchase: 7, max_days_after_purchase: 28, daily_limit: 200, exclude_skus: [], updated_by: null, updated_at: null };
  D.reviewSaved = false;
  D.reviewReqs = [];
  D.rawOrders.filter(function (o) { return o.day <= addDays(D.today, -7) && o.day >= addDays(D.today, -40); }).slice(0, 120).forEach(function (o, k) {
    var st = k % 17 === 5 ? 'not_eligible' : k % 29 === 3 ? 'skipped' : k % 3 === 0 ? 'eligible' : 'sent';
    D.reviewReqs.push({ amazon_order_id: o.id, status: st, checked_at: isoDaysAgo(ri(0, 20), 7), sent_at: st === 'sent' ? isoDaysAgo(ri(0, 20), 8) : null, attempts: 1, last_error: null, updated_at: isoDaysAgo(ri(0, 20), 8) });
  });
  D.reviewReqs.sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; });
  D.leadAlerts = { enabled: false, enabled_since: null, include_data_gap: true, min_profit: 3, min_roi: 35, recipients: [], updated_at: null, updated_by: null };
  D.hubSettings = { own_seller_id: 'A2DEMOOWNSELL01', own_seller_note: null, updated_at: isoDaysAgo(20) };
  D.costLog = [];
  D.recurring = [
    ['Accountancy fees', 180, 0.2, 'monthly', 12], ['Inventory software subscription', 59, 0.2, 'monthly', 20], ['Business insurance', 420, 0, 'yearly', 140], ['Prep and packing supplies', 95, 0.2, 'monthly', 9], ['Storage unit rent', 240, 0.2, 'monthly', 3],
  ].map(function (x) { return { id: D.uuid(), name: x[0], amount_gross_gbp: x[1], vat_rate: x[2], frequency: x[3], next_due: addDays(D.today, x[4]), active: true, notes: null }; });
  D.wishlist = {}; candidates.forEach(function (c) { if (c.wishlisted) D.wishlist[c.asin] = true; });
})();
