import { App, TFile } from "obsidian";
import { PluginState } from "../../core/PluginState";
import { OFCEvent } from "../../types";
import { LinkedNoteIndex } from "./LinkedNoteIndex";

const event: OFCEvent = {
  type: "single",
  title: "Submit Paper",
  date: "2026-10-26",
  endDate: null,
  allDay: true,
  uid: "task-123",
};

describe("LinkedNoteIndex recovery", () => {
  const calendarId = "google-tasks-example";
  let file: TFile;
  let getFileCache: jest.Mock;
  let cachedRead: jest.Mock;
  let onChanged: (file: TFile) => void;
  let app: App;

  beforeEach(() => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: "",
      linkedNoteLinkStrategy: "uid",
    });
    PluginState.getProviderRegistry = jest.fn().mockReturnValue({
      reloadProviderNow: jest.fn(),
    });

    file = new TFile();
    file.name = "Submit Paper.md";
    getFileCache = jest.fn().mockReturnValue({ frontmatter: {} });
    cachedRead = jest
      .fn()
      .mockResolvedValue(
        '---\nfc-event-uid: "task-123"\nfc-calendar-id: "google-tasks-example"\n---\n\n## Description\n',
      );
    app = {
      vault: {
        getMarkdownFiles: jest.fn().mockReturnValue([file]),
        cachedRead,
        on: jest.fn().mockReturnValue({}),
        offref: jest.fn(),
      },
      metadataCache: {
        getFileCache,
        on: jest.fn((name: string, callback: (file: TFile) => void) => {
          if (name === "changed") onChanged = callback;
          return {};
        }),
        offref: jest.fn(),
      },
      workspace: {
        onLayoutReady: jest.fn().mockImplementation((callback: () => void) => {
          callback();
        }),
      },
    } as unknown as App;
  });

  it("recovers an existing root note even when its metadata cache has no event ID", async () => {
    const index = new LinkedNoteIndex(app, calendarId);
    expect(await index.resolveLinkedFileAfterHydration(event)).toBe(file);
    expect(index.resolveLinkedFile(event)).toBe(file);
    expect(cachedRead).toHaveBeenCalledTimes(1);
    expect(await index.resolveLinkedFileAfterHydration(event)).toBe(file);
    expect(cachedRead).toHaveBeenCalledTimes(1);
  });

  it("recovers an association lost on a later metadata refresh", async () => {
    getFileCache.mockReturnValueOnce({
      frontmatter: { "fc-event-uid": "task-123", "fc-calendar-id": calendarId },
    });
    const index = new LinkedNoteIndex(app, calendarId);
    index.initialize();
    expect(index.resolveLinkedFile(event)).toBe(file);

    onChanged(file); // The cache is now missing its fc-* identifiers.
    expect(index.resolveLinkedFile(event)).toBeNull();
    expect(await index.resolveLinkedFileAfterHydration(event)).toBe(file);
    expect(cachedRead).toHaveBeenCalledTimes(1);
  });

  it("registers a newly created note before the cache is populated", () => {
    const index = new LinkedNoteIndex(app, calendarId);
    index.registerLinkedFile("task-123", file);
    expect(index.resolveLinkedFile(event)).toBe(file);
  });
});
