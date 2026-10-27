import { App, TFile } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { LinkedNoteIndex } from './LinkedNoteIndex';

jest.mock('../../core/PluginState');

describe('Vault Root linked-note index', () => {
  it('indexes root-level notes and excludes notes in subfolders', () => {
    PluginState.getSettings = jest.fn().mockReturnValue({ linkedNotesDirectory: '' });
    const rootNote = { path: 'Task.md', parent: { path: '/' } } as TFile;
    const nestedNote = { path: 'Other/Task.md', parent: { path: 'Other' } } as TFile;
    const getFileCache = jest.fn((file: TFile) => ({
      frontmatter: { 'fc-calendar-id': 'tasks', 'fc-event-uid': file.path }
    }));
    const app = {
      vault: {
        getMarkdownFiles: jest.fn().mockReturnValue([rootNote, nestedNote]),
        on: jest.fn().mockReturnValue({}),
        offref: jest.fn()
      },
      metadataCache: {
        getFileCache,
        on: jest.fn().mockReturnValue({}),
        offref: jest.fn()
      },
      workspace: { onLayoutReady: jest.fn() }
    } as unknown as App;
    const index = new LinkedNoteIndex(app, 'tasks');

    index.initialize();
    expect(index.getFileForEvent('Task.md')).toBe(rootNote);
    expect(index.getFileForEvent('Other/Task.md')).toBeNull();
  });
});
