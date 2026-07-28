import { describe, expect, it } from 'vitest';
import { scorePost } from '../src/engine/score';
import { SIGNALS, type SignalId } from '../src/engine/signals';

// Fixtures du spec section 6, reprises textuellement.

const SLOP_EN_MOTIVATION = `
I got rejected 47 times.

Let that sink in.

Most people would quit.

I didn't.

Here's what 47 rejections taught me about resilience:

🚀 Growth isn't linear
✨ Every no is a redirection
💡 Your network is your net worth

It's not about failure. It's about feedback.

Agree? ♻️ Repost if this resonates.

#motivation #growth #mindset #hustle #leadership
`;

const SLOP_FR_PARCOURS = `
On m'a dit que c'était impossible.

Relis ça.

En 2020, je n'avais rien. Aujourd'hui, une équipe de 12.

Voici ce que j'ai appris :

🔥 La constance bat le talent
🎯 Le réseau, c'est tout
💪 Échouer, c'est apprendre

Ce n'est pas une question de chance. C'est une question de discipline.

Qu'en pensez-vous ? 👇

#entrepreneuriat #mindset #succès #croissance #leadership
`;

const SLOP_EN_HUMBLEBRAG = `I'm humbled and thrilled to announce that I've been named to this year's 30 Under 30 list. This journey taught me three things: grit, gratitude, and growth. In today's fast-paced world, staying grounded is a game-changer. Thank you to everyone who believed in me along the way. #blessed #30under30 #grateful #journey #growth`;

const LEGIT_EN_TECHNIQUE = `We migrated our API gateway from Express to Fastify last sprint and p99 latency went from 180ms to 95ms. Most of the gain came from schema-based serialization rather than the router itself. Happy to share the benchmark setup if anyone wants to reproduce it.`;

const LEGIT_FR_RECRUTEMENT = `On cherche un dev backend senior pour notre équipe de Québec. Stack Node, TypeScript et Postgres, poste hybride avec deux jours au bureau. Écris-moi en privé si tu veux en savoir plus sur l'équipe ou le produit.`;

const LEGIT_FR_OPINION = `J'ai lu le rapport de la BDC sur l'adoption de l'IA dans les PME québécoises. Le chiffre qui m'a surpris: seulement 12% des entreprises de moins de 50 employés s'en servent régulièrement. L'écart avec les grandes entreprises se creuse d'année en année. Je me demande si le frein principal est le coût ou la formation.`;

describe('scorePost, fixtures du spec', () => {
  it('slop-en-motivation: score >= 65', () => {
    expect(scorePost(SLOP_EN_MOTIVATION).score).toBeGreaterThanOrEqual(65);
  });

  it('slop-fr-parcours: score >= 65', () => {
    expect(scorePost(SLOP_FR_PARCOURS).score).toBeGreaterThanOrEqual(65);
  });

  it('slop-en-humblebrag: 30 <= score < 50, reste visible au seuil par defaut', () => {
    const { score } = scorePost(SLOP_EN_HUMBLEBRAG);
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThan(50);
  });

  it('legit-en-technique: score <= 20', () => {
    expect(scorePost(LEGIT_EN_TECHNIQUE).score).toBeLessThanOrEqual(20);
  });

  it('legit-fr-recrutement: score <= 20', () => {
    expect(scorePost(LEGIT_FR_RECRUTEMENT).score).toBeLessThanOrEqual(20);
  });

  it('legit-fr-opinion: score <= 20', () => {
    expect(scorePost(LEGIT_FR_OPINION).score).toBeLessThanOrEqual(20);
  });
});

describe('signaux, un texte minimal par signal', () => {
  // Record exhaustif: oublier un signal casse le typecheck.
  const MINIMAL: Record<SignalId, string> = {
    hookOpener: 'Hot take: personne ne lit les posts LinkedIn.',
    letThatSinkIn: 'Let that sink in.',
    notXButY: "It's not about luck. It's about reps.",
    oneWordDrama: 'Wrong.',
    emojiBullets: '🚀 un\n✨ deux\n💡 trois',
    emojiHeaders: '💡 Trois leçons :',
    shortParagraphStorm: 'Il pleut.\n\nIl vente.\n\nIl neige.\n\nIl gèle.\n\nIl mouille.\n\nIl fond.',
    emDashDensity: 'Un texte — court.',
    hashtagSpam: '#un #deux #trois #quatre #cinq',
    buzzwords: 'Un vrai game-changer.',
    engagementBait: 'Agree?',
    ruleOfThree: 'Grit, gratitude, and growth.',
  };

  for (const signal of SIGNALS) {
    it(`${signal.id} se declenche`, () => {
      expect(scorePost(MINIMAL[signal.id]).reasons).toContain(signal.id);
    });
  }

  it('un texte neutre ne declenche aucun signal', () => {
    const neutre =
      'On a migré le service vers Fastify hier soir et la latence a baissé de moitié. Le benchmark est dans le repo si tu veux le refaire.';
    expect(scorePost(neutre).reasons).toEqual([]);
    expect(scorePost(neutre).score).toBe(0);
  });
});

describe('regles de calcul', () => {
  it('plafonne le score a 100', () => {
    const surcharge = `${SLOP_EN_MOTIVATION}\n\nUnlock the future of seamless leverage to elevate everything.`;
    expect(scorePost(surcharge).score).toBe(100);
  });

  it('divise par deux sous 30 mots', () => {
    // letThatSinkIn seul vaut 20 points, sur 4 mots.
    expect(scorePost('Let that sink in.').score).toBe(10);
  });

  it('ne divise pas a partir de 30 mots', () => {
    const trente = `Let that sink in. ${'mot '.repeat(26)}`;
    expect(scorePost(trente).score).toBe(20);
  });

  it('trie les raisons par poids decroissant', () => {
    const { reasons } = scorePost(SLOP_EN_MOTIVATION);
    const weights = reasons.map((id) => SIGNALS.find((s) => s.id === id)?.weight ?? 0);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it('texte vide: score 0, aucune raison', () => {
    expect(scorePost('')).toEqual({ score: 0, reasons: [] });
  });
});
