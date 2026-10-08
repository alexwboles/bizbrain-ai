/* bizbrain-ai shared logic — works in Node (module.exports) and browsers (window.Bizbrain).
 * No dependencies. Keyword Q&A over local documents; no network calls. */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Bizbrain = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOPWORDS = {};
  ('a,an,the,and,or,but,if,then,else,when,at,by,for,with,about,into,through,during,' +
   'before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,' +
   'once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,' +
   'own,same,so,than,too,very,can,will,just,should,now,do,does,did,is,are,was,were,' +
   'be,been,being,have,has,had,having,i,you,he,she,it,we,they,them,his,her,its,our,' +
   'their,my,your,as,of,what,which,who,whom,this,that,these,those,am,us,me').split(',').forEach(function (w) { STOPWORDS[w] = true; });

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function tokenize(text) {
    return String(text || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(function (t) { return t.length > 1 && !STOPWORDS[t]; });
  }

  function sentences(text) {
    return String(text || '').split(/[.!?\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function freqMap(tokens) {
    var m = {};
    tokens.forEach(function (t) { m[t] = (m[t] || 0) + 1; });
    return m;
  }

  // Relevance score: title hits count 3x; body hits 1x.
  function scoreDoc(queryTokens, doc) {
    if (!queryTokens.length) return 0;
    var titleF = freqMap(tokenize(doc.title));
    var bodyF = freqMap(tokenize(doc.body));
    var score = 0;
    queryTokens.forEach(function (qt) {
      score += 3 * (titleF[qt] || 0) + (bodyF[qt] || 0);
    });
    return score;
  }

  // Best 1-2 sentences from a doc for the query tokens.
  function bestExcerpt(queryTokens, doc, maxSentences) {
    maxSentences = maxSentences || 2;
    var sents = sentences(doc.body);
    var scored = sents.map(function (s) {
      var f = freqMap(tokenize(s));
      var sc = 0;
      queryTokens.forEach(function (qt) { sc += (f[qt] || 0); });
      return { s: s, sc: sc };
    }).filter(function (x) { return x.sc > 0; });
    scored.sort(function (a, b) { return b.sc - a.sc; });
    return scored.slice(0, maxSentences).map(function (x) { return x.s; }).join(' ');
  }

  // Ask a question over the vault. Returns { answers:[{docId,title,tags,score,excerpt}], noMatch }.
  // tagFilter: optional tag string — only documents carrying it are searched.
  function ask(docs, query, topN, tagFilter) {
    topN = topN || 3;
    var qt = tokenize(query);
    if (!qt.length) return { answers: [], noMatch: true, reason: 'empty' };
    var pool = docs;
    if (tagFilter) {
      pool = docs.filter(function (d) {
        return (d.tags || []).some(function (t) { return String(t).toLowerCase() === String(tagFilter).toLowerCase(); });
      });
      if (!pool.length) return { answers: [], noMatch: true, reason: 'notag' };
    }
    var ranked = [];
    pool.forEach(function (d) {
      var sc = scoreDoc(qt, d);
      if (sc > 0) ranked.push({ docId: d.id, title: d.title, tags: d.tags || [], score: sc, excerpt: bestExcerpt(qt, d) });
    });
    ranked.sort(function (a, b) { return b.score - a.score; });
    if (!ranked.length) return { answers: [], noMatch: true, reason: 'nomatch' };
    return { answers: ranked.slice(0, topN), noMatch: false };
  }

  // Term statistics across the vault: { term: { df, tf } }.
  function termStats(docs) {
    var stats = {};
    docs.forEach(function (d) {
      var seen = {};
      tokenize(d.title + ' ' + d.body).forEach(function (t) {
        if (!stats[t]) stats[t] = { df: 0, tf: 0 };
        stats[t].tf++;
        if (!seen[t]) { stats[t].df++; seen[t] = true; }
      });
    });
    return stats;
  }

  // Auto-generate candidate FAQs from the most frequent meaningful terms.
  function autoFAQ(docs, n) {
    n = n || 8;
    var stats = termStats(docs);
    var terms = Object.keys(stats)
      .filter(function (t) { return t.length > 3; })
      .sort(function (a, b) { return (stats[b].tf * stats[b].df) - (stats[a].tf * stats[a].df); });
    var faqs = [];
    var usedDocs = {};
    terms.forEach(function (term) {
      if (faqs.length >= n) return;
      var best = null;
      docs.forEach(function (d) {
        if (usedDocs[d.id] && faqs.length > n / 2) return; // spread sources once we have enough
        var sents = sentences(d.body);
        for (var i = 0; i < sents.length; i++) {
          if (tokenize(sents[i]).indexOf(term) !== -1) {
            var sc = scoreDoc([term], d);
            if (!best || sc > best.sc) best = { sc: sc, sentence: sents[i], doc: d };
            break;
          }
        }
      });
      if (best) {
        usedDocs[best.doc.id] = true;
        faqs.push({
          id: uid('faq'),
          q: 'What about "' + term + '"?',
          a: best.sentence.trim() + '.',
          source: best.doc.title,
          term: term
        });
      }
    });
    return faqs;
  }

  function validateDoc(d) {
    var errs = [];
    if (!d || !d.title || !String(d.title).trim()) errs.push('Document needs a title.');
    if (!d || !d.body || !String(d.body).trim()) errs.push('Document needs some content.');
    else if (String(d.body).trim().length < 20) errs.push('Content is too short to be useful (min 20 characters).');
    return errs;
  }

  function addDoc(docs, inp) {
    var errs = validateDoc(inp);
    if (errs.length) return { ok: false, error: errs[0] };
    var doc = {
      id: uid('doc'),
      title: String(inp.title).trim(),
      body: String(inp.body).trim(),
      tags: inp.tags ? String(inp.tags).split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [],
      createdAt: new Date().toISOString()
    };
    docs.push(doc);
    return { ok: true, doc: doc };
  }

  function deleteDoc(docs, id) {
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].id === id) { docs.splice(i, 1); return true; }
    }
    return false;
  }

  // Copy a document as a starting point for a similar one. Returns the new doc or null.
  function duplicateDoc(docs, id) {
    var src = null;
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].id === id) { src = docs[i]; break; }
    }
    if (!src) return null;
    var copy = {
      id: uid('doc'),
      title: src.title + ' (copy)',
      body: src.body,
      tags: (src.tags || []).slice(),
      createdAt: new Date().toISOString()
    };
    docs.push(copy);
    return copy;
  }

  // Full-text search across the vault: title, tags, and body. Empty query = all docs.
  function searchDocs(docs, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return docs || [];
    return (docs || []).filter(function (d) {
      return String(d.title || '').toLowerCase().indexOf(q) !== -1 ||
        (d.tags || []).some(function (t) { return String(t).toLowerCase().indexOf(q) !== -1; }) ||
        String(d.body || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // All distinct tags across the vault, lowercased, sorted.
  function allTags(docs) {
    var seen = {};
    (docs || []).forEach(function (d) {
      (d.tags || []).forEach(function (t) {
        var k = String(t).trim().toLowerCase();
        if (k) seen[k] = true;
      });
    });
    return Object.keys(seen).sort();
  }

  // Keep a question-history list trimmed to maxN entries, newest last.
  function trimHistory(history, maxN) {
    var h = history || [];
    var n = maxN || 20;
    return h.length > n ? h.slice(h.length - n) : h;
  }

  function normalizeQuery(q) {
    return String(q || '').toLowerCase().replace(/\s+/g, ' ').replace(/[?!.,;:]+$/g, '').trim();
  }

  function logGap(gaps, query) {
    var q = String(query || '').trim();
    if (!q) return { ok: false, error: 'Empty question.' };
    gaps.push({ id: uid('gap'), query: q, at: new Date().toISOString() });
    return { ok: true };
  }

  // Collapse repeat questions: [{ query, count, lastAt }] sorted by count desc.
  function gapSummary(gaps) {
    var map = {};
    gaps.forEach(function (g) {
      var k = normalizeQuery(g.query);
      if (!map[k]) map[k] = { query: g.query, count: 0, lastAt: g.at, ids: [] };
      map[k].count++;
      map[k].ids.push(g.id);
      if (g.at > map[k].lastAt) map[k].lastAt = g.at;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function resolveGap(gaps, id) {
    for (var i = gaps.length - 1; i >= 0; i--) {
      if (gaps[i].id === id) gaps.splice(i, 1);
    }
  }

  function exportJSON(docs) {
    return JSON.stringify({ app: 'bizbrain-ai', version: 1, exportedAt: new Date().toISOString(), docs: docs }, null, 2);
  }

  function importJSON(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not valid JSON.' }; }
    var docs = data.docs || data;
    if (!Array.isArray(docs)) return { ok: false, error: 'No document list found in file.' };
    var clean = [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (d && d.title && d.body) {
        clean.push({ id: d.id || uid('doc'), title: String(d.title), body: String(d.body), tags: d.tags || [], createdAt: d.createdAt || new Date().toISOString() });
      }
    }
    if (!clean.length) return { ok: false, error: 'No valid documents found in file.' };
    return { ok: true, docs: clean };
  }

  function sampleDocs() {
    return [
      {
        id: 'doc-sample-1', title: 'Refund policy',
        body: 'We offer a 30-day money-back guarantee on all services. To request a refund, email support with your receipt number. Refunds are processed within 5 business days to the original payment method. Custom orders are non-refundable once work has started.',
        tags: ['policy', 'support'], createdAt: new Date().toISOString()
      },
      {
        id: 'doc-sample-2', title: 'Pricing 2026',
        body: 'Our standard service call is $89, which includes the first hour of labor. Additional labor is billed at $75 per hour. Emergency after-hours calls carry a $50 surcharge. We accept cash, check, and all major credit cards. Seniors and veterans receive a 10% discount.',
        tags: ['pricing'], createdAt: new Date().toISOString()
      },
      {
        id: 'doc-sample-3', title: 'Opening hours',
        body: 'We are open Monday to Friday, 9am to 5pm, and Saturdays 10am to 2pm. We are closed on Sundays and public holidays. Bookings can be made online at any time. For same-day service, call before noon.',
        tags: ['hours', 'contact'], createdAt: new Date().toISOString()
      }
    ];
  }

  return {
    STOPWORDS: STOPWORDS,
    tokenize: tokenize,
    sentences: sentences,
    scoreDoc: scoreDoc,
    bestExcerpt: bestExcerpt,
    ask: ask,
    termStats: termStats,
    autoFAQ: autoFAQ,
    validateDoc: validateDoc,
    addDoc: addDoc,
    deleteDoc: deleteDoc,
    duplicateDoc: duplicateDoc,
    searchDocs: searchDocs,
    allTags: allTags,
    trimHistory: trimHistory,
    normalizeQuery: normalizeQuery,
    logGap: logGap,
    gapSummary: gapSummary,
    resolveGap: resolveGap,
    exportJSON: exportJSON,
    importJSON: importJSON,
    sampleDocs: sampleDocs,
    uid: uid
  };
});
