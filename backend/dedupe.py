"""
Multi-signal similarity engine for post duplicate detection.

Replaces pure Jaccard with six complementary signals fused by a
weighted sum, then boosted when a single signal is overwhelming.

Why the previous Jaccard approach hits a ceiling
─────────────────────────────────────────────────
For "How do I reset my account's password?" vs "Reset my password":
    A tokens = {reset, account, password}
    B tokens = {reset, password}
    Jaccard = 2/3 = 0.667   ← "account" penalises 33% of the score
    Dice    = 4/5 = 0.800   ← still penalised
    Containment = 2/2 = 1.0 ← recognises subset relationship

Jaccard has no notion of "this extra word is light" or "the shorter
title is a complete answer to the longer one". No reweighting of
Jaccard fixes this. We need at least one size-asymmetric measure,
and IDF weighting so light words (account, my) matter less than
heavy ones (reset, password).

Signals (each returns a value in [0, 1])
─────────────────────────────────────────
    containment   IDF-weighted subset detection
    dice          IDF-weighted symmetric overlap
    bm25          Symmetric, normalised BM25
    trigram       Character-trigram Dice (typo / morphology robust)
    fuzzy         difflib.SequenceMatcher ratio
    jaccard       IDF-weighted strict overlap

IDF is computed across the corpus the engine is instantiated with.
For /api/posts/similar, the corpus is the blocked candidate set
(typically ≤ 200). For /api/admin/duplicates, the corpus is the
full post set.
"""
from __future__ import annotations

import difflib
import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

# ── Tunables ────────────────────────────────────────────────────────────

WEIGHTS = {
    "containment": 0.25,
    "dice":        0.15,
    "bm25":        0.15,
    "trigram":     0.20,
    "fuzzy":       0.15,
    "jaccard":     0.10,
}

# Extra weight applied to the body signal when both sides have a body.
# All weights above are renormalised to make room for it.
BODY_WEIGHT = 0.15

THRESHOLDS = {
    "duplicate":          0.80,
    "probably_duplicate": 0.65,
    "similar":            0.45,
}

# Boost thresholds — fire only when one signal is overwhelming.
BOOST_CONTAINMENT_MIN  = 0.95
BOOST_CONTAINMENT_TRIG = 0.50
BOOST_CONTAINMENT_HIT  = 0.85
BOOST_DICE_MIN         = 0.90
BOOST_DICE_HIT         = 0.85
BOOST_JACCARD_MIN      = 0.90
BOOST_JACCARD_HIT      = 0.90
BOOST_BODY_MIN         = 0.90
BOOST_BODY_HIT         = 0.85

BODY_SCAN_LIMIT  = 500
TRIGRAM_BODY_CAP = 400

# BM25 tuning: k1=1.5 (standard), b=0.30 (mild length normalisation
# — short titles shouldn't be heavily penalised for being short).
BM25_K1 = 1.5
BM25_B  = 0.30

_STOPWORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "to", "of", "for", "in",
    "on", "at", "by", "with", "and", "or", "but", "do", "does", "did",
    "how", "why", "what", "when", "where", "which", "who", "this", "that",
    "it", "my", "i", "you", "we", "they", "be", "been", "being",
    "have", "has", "had", "can", "could", "should", "would", "will",
    "not", "no", "so", "if", "then", "than", "as", "into", "about",
    "without", "from", "just", "only", "also", "very",
})

_WORD_RE = re.compile(r"[a-z0-9][a-z0-9_+#.-]{1,}", re.IGNORECASE)
_WS_RE   = re.compile(r"\s+")

# ── Normalisation & tokenisation ────────────────────────────────────────

def normalize(text: str) -> str:
    if not text:
        return ""
    s = str(text).lower()
    try:
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    except Exception:
        pass
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return _WS_RE.sub(" ", s).strip()


def tokenize(text: str) -> list[str]:
    return _WORD_RE.findall(normalize(text))


def trigrams(text: str, n: int = 3) -> set[str]:
    s = normalize(text)
    if len(s) < n:
        return set()
    return {s[i:i + n] for i in range(len(s) - n + 1)}


def fuzzy_ratio(a: str, b: str) -> float:
    a_n, b_n = normalize(a), normalize(b)
    if not a_n or not b_n:
        return 0.0
    return difflib.SequenceMatcher(None, a_n, b_n).ratio()


def _trigram_dice(a: str, b: str) -> float:
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 0.0
    return 2 * len(ta & tb) / (len(ta) + len(tb))


# ── Data classes ────────────────────────────────────────────────────────

@dataclass
class Query:
    title_raw:    str = ""
    title_tokens: list[str] = field(default_factory=list)
    body_tokens:  list[str] = field(default_factory=list)
    tags_lower:   list[str] = field(default_factory=list)
    post_type:    str = ""


@dataclass
class PairScore:
    score: float
    label: str
    components: dict[str, float] = field(default_factory=dict)


def build_query(
    title: str,
    body: str = "",
    tags: list[str] | None = None,
    post_type: str = "",
) -> Query:
    title_tokens = [t for t in tokenize(title) if t not in _STOPWORDS][:30]
    body_tokens  = [t for t in tokenize((body or "")[:BODY_SCAN_LIMIT])
                    if t not in _STOPWORDS][:200]
    return Query(
        title_raw=title or "",
        title_tokens=title_tokens,
        body_tokens=body_tokens,
        tags_lower=[t.strip().lower() for t in (tags or []) if t and t.strip()],
        post_type=(post_type or "").lower(),
    )


def label_for(score: float) -> str:
    if score >= THRESHOLDS["duplicate"]:
        return "duplicate"
    if score >= THRESHOLDS["probably_duplicate"]:
        return "probably_duplicate"
    if score >= THRESHOLDS["similar"]:
        return "similar"
    return ""


# ── Similarity engine ───────────────────────────────────────────────────

class SimilarityEngine:
    """
    Build once per corpus; score many times.

    The corpus is a list of dicts with keys: title, body, tags, post_type.
    All signals that use IDF read from this corpus.

    Usage
    ─────
        engine = SimilarityEngine(candidates)
        ranked = engine.rank(query, min_score=0.30)   # → [(PairScore, cand), ...]
        # or, for a scan over many pairs:
        s = engine.score_pair(query, candidate_dict)
    """

    def __init__(self, corpus: list[dict[str, Any]],
                 *, k1: float = BM25_K1, b: float = BM25_B):
        self.corpus = corpus
        self.N = max(1, len(corpus))
        self.k1 = k1
        self.b  = b

        self.df_title: Counter = Counter()
        self.df_body:  Counter = Counter()
        title_lens: list[int] = []

        for d in corpus:
            t_tokens = self._title_tokens(d.get("title", ""))
            self.df_title.update(set(t_tokens))
            title_lens.append(len(t_tokens))

            body = d.get("body", "")
            if body:
                self.df_body.update(set(self._body_tokens(body)))

        self.avg_title_len = (sum(title_lens) / self.N) if self.N else 1.0
        if self.avg_title_len <= 0:
            self.avg_title_len = 1.0

    # ── Tokenisers ──────────────────────────────────────────────────

    def _title_tokens(self, text: str) -> list[str]:
        return [t for t in tokenize(text) if t not in _STOPWORDS]

    def _body_tokens(self, text: str) -> list[str]:
        return [t for t in tokenize(text[:BODY_SCAN_LIMIT])
                if t not in _STOPWORDS]

    # ── IDF ─────────────────────────────────────────────────────────

    def idf(self, token: str, field: str = "title") -> float:
        table = self.df_title if field == "title" else self.df_body
        df = table.get(token, 0)
        return math.log((self.N + 1) / (df + 0.5))

    def _idf_set(self, tokens, field="title") -> float:
        return sum(self.idf(t, field) for t in set(tokens))

    # ── Core similarity signals ─────────────────────────────────────

    def _containment(self, a: list[str], b: list[str]) -> float:
        sa, sb = set(a), set(b)
        overlap = sa & sb
        if not overlap:
            return 0.0
        w_int = sum(self.idf(t) for t in overlap)
        w_a   = self._idf_set(sa)
        w_b   = self._idf_set(sb)
        denom = min(w_a, w_b)
        return (w_int / denom) if denom > 0 else 0.0

    def _dice(self, a, b, field="title") -> float:
        sa, sb = set(a), set(b)
        overlap = sa & sb
        if not overlap:
            return 0.0
        w_int = sum(self.idf(t, field) for t in overlap)
        w_a   = self._idf_set(sa, field)
        w_b   = self._idf_set(sb, field)
        denom = w_a + w_b
        return (2 * w_int / denom) if denom > 0 else 0.0

    def _jaccard(self, a: list[str], b: list[str]) -> float:
        sa, sb = set(a), set(b)
        union = sa | sb
        if not union:
            return 0.0
        w_u   = sum(self.idf(t) for t in union)
        w_int = sum(self.idf(t) for t in sa & sb)
        return (w_int / w_u) if w_u > 0 else 0.0

    def _bm25_directional(self, query_tokens, doc_tokens) -> float:
        if not query_tokens or not doc_tokens:
            return 0.0
        doc_tf  = Counter(doc_tokens)
        doc_len = len(doc_tokens)
        k1, b = self.k1, self.b
        score = 0.0
        for q in set(query_tokens):
            tf = doc_tf.get(q, 0)
            if tf == 0:
                continue
            num = tf * (k1 + 1)
            den = tf + k1 * (1 - b + b * doc_len / self.avg_title_len)
            score += self.idf(q) * num / den
        max_possible = sum(self.idf(q) for q in set(query_tokens))
        return min(1.0, score / max_possible) if max_possible > 0 else 0.0

    def _bm25_symmetric(self, a, b) -> float:
        return (self._bm25_directional(a, b)
                + self._bm25_directional(b, a)) / 2.0

    # ── Pair scoring ────────────────────────────────────────────────

    def score_pair(self, q: Query, cand: dict[str, Any]) -> PairScore:
        c_type = (cand.get("post_type") or "").lower()
        if q.post_type and c_type and q.post_type != c_type:
            return PairScore(0.0, "", {})

        a_tokens = q.title_tokens
        b_tokens = self._title_tokens(cand.get("title", ""))
        if not a_tokens or not b_tokens:
            return PairScore(0.0, "", {})

        c_title = cand.get("title", "") or ""
        signals: dict[str, float] = {
            "containment": self._containment(a_tokens, b_tokens),
            "dice":        self._dice(a_tokens, b_tokens),
            "jaccard":     self._jaccard(a_tokens, b_tokens),
            "bm25":        self._bm25_symmetric(a_tokens, b_tokens),
            "trigram":     _trigram_dice(q.title_raw, c_title),
            "fuzzy":       fuzzy_ratio(q.title_raw, c_title),
        }

        body_sig = None
        if q.body_tokens and cand.get("body"):
            c_body_tokens = self._body_tokens(cand["body"])
            if c_body_tokens:
                body_sig = self._dice(q.body_tokens, c_body_tokens, field="body")

        # ── Fusion ──────────────────────────────────────────────────
        if body_sig is not None:
            total_w = sum(WEIGHTS.values()) + BODY_WEIGHT
            score = sum(WEIGHTS[k] * signals[k] for k in WEIGHTS)
            score += BODY_WEIGHT * body_sig
            score /= total_w
        else:
            total_w = sum(WEIGHTS.values())
            score = sum(WEIGHTS[k] * signals[k] for k in WEIGHTS) / total_w

        # ── Boosts ──────────────────────────────────────────────────
        if (signals["containment"] >= BOOST_CONTAINMENT_MIN
                and signals["trigram"] >= BOOST_CONTAINMENT_TRIG):
            score = max(score, BOOST_CONTAINMENT_HIT)
        if signals["dice"] >= BOOST_DICE_MIN:
            score = max(score, BOOST_DICE_HIT)
        if signals["jaccard"] >= BOOST_JACCARD_MIN:
            score = max(score, BOOST_JACCARD_HIT)
        if body_sig is not None and body_sig >= BOOST_BODY_MIN:
            score = max(score, BOOST_BODY_HIT)

        score = round(min(1.0, score), 3)

        components = {k: round(v, 3) for k, v in signals.items()}
        if body_sig is not None:
            components["body"] = round(body_sig, 3)

        return PairScore(score=score, label=label_for(score), components=components)

    def rank(self, q: Query, min_score: float = 0.0):
        scored = []
        for c in self.corpus:
            s = self.score_pair(q, c)
            if s.score >= min_score and s.score > 0:
                scored.append((s, c))
        scored.sort(key=lambda p: p[0].score, reverse=True)
        return scored


# ── Convenience wrapper (backwards-compatible with the previous API) ────

def rank_candidates(
    query: Query,
    candidates: list[dict[str, Any]],
    min_score: float = 0.0,
):
    """Build a local engine from `candidates` and rank them against `query`."""
    if not candidates:
        return []
    engine = SimilarityEngine(candidates)
    return engine.rank(query, min_score)


def score_pair(query: Query, cand: dict[str, Any]) -> PairScore:
    """Convenience for a single pair — deprecated for batch use.

    IDF here is computed over a 2-item corpus, so it is *coarse*.
    Use `SimilarityEngine` directly when scoring many pairs.
    """
    engine = SimilarityEngine([cand])
    return engine.score_pair(query, cand)


# ── Self-test ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    corpus = [
        {"post_type": "question", "title": "Reset my password", "body": "", "tags": []},
        {"post_type": "question", "title": "Reset my username", "body": "", "tags": []},
        {"post_type": "question", "title": "How do I reset my account's password?", "body": "", "tags": []},
        {"post_type": "question", "title": "How to install npm", "body": "", "tags": []},
        {"post_type": "question", "title": "How to install pip", "body": "", "tags": []},
        {"post_type": "question", "title": "React re-render twice StrictMode", "body": "", "tags": []},
    ]
    engine = SimilarityEngine(corpus)

    cases = [
        ("How do I reset my account's password?", "Reset my password",          "duplicate"),
        ("Reset my password",                     "Reset my password",          "duplicate"),
        ("Reset my password",                     "Reset my username",          "similar"),
        ("How to install npm",                    "How to install pip",         "similar"),
        ("How do I reset my account's password?", "How to install npm",         None),
    ]
    for a, b, expect in cases:
        q = build_query(a, "", [], "question")
        cand = {"title": b, "body": "", "tags": [], "post_type": "question"}
        r = engine.score_pair(q, cand)
        ok = "✓" if (r.label == expect or (expect is None and not r.label)) else "✗"
        print(f"{ok}  {a[:38]:<38}  ↔  {b[:26]:<26}  →  {r.score:.2f} ({r.label or '—'})")