/**
 * Heuristiques de detection du slop. Chaque signal est autonome et pur.
 *
 * Les ids sont un contrat public: ils sortent dans `reasons` et pourraient finir
 * dans les reglages. Ne jamais les renommer.
 *
 * `detect` recoit du texte deja passe par `normalizeText` et retourne un nombre
 * d'occurrences retenues, pas des points. Les points valent `weight * detect()`.
 * Pour les signaux a occurrences multiples, `detect` plafonne lui-meme le compte
 * de sorte que `weight * max` corresponde au plafond du spec.
 */

export type SignalId =
  | 'hookOpener'
  | 'letThatSinkIn'
  | 'notXButY'
  | 'oneWordDrama'
  | 'emojiBullets'
  | 'emojiHeaders'
  | 'shortParagraphStorm'
  | 'emDashDensity'
  | 'hashtagSpam'
  | 'buzzwords'
  | 'engagementBait'
  | 'ruleOfThree';

export type Signal = {
  readonly id: SignalId;
  /** Libelle affiche dans le placeholder. */
  readonly label: string;
  /** Points par occurrence. */
  readonly weight: number;
  detect(text: string): number;
};

// --- Normalisation ---------------------------------------------------------

/**
 * LinkedIn sert des apostrophes typographiques, des espaces insecables et des
 * emoji suivis d'un selecteur de variante. Les motifs ci-dessous sont ecrits en
 * ASCII simple: on ramene le texte a cette forme une seule fois.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[   ]/g, ' ')
    .replace(/️/g, '');
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

// --- Utilitaires internes -------------------------------------------------

function paragraphs(text: string): string[] {
  return text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Plafonne un compte d'occurrences: `weight * max` = plafond du spec. */
function cappedAt(count: number, max: number): number {
  return Math.min(count, max);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// --- Motifs ---------------------------------------------------------------

const HOOK_OPENER =
  /^(unpopular opinion|hot take|stop scrolling|big news|personal news|i'?m (humbled|thrilled|excited|proud)|je suis (fier|fiere|fière|ravie?|honoree?|honoré|honorée))/i;

const SINK_IN =
  /let that sink in|read that again|relis(ez)? [çc]a|relisez cette phrase|laisse [çc]a infuser/i;

const NOT_X_BUT_Y_EN = /it'?s not (about )?[^.!?\n]{2,80}[.!?]\s*it'?s/gi;
const NOT_X_BUT_Y_FR = /ce n'?est pas [^.!?\n]{2,80}[.!?]\s*c'?est/gi;

/** Un paragraphe reduit a un seul mot suivi d'un point ou d'un point d'exclamation. */
const ONE_WORD_PARAGRAPH = /^[\p{L}\p{N}'-]+[.!]$/u;

/** Liste fermee du spec. Le selecteur de variante a deja ete retire. */
const BULLET_EMOJI = ['🚀', '✨', '💡', '🔥', '✅', '👉', '📈', '💪', '🎯', '⚡', '♻', '🔑'];

const STARTS_WITH_EMOJI = /^\p{Extended_Pictographic}/u;

const EM_DASHES = /[—–]/g;

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

const BUZZWORDS =
  /\bdelve\b|\bgame[- ]?changer\b|\bleverage\b|\bunlock\b|\belevate\b|\bseamless\b|\bsuperpowers?\b|in today'?s fast-paced|the future of|r[eé]volutionner|[àa] l'[eè]re de|incontournable|changer la donne/gi;

const ENGAGEMENT_BAIT =
  /agree\?|thoughts\?|comment below|repost if|♻|follow me for|qu'en pensez-vous|partagez si|suivez-moi pour|👇/gi;

const RULE_OF_THREE = /[\p{L}\p{N}]+, [\p{L}\p{N}]+,? (and|et) [\p{L}\p{N}]+[.!]/giu;

// --- Signaux --------------------------------------------------------------

export const SIGNALS: readonly Signal[] = [
  {
    id: 'hookOpener',
    label: 'accroche dramatique',
    weight: 18,
    detect: (text) => (HOOK_OPENER.test(lines(text)[0] ?? '') ? 1 : 0),
  },
  {
    id: 'letThatSinkIn',
    label: 'laisse ça infuser',
    weight: 20,
    detect: (text) => (SINK_IN.test(text) ? 1 : 0),
  },
  {
    id: 'notXButY',
    label: 'faux contraste',
    weight: 12, // plafond 24
    detect: (text) =>
      cappedAt(countMatches(text, NOT_X_BUT_Y_EN) + countMatches(text, NOT_X_BUT_Y_FR), 2),
  },
  {
    id: 'oneWordDrama',
    label: 'paragraphe d’un mot',
    weight: 10,
    detect: (text) => (paragraphs(text).some((p) => ONE_WORD_PARAGRAPH.test(p)) ? 1 : 0),
  },
  {
    id: 'emojiBullets',
    label: 'liste à emojis',
    weight: 15,
    detect: (text) => {
      const bullets = lines(text).filter((l) => BULLET_EMOJI.some((e) => l.startsWith(e)));
      return bullets.length >= 3 ? 1 : 0;
    },
  },
  {
    id: 'emojiHeaders',
    label: 'titres à emojis',
    weight: 10,
    detect: (text) =>
      lines(text).some((l) => l.length < 40 && STARTS_WITH_EMOJI.test(l) && l.endsWith(':'))
        ? 1
        : 0,
  },
  {
    id: 'shortParagraphStorm',
    label: 'paragraphes hachés',
    weight: 15,
    detect: (text) => {
      const blocks = paragraphs(text);
      if (blocks.length < 6) return 0;
      return median(blocks.map((p) => p.length)) < 60 ? 1 : 0;
    },
  },
  {
    id: 'emDashDensity',
    label: 'tirets cadratins',
    weight: 10,
    detect: (text) => {
      const words = countWords(text);
      if (words === 0) return 0;
      return (countMatches(text, EM_DASHES) / words) * 100 > 1.5 ? 1 : 0;
    },
  },
  {
    id: 'hashtagSpam',
    label: 'hashtags',
    weight: 8,
    detect: (text) => (countMatches(text, HASHTAG) >= 5 ? 1 : 0),
  },
  {
    id: 'buzzwords',
    label: 'jargon',
    weight: 3, // plafond 15
    detect: (text) => cappedAt(countMatches(text, BUZZWORDS), 5),
  },
  {
    id: 'engagementBait',
    label: 'appât à engagement',
    weight: 12, // plafond 24
    detect: (text) => cappedAt(countMatches(text, ENGAGEMENT_BAIT), 2),
  },
  {
    id: 'ruleOfThree',
    label: 'triade',
    weight: 6,
    detect: (text) => (countMatches(text, RULE_OF_THREE) > 0 ? 1 : 0),
  },
];
