/* bizbrain-ai app wiring — DOM + localStorage. Requires js/logic.js (window.Bizbrain). */
(function () {
  'use strict';
  var Z = window.Bizbrain;
  var LS_KEY = 'bizbrain-ai-v1';

  function $(id) { return document.getElementById(id); }

  var lastAnswers = [];

  function goTab(name) {
    var btn = document.querySelector('.tabs button[data-tab="' + name + '"]');
    if (btn) btn.click();
  }

  function highlightExcerpt(text, query) {
    var tokens = Z.tokenize(query);
    var h = esc(text);
    tokens.forEach(function (t) {
      if (t.length < 3) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      h = h.replace(re, '<mark>$1</mark>');
    });
    return h;
  }

  function defaultState() { return { docs: [], gaps: [], questions: [] }; }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        s.docs = s.docs || []; s.gaps = s.gaps || []; s.questions = s.questions || [];
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
  function recordQuestion(query, result) {
    state.questions.push({
      id: Z.uid('q'),
      query: query,
      at: new Date().toISOString(),
      answered: !result.noMatch,
      topDoc: result.noMatch ? null : (result.answers[0] && result.answers[0].title)
    });
    state.questions = Z.trimHistory(state.questions, 20);
    save();
    renderQHistory();
  }

  function doAsk(query) {
    var q = (query != null ? query : $('qInput').value).trim();
    var out = $('qOut');
    if (!q) { out.innerHTML = '<div class="warnbox">Type a question first.</div>'; return; }
    if (!state.docs.length) {
      out.innerHTML = '<div class="warnbox">Your vault is empty — add some documents first (Documents tab), or load the samples.</div>';
      return;
    }
    var tagFilter = $('qTag') ? $('qTag').value : '';
    var r = Z.ask(state.docs, q, 3, tagFilter || null);
    recordQuestion(q, r);
    if (r.noMatch) {
      var reason = r.reason === 'notag'
        ? 'No documents carry the tag <strong>' + esc(tagFilter) + '</strong>.'
        : 'Nobody has written this down yet — that\'s a knowledge gap worth closing.';
      out.innerHTML = '<div class="warnbox"><strong>No good match in your documents.</strong> ' + reason + '</div>' +
        '<button class="primary" id="gapLog">Log as knowledge gap</button>';
      $('gapLog').addEventListener('click', function () {
        Z.logGap(state.gaps, q);
        save(); renderGaps();
        out.innerHTML = '<div class="notice">Logged. Find it under <strong>Knowledge gaps</strong> — write it up once and the brain learns it forever.</div>';
      });
      return;
    }
    var html = '';
    var conf = Z.answerConfidence(r, q);
    html += '<div class="conf conf-' + conf.level + '">' + esc(conf.note) + '</div>';
    lastAnswers = r.answers;
    r.answers.forEach(function (a, i) {
      var tags = (a.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join(' ');
      html += '<div class="answer"><div class="ans-meta"><span class="src-chip">' + esc(a.title) + '</span>' +
        tags + '<span class="rel">match ' + a.score + '</span></div>' +
        '<div class="ex">' + highlightExcerpt(a.excerpt || '(title match — open the document for full context)', q) + '</div>' +
        '<div class="ans-actions">' +
        '<button class="ghost small" data-copy-ans="' + i + '">Copy answer</button>' +
        '<button class="ghost small" data-open-doc="' + esc(a.title) + '">Open document</button>' +
        '</div></div>';
    });
    var related = Z.relatedQuestions(state.questions, r.answers[0].title, q, 3);
    if (related.length) {
      html += '<div class="related"><div class="rel-h">People also asked</div>' +
        related.map(function (rq) {
          return '<button class="rel-q" data-rel="' + esc(rq) + '">' + esc(rq) + '</button>';
        }).join('') + '</div>';
    }
    out.innerHTML = html;
    out.querySelectorAll('[data-rel]').forEach(function (b) {
      b.addEventListener('click', function () { $('qInput').value = b.dataset.rel; doAsk(); });
    });
    out.querySelectorAll('[data-copy-ans]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = lastAnswers[parseInt(b.dataset.copyAns, 10)];
        if (!a) return;
        var t = 'Q: ' + q + '\nA (from ' + a.title + '): ' + (a.excerpt || '');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
        b.textContent = 'Copied';
        setTimeout(function () { b.textContent = 'Copy answer'; }, 1400);
      });
    });
    out.querySelectorAll('[data-open-doc]').forEach(function (b) {
      b.addEventListener('click', function () {
        goTab('docs');
        var ds = $('dSearch');
        ds.value = b.dataset.openDoc;
        ds.dispatchEvent(new Event('input'));
      });
    });
  }
  $('qAsk').addEventListener('click', function () { doAsk(); });
  $('qInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAsk(); });

  // ---------- question autocomplete from history ----------
  function renderSuggest() {
    var box = $('qSuggest');
    if (!box) return;
    var list = Z.suggestQuestions(state.questions, $('qInput').value, 5);
    if (!list.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = 'flex';
    box._list = list;
    box.innerHTML = list.map(function (qq, i) {
      return '<button class="sug" data-sug="' + i + '">' + esc(qq) + '</button>';
    }).join('');
    box.querySelectorAll('[data-sug]').forEach(function (b) {
      // mousedown beats the input's blur handler so the click lands
      b.addEventListener('mousedown', function (e) {
        e.preventDefault();
        $('qInput').value = box._list[parseInt(b.dataset.sug, 10)];
        box.style.display = 'none';
        doAsk();
      });
    });
  }
  $('qInput').addEventListener('input', renderSuggest);
  $('qInput').addEventListener('blur', function () {
    setTimeout(function () { var b = $('qSuggest'); if (b) b.style.display = 'none'; }, 150);
  });

  // ---------- question history ----------
  function fmtWhen(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function renderQHistory() {
    var box = $('qHist');
    if (!box) return;
    var list = state.questions.slice().reverse();
    if (!list.length) {
      box.innerHTML = '<p class="muted small">Questions you ask show up here — tap one to ask it again.</p>';
      return;
    }
    box.innerHTML = list.map(function (q) {
      return '<button class="qhist-item' + (q.answered ? '' : ' unanswered') + '" data-qid="' + esc(q.id) + '" title="Ask again">' +
        '<span class="qh-q">' + esc(q.query) + '</span>' +
        '<span class="qh-m">' + esc(fmtWhen(q.at)) +
        (q.answered && q.topDoc ? ' · ' + esc(q.topDoc) : ' · no match') + '</span></button>';
    }).join('');
    box.querySelectorAll('[data-qid]').forEach(function (b) {
      b.addEventListener('click', function () {
        var found = null;
        state.questions.forEach(function (q) { if (q.id === b.dataset.qid) found = q; });
        if (found) { $('qInput').value = found.query; doAsk(found.query); }
      });
    });
  }

  $('qHistClear').addEventListener('click', function () {
    state.questions = [];
    save(); renderQHistory();
  });

  function refreshTagFilter() {
    var sel = $('qTag');
    if (!sel) return;
    var cur = sel.value;
    var tags = Z.allTags(state.docs);
    sel.innerHTML = '<option value="">All tags</option>' + tags.map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
    }).join('');
    if (tags.indexOf(cur) !== -1) sel.value = cur;
  }

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

  function ageText(iso) {
    var days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    if (days < 30) return days + 'd old';
    return Math.floor(days / 30) + ' mo old';
  }

  function renderDocs() {
    $('docCount').textContent = '(' + state.docs.length + ')';
    refreshTagFilter();
    var q = $('dSearch') ? $('dSearch').value : '';
    var visible = Z.searchDocs(state.docs, q);
    if (!state.docs.length) {
      $('docList').innerHTML = '<p class="muted">No documents yet. Add your first one above, or load the samples to try it out.</p>';
      return;
    }
    if (!visible.length) {
      $('docList').innerHTML = '<p class="muted">No documents match your search.</p>';
      return;
    }
    // Vault health: stale documents + possible duplicates, shown above the shelves.
    var strips = '';
    var stale = Z.staleDocs(state.docs, 180);
    if (stale.length) {
      strips += '<div class="vault-strip stale"><div class="vs-h">Needs review — older than 6 months</div>' +
        stale.map(function (d) {
          return '<div class="vs-row"><span>' + esc(d.title) + '</span><span class="muted small">' + ageText(d.createdAt) + '</span></div>';
        }).join('') + '</div>';
    }
    var sims = Z.findSimilar(state.docs, 0.5);
    if (sims.length) {
      strips += '<div class="vault-strip sim"><div class="vs-h">Possible duplicates — same content in two places</div>' +
        sims.slice(0, 5).map(function (p) {
          return '<div class="vs-row"><span>' + esc(p.a.title) + ' ↔ ' + esc(p.b.title) + '</span>' +
            '<span class="muted small">' + Math.round(p.sim * 100) + '% similar</span></div>';
        }).join('') + '</div>';
    }
    var html = strips;
    visible.forEach(function (d) {
      var tags = (d.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join(' ');
      var words = d.body.split(/\s+/).length;
      html += '<div class="docitem"><div><div class="t">' + esc(d.title) + '</div>' +
        '<div class="m">' + words + ' words ' + tags + '</div></div>' +
        '<button class="ghost small" data-copy-doc="' + esc(d.id) + '">Copy</button>' +
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
    $('docList').querySelectorAll('[data-copy-doc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Z.duplicateDoc(state.docs, btn.dataset.copyDoc);
        save(); renderDocs();
      });
    });
  }

  $('dSearch').addEventListener('input', renderDocs);

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

  $('faqPrint').addEventListener('click', function () {
    if (!lastFaqs.length) { alert('Generate an FAQ first.'); return; }
    window.print();
  });

  // ---------- gaps ----------
  function renderGaps() {
    var sum = Z.gapSummary(state.gaps);
    if (!sum.length) {
      $('gapList').innerHTML = '<p class="muted">No gaps logged. Gaps appear when someone asks a question your documents can\'t answer — each one is a page your handbook is missing.</p>';
      return;
    }
    var terms = Z.gapTermStats(state.gaps, 8);
    var termHtml = terms.length
      ? '<div class="gapterms"><div class="rel-h">Most-asked-about missing topics — write these up first</div>' +
        terms.map(function (t) {
          return '<span class="termchip">' + esc(t.term) + ' <b>×' + t.count + '</b></span>';
        }).join('') + '</div>'
      : '';
    var html = termHtml + '<table><tr><th>Question asked</th><th>Times</th><th></th></tr>';
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

  // ---------- vault health rail (right side of Ask) ----------
  function renderHealth() {
    var hr = $('healthRows');
    if (!hr) return;
    var summary = Z.gapSummary(state.gaps);
    var rows = [
      { label: 'Documents shelved', n: state.docs.length, tab: 'docs' },
      { label: 'Questions asked', n: state.questions.length, tab: 'ask' },
      { label: 'Open gaps', n: summary.length, tab: 'gaps' },
      { label: 'Stale — needs review', n: Z.staleDocs(state.docs, 180).length, tab: 'docs' },
      { label: 'Possible duplicates', n: Z.findSimilar(state.docs, 0.5).length, tab: 'docs' }
    ];
    hr.innerHTML = rows.map(function (r) {
      return '<button class="hrow" data-htab="' + r.tab + '"><span class="hn">' + r.n + '</span>' +
        '<span class="hl">' + esc(r.label) + '</span></button>';
    }).join('');
    hr.querySelectorAll('[data-htab]').forEach(function (b) {
      b.addEventListener('click', function () { goTab(b.dataset.htab); });
    });

    var terms = Z.gapTermStats(state.gaps, 6);
    var ht = $('healthTerms');
    if (ht) {
      ht.innerHTML = terms.length
        ? terms.map(function (t) {
            return '<button class="termchip" data-htab="gaps">' + esc(t.term) + ' <b>×' + t.count + '</b></button>';
          }).join('')
        : '<p class="muted small">No gaps yet — ask something the vault can\'t answer.</p>';
      ht.querySelectorAll('[data-htab]').forEach(function (b) {
        b.addEventListener('click', function () { goTab('gaps'); });
      });
    }

    var nd = $('navDocCount'), ng = $('navGapCount');
    if (nd) nd.textContent = state.docs.length ? String(state.docs.length) : '';
    if (ng) ng.textContent = summary.length ? String(summary.length) : '';
  }

  // ---------- global command bar ----------
  var cmd = $('cmdAsk');
  if (cmd) {
    cmd.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && cmd.value.trim()) {
        $('qInput').value = cmd.value.trim();
        cmd.value = '';
        goTab('ask');
        doAsk();
      }
    });
  }
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag)) {
      e.preventDefault();
      if (cmd) cmd.focus();
    }
  });

  var _renderDocs = renderDocs, _renderGaps = renderGaps, _renderQHistory = renderQHistory;
  renderDocs = function () { _renderDocs(); renderHealth(); };
  renderGaps = function () { _renderGaps(); renderHealth(); };
  renderQHistory = function () { _renderQHistory(); renderHealth(); };

  renderDocs();
  renderGaps();
  renderQHistory();
})();
