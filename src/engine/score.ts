import { SIGNALS, countWords, normalizeText, type SignalId } from './signals';

export type PostScore = {
  /** Entier de 0 a 100. */
  score: number;
  /** Ids des signaux declenches, tries par poids decroissant. */
  reasons: SignalId[];
};

const MAX_SCORE = 100;
const SHORT_POST_WORDS = 30;
const SHORT_POST_FACTOR = 0.5;

export function scorePost(text: string): PostScore {
  const normalized = normalizeText(text);
  const triggered: { id: SignalId; weight: number }[] = [];
  let points = 0;

  for (const signal of SIGNALS) {
    const occurrences = signal.detect(normalized);
    if (occurrences <= 0) continue;
    points += signal.weight * occurrences;
    triggered.push({ id: signal.id, weight: signal.weight });
  }

  let score = Math.min(points, MAX_SCORE);
  // Trop court pour juger: on garde le signal mais on divise la confiance.
  if (countWords(normalized) < SHORT_POST_WORDS) score *= SHORT_POST_FACTOR;

  return {
    score: Math.round(score),
    reasons: triggered.sort((a, b) => b.weight - a.weight).map((s) => s.id),
  };
}
