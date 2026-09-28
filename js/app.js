/* bizbrain-ai app wiring — DOM + localStorage. Requires js/logic.js (window.Bizbrain). */
(function () {
  'use strict';
  var Z = window.Bizbrain;
  var LS_KEY = 'bizbrain-ai-v1';

  function $(id) { return document.getElementById(id); }

  function defaultState() { return { docs: [], gaps: [] }; }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        s.docs = s.docs || []; s.gaps = s.gaps || [];
        return s;
      }
    } catch (e) {}
    return defaultState();
  }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  var state = load();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- tabs ----------
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab);
      });
    });
  });

  // ---------- ask ----------
  function doAsk() {
    var q = $('qInput').value.trim();
    var out = $('qOut');
    if (!q) { out.innerHTML = '<div class="warnbox">Type a question first.</div>'; return; }
    if (!state.docs.length) {
      out.innerHTML = '<div class="warnbox">Your vault is empty — add some documents first (Documents tab), or load the samples.</div>';
      return;
    }
    var r = Z.ask(state.docs, q, 3);
    if (r.noMatch) {
      out.innerHTML = '<div class="warnbox"><strong>No good match in your documents.</strong> ' +
        'Nobody has written this down yet — that\'s a knowledge gap worth closing.</div>' +
        '<button class="primary" id="gapLog">Log as knowledge gap</button>';
      $('gapLog').addEventListener('click', function () {
        Z.logGap(state.gaps, q);
        save(); renderGaps();
        out.innerHTML = '<div class="notice">Logged. Find it under <strong>Knowledge gaps</strong> — write it up once and the brain learns it forever.</div>';
      });
      return;
    }
    var html = '';
    r.answers.forEach(function (a, i) {
      var tags = (a.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join(' ');
      html += '<div class="answer"><span class="rel">match ' + a.score + '</span>' +
        '<div class="src">Answer ' + (i + 1) + ' · from</div>' +
        '<div class="ttl">' + esc(a.title) + ' ' + tags + '</div>' +
        '<div class="ex">' + esc(a.excerpt || '(title match — open the document for full context)') + '</div></div>';
    });
    out.innerHTML = html;
  }
  $('qAsk').addEventListener('click', doAsk);
  $('qInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAsk(); });

  // ---------- documents ----------
  $('dAdd').addEventListener('click', function () {
    var r = Z.addDoc(state.docs, { title: $('dTitle').value, body: $('dBody').value, tags: $('dTags').value });
    if (!r.ok) { alert(r.error); return; }
    $('dTitle').value = ''; $('dBody').value = ''; $('dTags').value = '';
    save(); renderDocs();
  });

  $('dSample').addEventListener('click', function () {
    if (state.docs.length && !confirm('Add 3 sample documents to your vault?')) return;
    Z.sampleDocs().forEach(function (d) {
      if (!state.docs.some(function (x) { return x.id === d.id; })) state.docs.push(d);
    });
    save(); renderDocs();
  });

  $('dExport').addEventListener('click', function () {
    var blob = new Blob([Z.exportJSON(state.docs)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bizbrain-backup.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  $('dImportBtn').addEventListener('click', function () { $('dImport').click(); });
  $('dImport').addEventListener('change', function () {
    var f = $('dImport').files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var r = Z.importJSON(rd.result);
      if (!r.ok) { alert(r.error); return; }
      var ids = {};
      state.docs.forEach(function (d) { ids[d.id] = true; });
      r.docs.forEach(function (d) { if (!ids[d.id]) state.docs.push(d); });
      save(); renderDocs();
      alert('Imported ' + r.docs.length + ' document(s).');
    };
    rd.readAsText(f);
    $('dImport').value = '';
  });

  function renderDocs() {
    $('docCount').textContent = '(' + state.docs.length + ')';
    if (!state.docs.length) {
      $('docList').innerHTML = '<p class="muted">No documents yet. Add your first one above, or load the samples to try it out.</p>';
      return;
    }
    var html = '';
    state.docs.forEach(function (d) {
      var tags = (d.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join(' ');
      var words = d.body.split(/\s+/).length;
      html += '<div class="docitem"><div><div class="t">' + esc(d.title) + '</div>' +
        '<div class="m">' + words + ' words ' + tags + '</div></div>' +
        '<button class="danger small" data-del-doc="' + esc(d.id) + '">Delete</button></div>';
    });
    $('docList').innerHTML = html;
    $('docList').querySelectorAll('[data-del-doc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this document?')) return;
        Z.deleteDoc(state.docs, btn.dataset.delDoc);
        save(); renderDocs();
      });
    });
  }

  // ---------- FAQ ----------
  var lastFaqs = [];
  $('faqGen').addEventListener('click', function () {
    if (!state.docs.length) { $('faqOut').innerHTML = '<div class="warnbox">Add documents first.</div>'; return; }
    lastFaqs = Z.autoFAQ(state.docs, parseInt($('faqN').value, 10));
    if (!lastFaqs.length) { $('faqOut').innerHTML = '<p class="muted">Not enough content to draft FAQs yet.</p>'; return; }
    var html = '';
    lastFaqs.forEach(function (f) {
      html += '<div class="faq"><div class="q">' + esc(f.q) + '</div><div class="a">' + esc(f.a) +
        '</div><div class="s">Source: ' + esc(f.source) + '</div></div>';
    });
    $('faqOut').innerHTML = html;
  });

  $('faqCopy').addEventListener('click', function () {
    if (!lastFaqs.length) { alert('Generate an FAQ first.'); return; }
    var t = lastFaqs.map(function (f) { return f.q + '\n' + f.a + '\n(Source: ' + f.source + ')'; }).join('\n\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { alert('FAQ copied to clipboard.'); });
    } else { prompt('Copy your FAQ:', t); }
  });

  // ---------- gaps ----------
  function renderGaps() {
    var sum = Z.gapSummary(state.gaps);
    if (!sum.length) {
      $('gapList').innerHTML = '<p class="muted">No gaps logged. Gaps appear when someone asks a question your documents can\'t answer — each one is a page your handbook is missing.</p>';
      return;
    }
    var html = '<table><tr><th>Question asked</th><th>Times</th><th></th></tr>';
    sum.forEach(function (g) {
      html += '<tr><td>' + esc(g.query) + '</td><td><strong>' + g.count + '×</strong></td>' +
        '<td><button class="ghost small" data-gap-resolve="' + esc(g.ids[0]) + '">Mark written up</button></td></tr>';
    });
    $('gapList').innerHTML = html + '</table>';
    $('gapList').querySelectorAll('[data-gap-resolve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // resolve all entries for this normalized question
        var target = null;
        Z.gapSummary(state.gaps).forEach(function (g) { if (g.ids[0] === btn.dataset.gapResolve) target = g; });
        if (target) target.ids.forEach(function (id) { Z.resolveGap(state.gaps, id); });
        save(); renderGaps();
      });
    });
  }

  $('gapClear').addEventListener('click', function () {
    if (!confirm('Clear all knowledge gaps?')) return;
    state.gaps = [];
    save(); renderGaps();
  });

  renderDocs();
  renderGaps();
})();
