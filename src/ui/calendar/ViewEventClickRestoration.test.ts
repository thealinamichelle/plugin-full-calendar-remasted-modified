import type { EventClickArg } from '@fullcalendar/core';
import type { App, TFile } from 'obsidian';
import type FullCalendarPlugin from '../../main';
import type { OFCEvent } from '../../types';
import type { ViewContext } from './ViewContext';
import { PluginState } from '../../core/PluginState';
import { ViewEventInteractionHandler } from './ViewEventInteractionHandler';
import { resolveLocalEventNote } from '../../features/linked-notes/localEventNoteLinks';
import { openLinkedFileInExistingLeafOrNew } from '../../utils/leafUtils';
import { openOrCreateLinkedNote } from '../../utils/eventActions';
import { launchEditModal, launchEventDetailsModal } from '../modals/event_modal';

jest.mock('../../utils/showNotice', () => ({ showNotice: jest.fn() }));
jest.mock('../../utils/leafUtils', () => ({
  openLinkedFileInExistingLeafOrNew: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../utils/eventActions', () => ({
  openOrCreateLinkedNote: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../features/linked-notes/linkedNoteResolution', () => ({
  getNameBasedLinkedNoteFile: jest.fn().mockReturnValue(null)
}));
jest.mock('../../features/linked-notes/localEventNoteLinks', () => ({
  eventNoteKey: jest.fn().mockReturnValue('key'),
  resolveLocalEventNote: jest.fn().mockReturnValue(null)
}));
jest.mock('../modals/event_modal', () => ({
  launchEditModal: jest.fn(),
  launchEventDetailsModal: jest.fn()
}));

describe('restored calendar event click behavior', () => {
  const event: OFCEvent = {
    type: 'single',
    title: 'Due: Paper',
    date: '2026-10-30',
    endDate: null,
    allDay: true,
    uid: 'task-uid'
  };
  const plugin = {} as FullCalendarPlugin;
  const openFile = jest.mocked(openLinkedFileInExistingLeafOrNew);
  const createNote = jest.mocked(openOrCreateLinkedNote);
  const editEvent = jest.mocked(launchEditModal);
  const eventDetails = jest.mocked(launchEventDetailsModal);
  const localFile = jest.mocked(resolveLocalEventNote);

  let handler: ViewEventInteractionHandler;
  let provider: {
    linkedNoteIndex: { resolveLinkedFileAfterHydration: jest.Mock };
    createLinkedNote: jest.Mock;
  };
  let cache: {
    store: { getEventDetails: jest.Mock };
    isEventEditable: jest.Mock;
  };
  let app: App;

  const clickArg = (metaKey = false, ctrlKey = false): EventClickArg =>
    ({
      event: { id: 'session-id', allDay: true, startStr: '2026-10-30' },
      jsEvent: { metaKey, ctrlKey }
    }) as unknown as EventClickArg;

  beforeEach(() => {
    jest.clearAllMocks();
    localFile.mockReturnValue(null);
    app = {
      vault: { getFileByPath: jest.fn().mockReturnValue(null) }
    } as unknown as App;
    provider = {
      linkedNoteIndex: { resolveLinkedFileAfterHydration: jest.fn().mockResolvedValue(null) },
      createLinkedNote: jest.fn().mockResolvedValue(null)
    };
    cache = {
      store: {
        getEventDetails: jest.fn().mockReturnValue({ calendarId: 'google-tasks', event })
      },
      isEventEditable: jest.fn().mockReturnValue(true)
    };
    jest.spyOn(PluginState, 'getCache').mockReturnValue(cache as never);
    jest.spyOn(PluginState, 'getProviderRegistry').mockReturnValue({
      getInstance: jest.fn().mockReturnValue(provider),
      getCapabilities: jest.fn().mockReturnValue({ hasCustomEditUI: false })
    } as never);
    handler = new ViewEventInteractionHandler({ app, plugin } as ViewContext);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens an existing local note with ordinary click', async () => {
    const file = { path: 'Calendar-INBOX/Due Paper.md' } as TFile;
    localFile.mockReturnValue(file);

    await handler.handleEventClick(clickArg());

    expect(openFile).toHaveBeenCalledWith(app, file);
    expect(createNote).not.toHaveBeenCalled();
    expect(editEvent).not.toHaveBeenCalled();
  });

  it('opens the provider-indexed note with ordinary click', async () => {
    const file = { path: 'Calendar-INBOX/Due Paper.md' } as TFile;
    provider.linkedNoteIndex.resolveLinkedFileAfterHydration.mockResolvedValue(file);

    await handler.handleEventClick(clickArg());

    expect(openFile).toHaveBeenCalledWith(app, file);
    expect(createNote).not.toHaveBeenCalled();
  });

  it('creates and opens a missing remote note with ordinary click', async () => {
    await handler.handleEventClick(clickArg());

    expect(createNote).toHaveBeenCalledWith(plugin, 'google-tasks', event, true, undefined);
    expect(editEvent).not.toHaveBeenCalled();
    expect(eventDetails).not.toHaveBeenCalled();
  });

  it('Cmd-click opens the editor without opening or creating a note', async () => {
    await handler.handleEventClick(clickArg(true, false));

    expect(editEvent).toHaveBeenCalledWith(plugin, 'session-id', undefined);
    expect(openFile).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('Ctrl-click opens the editor without opening or creating a note', async () => {
    await handler.handleEventClick(clickArg(false, true));

    expect(editEvent).toHaveBeenCalledWith(plugin, 'session-id', undefined);
    expect(openFile).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('shows details for non-editable events on modifier click', async () => {
    cache.isEventEditable.mockReturnValue(false);

    await handler.handleEventClick(clickArg(true, false));

    expect(eventDetails).toHaveBeenCalledWith(plugin, 'session-id', undefined);
    expect(createNote).not.toHaveBeenCalled();
  });
});
