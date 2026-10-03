export interface LibraryItem {
  id: string;
  kind: 'image' | 'video';
  source: string;
  project?: string;
  characters: string[];
  scene?: number;
  shot?: number;
  provider?: string;
  model?: string;
  prompt?: string;
  favorite: boolean;
  tags: string[];
  albumIds: string[];
  createdAt: number;
  bytes: number;
}

export interface LibraryQuery {
  text?: string;
  project?: string;
  character?: string;
  scene?: number;
  provider?: string;
  kind?: 'image' | 'video';
  favoritesOnly?: boolean;
  tag?: string;
  albumId?: string;
}

/** Newest first. Text matches prompt, tags, project, character names and model, case-insensitively, all words required. */
export function filterLibrary(items: LibraryItem[], q: LibraryQuery): LibraryItem[] {
  const words = (q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((i) => {
      if (q.project && i.project !== q.project) return false;
      if (q.character && !i.characters.includes(q.character)) return false;
      if (q.scene !== undefined && i.scene !== q.scene) return false;
      if (q.provider && i.provider !== q.provider) return false;
      if (q.kind && i.kind !== q.kind) return false;
      if (q.favoritesOnly && !i.favorite) return false;
      if (q.tag && !i.tags.includes(q.tag)) return false;
      if (q.albumId && !i.albumIds.includes(q.albumId)) return false;
      if (!words.length) return true;
      const hay = [i.prompt, i.project, i.model, i.source, ...i.tags, ...i.characters].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function facets(items: LibraryItem[]) {
  const uniq = <T,>(xs: Array<T | undefined>) => [...new Set(xs.filter((x): x is T => x !== undefined && x !== ''))].sort();
  return {
    projects: uniq(items.map((i) => i.project)), characters: uniq(items.flatMap((i) => i.characters)),
    scenes: uniq(items.map((i) => i.scene)), providers: uniq(items.map((i) => i.provider)), tags: uniq(items.flatMap((i) => i.tags)),
  };
}

/** Which items to delete to free space: not favourites, not in any album, oldest first, until `bytesToFree` is reached. */
export function cleanupCandidates(items: LibraryItem[], bytesToFree: number): LibraryItem[] {
  const out: LibraryItem[] = [];
  let freed = 0;
  for (const i of [...items].sort((a, b) => a.createdAt - b.createdAt)) {
    if (freed >= bytesToFree) break;
    if (i.favorite || i.albumIds.length) continue;
    out.push(i);
    freed += i.bytes;
  }
  return out;
}
