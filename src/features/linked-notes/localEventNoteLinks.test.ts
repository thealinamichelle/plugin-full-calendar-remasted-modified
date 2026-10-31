import { App, TFile, TFolder } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';
import {
  displayNoteLink,
  eventNoteKey,
  getLocalEventNotePath,
  resolveLocalEventNote,
  saveLocalEventNote,
  updateLocalEventNotePathsOnRename
} from './localEventNoteLinks';

jest.mock('../../core/PluginState', () => ({
  PluginState: {
    getSettings: jest.fn(),
    persistData: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('local event note links', () => {
  const settings = {
    localEventNoteLinks: {} as Record<string, string>,
    googleTaskLocalNoteLinks: {} as Record<string, string>
  };
  const folder = new TFolder();
  folder.name = 'DBT';
  const file = new TFile();
  file.name = 'Essay.md';
  file.parent = folder;
  const vault = {
    getAbstractFileByPath: jest.fn((path: string) => (path === file.path ? file : null))
  };
  const app = {
    vault,
    metadataCache: {
      getFirstLinkpathDest: jest.fn((linkpath: string) =>
        linkpath === 'Essay' || linkpath === 'DBT/Essay' ? file : null
      )
    }
  } as unknown as App;
  const event = { type: 'single', uid: 'google-task-id' } as OFCEvent;
  const key = eventNoteKey('school-list', event, 'transient-session-id');

  beforeEach(() => {
    folder.name = 'DBT';
    file.name = 'Essay.md';
    settings.localEventNoteLinks = {};
    settings.googleTaskLocalNoteLinks = {};
    (PluginState.getSettings as jest.Mock).mockReturnValue(settings);
    (PluginState.persistData as jest.Mock).mockClear();
  });

  it('uses provider identity, not the session ID or a note path', () => {
    expect(eventNoteKey('school-list', event, 'new-session')).toBe(key);
    expect(eventNoteKey('other-list', event, 'new-session')).not.toBe(key);
  });

  it('saves a wiki link only in plugin settings and resolves it from any folder', async () => {
    await saveLocalEventNote(app, key, '[[DBT/Essay]]');
    expect(getLocalEventNotePath(key)).toBe('DBT/Essay.md');
    expect(resolveLocalEventNote(app, key)).toBe(file);
    expect(displayNoteLink(getLocalEventNotePath(key))).toBe('[[DBT/Essay]]');
    expect((PluginState.persistData as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('updates the saved path when a note moves or is renamed', async () => {
    await saveLocalEventNote(app, key, '[[DBT/Essay]]');
    const oldPath = file.path;
    folder.name = 'Couples';
    file.name = 'Paper.md';
    await updateLocalEventNotePathsOnRename(file, oldPath);
    expect(getLocalEventNotePath(key)).toBe('Couples/Paper.md');
    expect(resolveLocalEventNote(app, key)).toBe(file);
  });

  it('updates links when an entire class folder moves', async () => {
    await saveLocalEventNote(app, key, '[[DBT/Essay]]');
    folder.name = 'School';
    await updateLocalEventNotePathsOnRename(folder, 'DBT');
    expect(getLocalEventNotePath(key)).toBe('School/Essay.md');
  });

  it('preserves previously saved Google Task-only links until edited in the normal form', async () => {
    settings.googleTaskLocalNoteLinks['school-list::google-task-id'] = 'DBT/Essay.md';
    expect(getLocalEventNotePath(key)).toBe('DBT/Essay.md');
    expect(resolveLocalEventNote(app, key)).toBe(file);

    await saveLocalEventNote(app, key, '');
    expect(getLocalEventNotePath(key)).toBeUndefined();
    expect(settings.googleTaskLocalNoteLinks).toEqual({});
  });

  it('clears an association without modifying the note or event', async () => {
    await saveLocalEventNote(app, key, '[[DBT/Essay]]');
    await saveLocalEventNote(app, key, '');
    expect(getLocalEventNotePath(key)).toBeUndefined();
    expect(resolveLocalEventNote(app, key)).toBeNull();
  });
});
