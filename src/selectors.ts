/**
 * TOUS les selecteurs DOM LinkedIn, centralises ici.
 *
 * Ils datent de mi-2026 et sont perissables par nature. Quand le fil casse,
 * c'est ce fichier qu'on corrige, et rien d'autre.
 */
export const SELECTORS = {
  post: 'div[data-id^="urn:li:activity"], div.feed-shared-update-v2',
  postText: '.update-components-text, .feed-shared-inline-show-more-text',
  authorName: '.update-components-actor__title', // phase 4 seulement
} as const;
