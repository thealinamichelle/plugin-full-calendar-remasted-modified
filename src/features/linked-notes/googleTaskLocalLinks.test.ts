import { App, TFile } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import {
  getGoogleTaskLocalNoteLink,
  resolveGoogleTaskLocalNote,
  saveGoogleTaskLocalNoteLink,
  updateGoogleTaskLocalLinksAfterRename
} from './googleTaskLocalLinks';

jest.mock('../../core/PluginState', () => ({
  PluginState: {
    getSettings: jest.fn(),
    persistData: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('Google Task local note links', () => {
  const settings = { googleTaskLocalNoteLinks: {} as Record<string, string> };
  const file = { path: 'DBT/Finish Paper.md' } as TFile;
  const vault = { getFileByPath: jest.fn((path: string) => (path === file.path ? file : null)) };
  const app = {
    vault,
    metadataCache: {
      getFirstLinkpathDest: jest.fn((path: string) =>
        path === 'Finish Paper' || path === 'DBT/Finish Paper' ? file : null
      )
    }
  } as unknown as App;

  beforeEach(() => {
    settings.googleTaskLocalNoteLinks = {};
    (PluginState.getSettings as jest.Mock).mockReturnValue(settings);
    (PluginState.persistData as jest.Mock).mockClear();
  });

  it('saves an Obsidian link locally, without altering a Google Task', async () => {
    await saveGoogleTaskLocalNoteLink(app, 'school-tasks', 'task-123', '[[Finish Paper]]');
    expect(settings.googleTaskLocalNoteLinks).toEqual({
      'school-tasks::task-123': 'DBT/Finish Paper.md'
    });
    expect(getGoogleTaskLocalNoteLink('school-tasks', 'task-123')).toBe(
      '[[DBT/Finish Paper]]'
    );
    expect(resolveGoogleTaskLocalNote(app, 'school-tasks', 'task-123')).toBe(file);
    expect(PluginState.persistData).toHaveBeenCalledTimes(1);
  });

  it('keeps the link when a note or its class folder moves', async () => {
    await saveGoogleTaskLocalNoteLink(app, 'school-tasks', 'task-123', '[[Finish Paper]]');
    await updateGoogleTaskLocalLinksAfterRename('DBT', 'Courses/DBT');
    expect(getGoogleTaskLocalNoteLink('school-tasks', 'task-123')).toBe(
      '[[Courses/DBT/Finish Paper]]'
    );
    await updateGoogleTaskLocalLinksAfterRename(
      'Courses/DBT/Finish Paper.md',
      'Courses/DBT/Final Paper.md'
    );
    expect(getGoogleTaskLocalNoteLink('school-tasks', 'task-123')).toBe(
      '[[Courses/DBT/Final Paper]]'
    );
  });

  it('removes the local link when the user clears the field', async () => {
    await saveGoogleTaskLocalNoteLink(app, 'school-tasks', 'task-123', '[[Finish Paper]]');
    await saveGoogleTaskLocalNoteLink(app, 'school-tasks', 'task-123', '');
    expect(getGoogleTaskLocalNoteLink('school-tasks', 'task-123')).toBe('');
  });
});
