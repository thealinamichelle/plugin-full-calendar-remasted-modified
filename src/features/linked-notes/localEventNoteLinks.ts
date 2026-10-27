/** Local-only Obsidian note references. Never put these values in provider event payloads. */
import { App, TFile, TFolder } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { t } from '../i18n/i18n';
import type { OFCEvent } from '../../types';

export function eventNoteKey(calendarId: string, event: OFCEvent, sessionId: string): string {
  // A provider UID survives refreshes. Session IDs are only a fallback for local providers.
  const identifier = (event.uid || event.id || sessionId).trim();
  return JSON.stringify([calendarId, identifier]);
}

/** Existing Google Task local links from the previous editor are accepted, too. */
function legacyGoogleTaskKey(key: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return `${parsed[0]}::${parsed[1]}`;
    }
  } catch {
    // Local keys are normally JSON tuples; ignore a non-JSON key.
  }
  return undefined;
}

export function getLocalEventNotePath(key: string): string | undefined {
  const settings = PluginState.getSettings();
  const current = settings.localEventNoteLinks?.[key];
  if (current) return current;
  const oldKey = legacyGoogleTaskKey(key);
  return oldKey ? settings.googleTaskLocalNoteLinks?.[oldKey] : undefined;
}

export function resolveLocalEventNote(app: App, key: string): TFile | null {
  const path = getLocalEventNotePath(key);
  if (!path) return null;
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
}

export function displayNoteLink(path?: string): string {
  return path ? `[[${path.replace(/\.md$/i, '')}]]` : '';
}

/** Accept a complete wiki link, or a Markdown filename/path without brackets. */
export function resolveNoteInput(app: App, input: string): TFile | null {
  const raw = input.trim();
  if (!raw) return null;
  const target = raw.startsWith('[[') && raw.endsWith(']]') ? raw.slice(2, -2) : raw;
  const linkpath = target.split('|', 1)[0].split('#', 1)[0].trim();
  if (!linkpath) return null;
  const path = linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`;
  const exact = app.vault.getAbstractFileByPath(path);
  if (exact instanceof TFile) return exact;
  return app.metadataCache.getFirstLinkpathDest(linkpath, '') ?? null;
}

export async function saveLocalEventNote(app: App, key: string, input: string): Promise<void> {
  const current = PluginState.getSettings().localEventNoteLinks ?? {};
  const next = { ...current };
  if (!input.trim()) {
    delete next[key];
  } else {
    const file = resolveNoteInput(app, input);
    if (!file) throw new Error(t('modals.editEvent.localNote.errorNotFound'));
    next[key] = file.path;
  }
  // Migrate/remove an older Google Task-only link so clearing the field stays cleared.
  const settings = PluginState.getSettings();
  const oldKey = legacyGoogleTaskKey(key);
  if (oldKey && settings.googleTaskLocalNoteLinks?.[oldKey]) {
    const oldLinks = { ...settings.googleTaskLocalNoteLinks };
    delete oldLinks[oldKey];
    settings.googleTaskLocalNoteLinks = oldLinks;
  }
  // No writes to EventCache or to any calendar provider.
  settings.localEventNoteLinks = next;
  await PluginState.persistData();
}

/** Obsidian emits a rename event for both file moves and folder moves. */
export async function updateLocalEventNotePathsOnRename(
  file: TFile | TFolder,
  oldPath: string
): Promise<void> {
  const settings = PluginState.getSettings();
  const existing = settings.localEventNoteLinks;
  if (!existing) return;
  const next: Record<string, string> = { ...existing };
  let changed = false;
  for (const [key, path] of Object.entries(existing)) {
    const updated =
      file instanceof TFile
        ? path === oldPath
          ? file.path
          : path
        : path.startsWith(`${oldPath}/`)
          ? `${file.path}${path.slice(oldPath.length)}`
          : path;
    if (updated !== path) {
      next[key] = updated;
      changed = true;
    }
  }
  if (changed) {
    settings.localEventNoteLinks = next;
    await PluginState.persistData();
  }
}
