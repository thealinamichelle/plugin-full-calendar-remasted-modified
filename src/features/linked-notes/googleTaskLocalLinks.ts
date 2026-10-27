/**
 * Obsidian-only note associations for Google Tasks. These references are stored
 * in Full Calendar's data.json, never in Google's Task notes or event cache.
 */
import { App, TFile } from 'obsidian';
import { PluginState } from '../../core/PluginState';

function taskKey(calendarId: string, taskUid: string): string {
  return `${calendarId}::${taskUid}`;
}

function linkPath(value: string): string {
  const trimmed = value.trim();
  const inner = trimmed.startsWith('[[') && trimmed.endsWith(']]')
    ? trimmed.slice(2, -2)
    : trimmed;
  return inner.split('|', 1)[0].split('#', 1)[0].trim();
}

export function getGoogleTaskLocalNoteLink(calendarId: string, taskUid: string): string {
  const path = PluginState.getSettings().googleTaskLocalNoteLinks?.[taskKey(calendarId, taskUid)];
  return path ? `[[${path.replace(/\.md$/i, '')}]]` : '';
}

export function resolveGoogleTaskLocalNote(
  app: App,
  calendarId: string,
  taskUid: string
): TFile | null {
  const path = PluginState.getSettings().googleTaskLocalNoteLinks?.[taskKey(calendarId, taskUid)];
  if (!path) return null;
  return app.vault.getFileByPath(path) ?? null;
}

/** Resolve the wiki link once, then save its full vault path to avoid ambiguous filenames. */
export async function saveGoogleTaskLocalNoteLink(
  app: App,
  calendarId: string,
  taskUid: string,
  value: string
): Promise<void> {
  const path = linkPath(value);
  let file: TFile | null = null;
  if (path) {
    file =
      app.metadataCache.getFirstLinkpathDest(path, '') ??
      app.vault.getFileByPath(path) ??
      app.vault.getFileByPath(path.endsWith('.md') ? path : `${path}.md`);
    if (!file) throw new Error(`Obsidian note not found: ${path}`);
  }

  const settings = PluginState.getSettings();
  const links = { ...(settings.googleTaskLocalNoteLinks ?? {}) };
  const key = taskKey(calendarId, taskUid);
  if (file) links[key] = file.path;
  else delete links[key];
  settings.googleTaskLocalNoteLinks = links;
  await PluginState.persistData();
}

/** A vault move/rename updates only local note paths, never events or Google Tasks. */
export async function updateGoogleTaskLocalLinksAfterRename(
  oldPath: string,
  newPath: string
): Promise<void> {
  const settings = PluginState.getSettings();
  const links = settings.googleTaskLocalNoteLinks;
  if (!links) return;
  let changed = false;
  for (const [key, path] of Object.entries(links)) {
    if (path === oldPath || path.startsWith(`${oldPath}/`)) {
      links[key] = `${newPath}${path.slice(oldPath.length)}`;
      changed = true;
    }
  }
  if (changed) await PluginState.persistData();
}
