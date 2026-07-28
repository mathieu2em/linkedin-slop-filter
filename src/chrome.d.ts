/**
 * Declarations minimales des APIs Chrome utilisees.
 *
 * Le spec fige les devDependencies a typescript, esbuild et vitest: pas de
 * @types/chrome. On declare donc a la main, et seulement ce que le code appelle.
 */
declare namespace chrome.storage {
  interface StorageArea {
    get(keys: string[] | string | null): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  }

  const sync: StorageArea;
}
