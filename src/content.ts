import { scorePost } from './engine/score';
import { SIGNALS, type SignalId } from './engine/signals';
import { SELECTORS } from './selectors';
import { DEFAULT_SETTINGS, readSettings, type Settings } from './storage';

const HIDDEN_ATTR = 'data-slop-hidden';
const PLACEHOLDER_CLASS = 'slop-placeholder';
const DEBOUNCE_MS = 150;
const MAX_REASONS = 3;

function debug(...args: unknown[]): void {
  console.debug('[slop-filter]', ...args);
}

type ProcessedPost = {
  /** Dernier data-id vu sur ce node. Sert a detecter le recyclage. */
  dataId: string;
  score: number;
  reasons: SignalId[];
  /** L'utilisateur a clique « Afficher »: ne plus remasquer. */
  forced: boolean;
};

const processed = new WeakMap<Element, ProcessedPost>();
let settings: Settings = DEFAULT_SETTINGS;
let hiddenCount = 0;

// --- Lecture du fil --------------------------------------------------------

function postId(post: HTMLElement): string {
  return post.closest('[data-id]')?.getAttribute('data-id') ?? '';
}

function extractText(post: HTMLElement): string | null {
  const container = post.querySelector<HTMLElement>(SELECTORS.postText);
  if (container === null) return null;

  // innerText et pas textContent: les signaux dependent des sauts de ligne et
  // des paragraphes, que textContent aplatit. Le texte tronque par « voir plus »
  // est score tel quel, sans le deplier.
  const text = container.innerText.trim();
  return text.length === 0 ? null : text;
}

/**
 * Les deux selecteurs de `SELECTORS.post` peuvent matcher deux nodes imbriques
 * du meme post. On ne garde que le plus haut, sinon on masque deux fois le meme
 * contenu et le placeholder interne se retrouve dans un sous-arbre cache.
 */
function collectPosts(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.post));
  const candidates = new Set<HTMLElement>(all);

  return all.filter((post) => {
    for (let parent = post.parentElement; parent !== null; parent = parent.parentElement) {
      if (candidates.has(parent)) return false;
      if (parent.hasAttribute(HIDDEN_ATTR)) return false;
    }
    return true;
  });
}

// --- Masquage --------------------------------------------------------------

function labelOf(id: SignalId): string {
  return SIGNALS.find((signal) => signal.id === id)?.label ?? id;
}

function describe(score: number, reasons: SignalId[]): string {
  const labels = reasons.slice(0, MAX_REASONS).map(labelOf).join(', ');
  return labels.length === 0 ? `Masqué · score ${score}` : `Masqué · score ${score} · ${labels}`;
}

function buildPlaceholder(post: HTMLElement, score: number, reasons: SignalId[]): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = PLACEHOLDER_CLASS;

  const summary = document.createElement('span');
  summary.className = 'slop-placeholder__summary';
  summary.textContent = describe(score, reasons);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'slop-placeholder__show';
  button.textContent = 'Afficher';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation(); // sinon LinkedIn ouvre la publication
    const entry = processed.get(post);
    if (entry !== undefined) entry.forced = true;
    reveal(post);
    debug('affiché à la demande', { score });
  });

  placeholder.append(summary, button);
  return placeholder;
}

function hide(post: HTMLElement, score: number, reasons: SignalId[]): void {
  if (post.hasAttribute(HIDDEN_ATTR)) return;

  post.insertBefore(buildPlaceholder(post, score, reasons), post.firstChild);
  post.setAttribute(HIDDEN_ATTR, '');
  hiddenCount += 1;
  debug('masqué', { score, raisons: reasons, total: hiddenCount });
}

/** Retire le masquage. Ne touche que ce que l'extension a ajoute. */
function reveal(post: HTMLElement): void {
  post.removeAttribute(HIDDEN_ATTR);
  post.querySelector(`:scope > .${PLACEHOLDER_CLASS}`)?.remove();
}

// --- Pipeline --------------------------------------------------------------

function processPost(post: HTMLElement): void {
  const dataId = postId(post);
  const previous = processed.get(post);

  // Deja traite, et c'est toujours la meme publication: rien a faire.
  if (previous !== undefined && previous.dataId === dataId) return;

  if (previous !== undefined) {
    // Node recycle par LinkedIn. On demasque avant de rescorer: sinon innerText
    // lit un sous-arbre en display:none et rend le texte sans mise en forme.
    reveal(post);
    debug('node recyclé', { avant: previous.dataId, après: dataId });
  }

  const text = extractText(post);
  // Publication sans texte (image, video, texte pas encore rendu): on ignore et
  // on ne memorise rien, pour reessayer au prochain lot.
  if (text === null) return;

  const { score, reasons } = scorePost(text);
  processed.set(post, { dataId, score, reasons, forced: false });

  if (settings.enabled && score >= settings.threshold) hide(post, score, reasons);
}

function processBatch(): void {
  for (const post of collectPosts()) {
    try {
      processPost(post);
    } catch (error) {
      debug('publication ignorée', error);
    }
  }
}

// --- Observation -----------------------------------------------------------

let pending: number | undefined;

/**
 * Fenetre de 150ms: le premier mutation la demarre, les suivantes s'y agregent.
 * On ne reinitialise pas le minuteur a chaque mutation, sinon le fil, qui mute
 * en continu, repousserait le traitement indefiniment.
 */
function schedule(): void {
  if (pending !== undefined) return;
  pending = window.setTimeout(() => {
    pending = undefined;
    processBatch();
  }, DEBOUNCE_MS);
}

async function main(): Promise<void> {
  settings = await readSettings();
  debug('réglages', settings);

  processBatch();

  // childList seulement: nos propres setAttribute ne relancent donc pas
  // l'observer. L'insertion du placeholder declenche un lot a vide, qui
  // converge tout de suite.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
}

debug('loaded');
void main();
