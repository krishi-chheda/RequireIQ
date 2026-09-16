import { tokenize } from "./text";

/**
 * Lexical semantic similarity over the project corpus.
 *
 * TF-IDF with cosine distance, computed over the project's own statements. It
 * is chosen over a hosted embedding model deliberately: it needs no network
 * call, it is identical on every run, and - most importantly for this product -
 * the terms that produced a score can be shown to the reviewer. A reviewer who
 * cannot see why two requirements were linked will not trust the link.
 *
 * The practical ceiling is that it matches vocabulary, not meaning: two
 * requirements that say the same thing in different words score low. The
 * conflict detectors compensate by combining this signal with quantity and
 * polarity analysis rather than relying on it alone.
 */

export interface SimilarityIndex {
  /** Document id to term-frequency vector, L2-normalised and IDF-weighted. */
  vectors: Map<string, Map<string, number>>;
  idf: Map<string, number>;
}

export function buildSimilarityIndex(documents: Array<{ id: string; text: string }>): SimilarityIndex {
  const termDocFrequency = new Map<string, number>();
  const tokenised = documents.map((doc) => {
    const tokens = tokenize(doc.text);
    for (const term of new Set(tokens)) {
      termDocFrequency.set(term, (termDocFrequency.get(term) ?? 0) + 1);
    }
    return { id: doc.id, tokens };
  });

  const total = Math.max(1, documents.length);
  const idf = new Map<string, number>();
  for (const [term, count] of termDocFrequency) {
    // Smoothed IDF: never zero, so a term present everywhere still contributes
    // a little rather than silently vanishing from every vector.
    idf.set(term, Math.log((total + 1) / (count + 1)) + 1);
  }

  const vectors = new Map<string, Map<string, number>>();
  for (const doc of tokenised) {
    const counts = new Map<string, number>();
    for (const token of doc.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

    const weighted = new Map<string, number>();
    for (const [term, count] of counts) {
      weighted.set(term, (count / doc.tokens.length) * (idf.get(term) ?? 1));
    }
    const norm = Math.sqrt([...weighted.values()].reduce((sum, v) => sum + v * v, 0)) || 1;
    for (const [term, value] of weighted) weighted.set(term, value / norm);

    vectors.set(doc.id, weighted);
  }

  return { vectors, idf };
}

export interface SimilarityResult {
  score: number;
  /** The terms contributing most to the score, highest first. */
  sharedTerms: string[];
}

/** Cosine similarity between two indexed statements, with the terms that drove it. */
export function similarity(index: SimilarityIndex, leftId: string, rightId: string): SimilarityResult {
  const left = index.vectors.get(leftId);
  const right = index.vectors.get(rightId);
  if (!left || !right) return { score: 0, sharedTerms: [] };

  // Iterate the smaller vector: the cost is proportional to the shorter
  // statement rather than the vocabulary.
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  const contributions: Array<[string, number]> = [];
  let score = 0;
  for (const [term, value] of small) {
    const other = large.get(term);
    if (other === undefined) continue;
    const product = value * other;
    score += product;
    contributions.push([term, product]);
  }

  contributions.sort((a, b) => b[1] - a[1]);
  return {
    score: Number(score.toFixed(4)),
    sharedTerms: contributions.slice(0, 6).map(([term]) => term),
  };
}

/** All pairs scoring at or above `threshold`, highest first. */
export function topPairs(
  index: SimilarityIndex,
  ids: string[],
  threshold: number,
): Array<{ leftId: string; rightId: string; score: number; sharedTerms: string[] }> {
  const pairs: Array<{ leftId: string; rightId: string; score: number; sharedTerms: string[] }> = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const left = ids[i];
      const right = ids[j];
      if (!left || !right) continue;
      const result = similarity(index, left, right);
      if (result.score >= threshold) {
        pairs.push({ leftId: left, rightId: right, ...result });
      }
    }
  }
  // ponytail: O(n^2) over the register. Fine to a few thousand requirements;
  // swap in an inverted-index candidate filter if a project ever exceeds that.
  return pairs.sort((a, b) => b.score - a.score);
}
