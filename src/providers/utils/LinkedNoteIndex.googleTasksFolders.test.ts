import { App, TFile, TFolder } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { LinkedNoteIndex } from './LinkedNoteIndex';

jest.mock('../../core/PluginState');

/** Google Tasks associations are stored in local YAML, not the Google task. */
describe('Google Tasks linked notes across class folders', () => {
  const calendarId = 'googletasks-class-list';
  const taskId = 'task-456';
  let note: TFile;
  let app: App;
  let onRename: (file: TFile, oldPath: string) => void;
  let getFileCache: jest.Mock;
  let reloadProviderNow: jest.Mock;

  beforeEach(() => {
    PluginState.getSettings = jest.fn().mockReturnValue({ linkedNotesDirectory: '' });
    reloadProviderNow = jest.fn();
    PluginState.getProviderRegistry = jest.fn().mockReturnValue({ reloadProviderNow });
    note = new TFile();
    note.name = 'Research Project.md';
    getFileCache = jest.fn().mockImplementation((file: TFile) => ({
      frontmatter: {
        'fc-event-uid': file === note ? taskId : 'unrelated',
        'fc-calendar-id': file === note ? calendarId : 'another-calendar'
      }
    }));
    app = {
      vault: {
        getMarkdownFiles: jest.fn().mockImplementation(() => [note]),
        on: jest.fn((name: string, callback: (file: TFile, oldPath: string) => void) => {
          if (name === 'rename') onRename = callback;
          return {};
        }),
        offref: jest.fn()
      },
      metadataCache: {
        getFileCache,
        on: jest.fn().mockReturnValue({}),
        offref: jest.fn()
      },
      workspace: { onLayoutReady: jest.fn() }
    } as unknown as App;
  });

  it('keeps the same local task-note association after moving to a class folder', () => {
    const index = new LinkedNoteIndex(app, calendarId, true);
    index.initialize();
    expect(index.getFileForEvent(taskId)).toBe(note);

    const oldPath = note.path;
    const classFolder = new TFolder();
    classFolder.name = 'DBT';
    note.parent = classFolder;
    onRename(note, oldPath);

    expect(note.path).toBe('DBT/Research Project.md');
    expect(index.getFileForEvent(taskId)).toBe(note);
    expect(reloadProviderNow).toHaveBeenCalledWith(calendarId);
  });

  it('finds an already-moved note on plugin restart without changing the task', () => {
    const classFolder = new TFolder();
    classFolder.name = 'Couples Counseling';
    note.parent = classFolder;

    const index = new LinkedNoteIndex(app, calendarId, true);
    index.initialize();

    expect(index.getFileForEvent(taskId)).toBe(note);
    expect(note.path).toBe('Couples Counseling/Research Project.md');
    expect(getFileCache).toHaveBeenCalledWith(note);
  });
});
