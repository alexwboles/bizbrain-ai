#!/usr/bin/env bash
# BizBrain AI smoke tests — 12 checks. Fails fast on first failure.
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

echo "== bizbrain-ai smoke =="

# 1-5: files exist
for f in index.html css/style.css js/logic.js js/app.js README.md; do
  if [ -f "$f" ]; then ok "file exists: $f"; else bad "missing file: $f"; fi
done

# 6-7: JS syntax
if node --check js/logic.js 2>/dev/null; then ok "logic.js syntax"; else bad "logic.js syntax"; fi
if node --check js/app.js 2>/dev/null; then ok "app.js syntax"; else bad "app.js syntax"; fi

# 8-12: logic checks in Node
node << 'EOF'
const Z = require('/home/hatch/workspace/bizbrain-ai/js/logic.js');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  PASS: ' + m); };
const bad = (m) => { fail++; console.log('  FAIL: ' + m); };

// 8: tokenize strips stopwords + punctuation
const toks = Z.tokenize('What is the refund policy?');
(toks.indexOf('refund') !== -1 && toks.indexOf('policy') !== -1 && toks.indexOf('what') === -1 && toks.indexOf('the') === -1 && toks.indexOf('is') === -1)
  ? ok('tokenize: keeps content words, drops stopwords') : bad('tokens=' + JSON.stringify(toks));

// 9: ask ranks the right doc first with an excerpt
const docs = Z.sampleDocs();
const r = Z.ask(docs, 'how do I get a refund', 3);
(r.answers.length > 0 && r.answers[0].title === 'Refund policy' && r.answers[0].excerpt.length > 20)
  ? ok('ask: refund question -> Refund policy first, excerpt present') : bad('ask=' + JSON.stringify(r.answers.map(a => a.title)));

// 10: no-match question flagged; empty query handled
const r2 = Z.ask(docs, 'quantum tunneling warranty', 3);
const r3 = Z.ask(docs, '   ', 3);
(r2.noMatch && r3.noMatch && r3.reason === 'empty') ? ok('ask: nonsense -> noMatch; blank -> empty') : bad('nomatch handling');

// 11: gaps collapse repeats; autoFAQ produces sourced entries
const gaps = [];
Z.logGap(gaps, 'Do you fix iPhones?');
Z.logGap(gaps, 'do you fix iphones?');
Z.logGap(gaps, 'What are hours?');
const sum = Z.gapSummary(gaps);
const faqs = Z.autoFAQ(docs, 5);
(sum.length === 2 && sum[0].count === 2 && faqs.length === 5 && faqs.every(f => f.source && f.a.length > 10))
  ? ok('gapSummary collapses dupes (2 groups, top=2x); autoFAQ 5 sourced entries') : bad('gaps/faqs');

// 12: validation + import/export round-trip
const bad1 = Z.validateDoc({ title: '', body: 'short' });
const good = Z.addDoc([], { title: 'T', body: 'This body is definitely long enough to pass validation checks.' });
const exp = Z.exportJSON([{ id: 'x', title: 'T', body: 'Body text here is long enough.', tags: [] }]);
const imp = Z.importJSON(exp);
const impBad = Z.importJSON('not json{{{');
(bad1.length === 2 && good.ok && imp.ok && imp.docs.length === 1 && !impBad.ok)
  ? ok('validateDoc/addDoc/export/import all behave') : bad('doc lifecycle');

// 13: tag-filtered ask searches only tagged docs
const tf1 = Z.ask(docs, 'money back guarantee', 3, 'support');
const tf2 = Z.ask(docs, 'money back guarantee', 3, 'pricing');
const tf3 = Z.ask(docs, 'money back guarantee', 3, 'nonexistent-tag');
(tf1.answers.length > 0 && tf1.answers[0].title === 'Refund policy' &&
  tf2.noMatch && tf3.noMatch && tf3.reason === 'notag')
  ? ok('ask with tagFilter: support tag answers, pricing tag noMatch, unknown tag notag') : bad('tagFilter');

// 14: duplicateDoc copies a doc with a fresh id and (copy) title
const ddocs = Z.sampleDocs().slice();
const c0 = ddocs.length;
const cp = Z.duplicateDoc(ddocs, 'doc-sample-1');
(cp && ddocs.length === c0 + 1 && cp.id !== 'doc-sample-1' && cp.title === 'Refund policy (copy)' &&
  cp.body === ddocs[0].body && cp.tags !== ddocs[0].tags && Z.duplicateDoc(ddocs, 'nope') === null)
  ? ok('duplicateDoc: fresh id, (copy) title, cloned tags') : bad('duplicateDoc');

// 15: searchDocs finds by title, tag, and body; empty query returns all
const sdocs = Z.sampleDocs();
(Z.searchDocs(sdocs, 'refund').length === 1 &&
  Z.searchDocs(sdocs, 'SUPPORT').length === 1 &&
  Z.searchDocs(sdocs, 'veterans').length === 1 &&
  Z.searchDocs(sdocs, 'zzz-nope').length === 0 &&
  Z.searchDocs(sdocs, '').length === 3)
  ? ok('searchDocs: title/tag/body hits, case-insensitive, empty=all') : bad('searchDocs');

// 16: allTags lists distinct lowercase tags; trimHistory caps the list
const at = Z.allTags(Z.sampleDocs());
(at.length === 5 && at[0] === 'contact' && at[4] === 'support' && Z.allTags([]).length === 0)
  ? ok('allTags: 5 distinct tags sorted') : bad('allTags=' + JSON.stringify(at));
const th = Z.trimHistory([1, 2, 3, 4, 5], 3);
(th.length === 3 && th[0] === 3 && Z.trimHistory(null, 3).length === 0)
  ? ok('trimHistory: keeps newest N, handles null') : bad('trimHistory');

// 15: suggestQuestions returns prefix matches, newest first, deduped, capped
const qs = [
  { query: 'What is our refund policy?', answered: true, topDoc: 'Refund policy' },
  { query: 'What are our opening hours?', answered: true, topDoc: 'Opening hours' },
  { query: 'what is our refund policy?', answered: false, topDoc: null },
  { query: 'Do you offer delivery?', answered: true, topDoc: 'Delivery' },
  { query: 'What is our return window?', answered: true, topDoc: 'Refund policy' }
];
const sug = Z.suggestQuestions(qs, 'what', 5);
(sug.length === 3 && sug[0] === 'What is our return window?' && sug[1] === 'what is our refund policy?')
  ? ok('suggestQuestions: prefix match, newest-first, case-insensitive dedupe (newest casing wins)') : bad('suggest=' + JSON.stringify(sug));
(Z.suggestQuestions(qs, '', 5).length === 0 && Z.suggestQuestions(qs, 'zzz', 5).length === 0)
  ? ok('suggestQuestions: empty/no-match prefix -> []') : bad('suggest edges');

// 16: relatedQuestions finds same-doc questions, excluding the current one
const rel = Z.relatedQuestions(qs, 'Refund policy', 'What is our refund policy?', 3);
(rel.length === 1 && rel[0] === 'What is our return window?')
  ? ok('relatedQuestions: same topDoc, excludes current, skips unanswered') : bad('related=' + JSON.stringify(rel));
(Z.relatedQuestions(qs, null, 'x').length === 0 && Z.relatedQuestions([], 'Refund policy', 'x').length === 0)
  ? ok('relatedQuestions: null doc / empty history -> []') : bad('related edges');

// 17: gapTermStats ranks missing-topic terms by frequency
const gg = [];
Z.logGap(gg, 'Do you fix iPhone screens?');
Z.logGap(gg, 'Do you fix iPhone batteries?');
Z.logGap(gg, 'What are your hours?');
const gt = Z.gapTermStats(gg, 5);
const gti = gt.filter(t => t.term === 'iphone')[0];
(gt.length > 0 && gti && gti.count === 2 && gt[0].count === 2)
  ? ok('gapTermStats: iphone is a top missing term (x2)') : bad('gapTerms=' + JSON.stringify(gt));
(Z.gapTermStats([], 5).length === 0)
  ? ok('gapTermStats: no gaps -> []') : bad('gapTerms empty');

console.log('node checks: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
EOF
[ $? -eq 0 ] && ok "node logic checks" || bad "node logic checks"

# 13+: new UI wiring present
node << 'EOF2'
const fs = require('fs');
const h = fs.readFileSync('/home/hatch/workspace/bizbrain-ai/index.html', 'utf8');
const a = fs.readFileSync('/home/hatch/workspace/bizbrain-ai/js/app.js', 'utf8');
const c = fs.readFileSync('/home/hatch/workspace/bizbrain-ai/css/style.css', 'utf8');
for (const id of ['qTag', 'qHist', 'qHistClear', 'dSearch', 'faqPrint', 'qSuggest']) {
  if (!h.includes('id="' + id + '"')) { console.log('missing ' + id); process.exit(1); }
}
if (!a.includes('duplicateDoc(state.docs') || !a.includes('renderQHistory()')) {
  console.log('app wiring missing'); process.exit(1);
}
if (!a.includes('suggestQuestions(state.questions') || !a.includes('relatedQuestions(state.questions') || !a.includes('gapTermStats(state.gaps')) {
  console.log('new feature wiring missing'); process.exit(1);
}
if (!c.includes('@media print')) { console.log('print css missing'); process.exit(1); }
console.log('ui wiring ok');
EOF2
[ $? -eq 0 ] && ok "new controls wired (qTag, qHist, dSearch, faqPrint, duplicate)" || bad "new controls wiring"

echo ""
echo "smoke: $PASS passed, $FAIL failed"
exit $FAIL
