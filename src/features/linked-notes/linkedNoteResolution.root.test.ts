import { PluginState } from '../../core/PluginState';
import { getNameBasedLinkedNoteFile } from './linkedNoteResolution';
import { OFCEvent } from '../../types';

jest.mock('../../core/PluginState');

describe('Vault Root name-based linked notes', () => {
  it('looks up the note at the vault root when the configured directory is empty', () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNoteLinkStrategy: 'name',
      linkedNotesDirectory: ''
    });
    const existing = { path: 'Weekly Planning.md' };
    const getFileByPath = jest.fn().mockReturnValue(existing);
    const app = { vault: { getFileByPath } } as never;
    const event: OFCEvent = {
      type: 'single',
      uid: 'event-1',
      title: 'Weekly / Planning',
      date: '2026-10-26',
      endDate: null,
      allDay: true
    };

    expect(getNameBasedLinkedNoteFile(app, event)).toBe(existing);
    expect(getFileByPath).toHaveBeenCalledWith('Weekly Planning.md');
  });
});
