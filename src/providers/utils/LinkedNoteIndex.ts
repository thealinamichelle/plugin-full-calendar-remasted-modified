import { App, TFile, EventRef, parseYaml } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { OFCEvent, isRecurringEvent } from '../../types';

export class LinkedNoteIndex {
  private app: App;
  private calendarId: string;
  private index = new Map<string, TFile>(); // compoundKey -> TFile
  private filesByUid = new Map<string, Map<string, TFile>>(); // eventUid -> (recurrenceKey -> TFile)
  private eventRefs: EventRef[] = [];
  private hydrationWaiters: (() => void)[] = [];
  private revision = 0;
  private startupHydrationPending = false;
  private recoveryGeneration = 0;
  private lastRecoveryGeneration = -1;
  private recoveryInFlight: Promise<void> | null = null;

  constructor(
    app: App,
    calendarId: string,
    private readonly searchWholeVault = false
  ) {
    this.app = app;
    this.calendarId = calendarId;
  }

  private scanDirectory(): TFile[] {
    const unresolvedFiles: TFile[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      if (this.isFileInScope(file)) {
        if (!this.app.metadataCache.getFileCache(file)) {
          unresolvedFiles.push(file);
        }
        this.processFile(file, false);
      }
    }

    return unresolvedFiles;
  }

  private beginStartupHydration(revision: number): void {
    this.startupHydrationPending = true;

    const resolvedRef = this.app.metadataCache.on('resolved', () => {
      if (!this.startupHydrationPending || revision !== this.revision) {
        return;
      }

      this.reconcileStartupHydration(revision);
    });
    this.eventRefs.push(resolvedRef);
  }

  private reconcileStartupHydration(revision: number): void {
    if (revision !== this.revision) {
      return;
    }

    const unresolvedFiles = this.scanDirectory();
    if (unresolvedFiles.length > 0) {
      void this.backfillUnresolvedFiles(unresolvedFiles, revision);
      return;
    }

    this.completeStartupHydration(revision);
  }

  private completeStartupHydration(revision: number): void {
    if (revision !== this.revision) {
      return;
    }

    this.startupHydrationPending = false;
    this.resolveHydrationWaiters();
  }

  private scheduleLayoutReadyRescan(revision: number): void {
    this.app.workspace.onLayoutReady(() => {
      if (revision !== this.revision) {
        return;
      }

      this.reconcileStartupHydration(revision);
    });
  }

  public getFileForEvent(eventUid: string, recurrenceId?: string): TFile | null {
    if (!eventUid || !eventUid.trim()) {
      return null;
    }
    const cleanUid = eventUid.trim();
    if (recurrenceId && recurrenceId.trim()) {
      const instanceKey = `${cleanUid}::${recurrenceId.trim()}`;
      const instanceFile = this.index.get(instanceKey);
      if (instanceFile) {
        return instanceFile;
      }
    }
    return this.index.get(cleanUid) || null;
  }

  /** Register a note at creation time, before MetadataCache has processed its YAML. */
  public registerLinkedFile(eventUid: string, file: TFile, recurrenceId?: string): void {
    const uid = eventUid.trim();
    if (!uid || !this.isFileInScope(file)) return;

    const occurrence = recurrenceId?.trim() ?? '';
    const key = occurrence ? `${uid}::${occurrence}` : uid;
    this.removePathFromIndex(file.path, false);
    this.index.set(key, file);

    let files = this.filesByUid.get(uid);
    if (!files) {
      files = new Map<string, TFile>();
      this.filesByUid.set(uid, files);
    }
    files.set(occurrence, file);
  }

  /** Rebuild missing associations from note contents when MetadataCache is incomplete. */
  private async recoverLinkedFilesFromVault(): Promise<void> {
    if (this.lastRecoveryGeneration === this.recoveryGeneration) return;
    if (this.recoveryInFlight) {
      await this.recoveryInFlight;
      if (this.lastRecoveryGeneration === this.recoveryGeneration) return;
    }

    const revision = this.revision;
    const generation = this.recoveryGeneration;
    const scan = async (): Promise<void> => {
      for (const file of this.app.vault.getMarkdownFiles()) {
        if (revision !== this.revision) return;
        if (!this.isFileInScope(file)) continue;

        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const cachedCalendar = this.frontmatterString(frontmatter?.['fc-calendar-id']);
        const cachedUid = this.frontmatterString(frontmatter?.['fc-event-uid']);
        if (cachedCalendar === this.calendarId && cachedUid) {
          this.registerLinkedFile(
            cachedUid,
            file,
            this.frontmatterString(frontmatter?.['fc-event-recurrence-id']) ?? undefined
          );
          continue;
        }

        // The cache may be absent or stale even when the note's YAML is correct.
        // Only read note bodies on an index miss, not during normal event rendering.
        try {
          const contents = await this.app.vault.cachedRead(file);
          if (revision !== this.revision) return;
          const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents);
          if (!match) continue;
          const parsed = parseYaml(match[1]) as Record<string, unknown> | null;
          if (!parsed) continue;
          const calendarId = this.frontmatterString(parsed['fc-calendar-id']);
          const uid = this.frontmatterString(parsed['fc-event-uid']);
          if (calendarId !== this.calendarId || !uid) continue;
          this.registerLinkedFile(
            uid,
            file,
            this.frontmatterString(parsed['fc-event-recurrence-id']) ?? undefined
          );
        } catch (error) {
          console.warn(`[LinkedNoteIndex] Unable to inspect linked note ${file.path}`, error);
        }
      }
      if (revision === this.revision) this.lastRecoveryGeneration = generation;
    };

    const promise = scan();
    this.recoveryInFlight = promise;
    try {
      await promise;
    } finally {
      if (this.recoveryInFlight === promise) this.recoveryInFlight = null;
    }
  }

  /**
   * Recovers any file associated with this event UID (master note or legacy instance note) in O(1).
   * Useful for single events where a legacy note was erroneously indexed with a recurrence ID.
   */
  public getAnyFileForEvent(eventUid: string): TFile | null {
    if (!eventUid || !eventUid.trim()) {
      return null;
    }
    const cleanUid = eventUid.trim();
    const mapForUid = this.filesByUid.get(cleanUid);
    if (!mapForUid || mapForUid.size === 0) {
      return null;
    }
    const master = mapForUid.get('');
    if (master) {
      return master;
    }
    return mapForUid.values().next().value ?? null;
  }

  private isNameStrategy(): boolean {
    try {
      return PluginState.getSettings()?.linkedNoteLinkStrategy === 'name';
    } catch {
      return false;
    }
  }

  /**
   * Encapsulated, unified resolution of linked note files for any OFCEvent.
   * Adheres to SRP & DRY so individual calendar providers and UI callers do not
   * need to duplicate recurrence/fallback heuristics.
   */
  public resolveLinkedFile(event: OFCEvent, instanceDate?: string): TFile | null {
    const uid = (event.uid || event.id || '').trim();
    if (!uid) {
      return null;
    }

    const isRecurring = isRecurringEvent(event);
    const effectiveRecurrenceId = this.isNameStrategy()
      ? undefined
      : instanceDate || event.recurrenceId;

    // 1. If an explicit recurrence ID or instance date is present, check instance-specific key
    if (effectiveRecurrenceId) {
      const instanceFile = this.getFileForEvent(uid, effectiveRecurrenceId);
      if (instanceFile) {
        return instanceFile;
      }
    }

    // 2. Direct lookup for UID (master series note or standard single event)
    const directFile = this.getFileForEvent(uid);
    if (directFile) {
      return directFile;
    }

    // 3. For recurrence exceptions with a parent series (e.g. Google Calendar recurringEventId)
    if (event.recurringEventId && event.recurringEventId.trim() && event.recurringEventId !== uid) {
      const parentUid = event.recurringEventId.trim();
      if (effectiveRecurrenceId) {
        const parentInstanceFile = this.getFileForEvent(parentUid, effectiveRecurrenceId);
        if (parentInstanceFile) {
          return parentInstanceFile;
        }
      }
      const parentMasterFile = this.getFileForEvent(parentUid);
      if (parentMasterFile) {
        return parentMasterFile;
      }
    }

    // 4. For non-recurring single events, fallback to any file indexed under this UID (self-heals legacy notes)
    if (!isRecurring) {
      return this.getAnyFileForEvent(uid);
    }

    return null;
  }

  public async resolveLinkedFileAfterHydration(
    event: OFCEvent,
    instanceDate?: string
  ): Promise<TFile | null> {
    let file = this.resolveLinkedFile(event, instanceDate);
    if (file) return file;

    await this.waitForStartupHydration();
    file = this.resolveLinkedFile(event, instanceDate);
    if (file) return file;

    await this.recoverLinkedFilesFromVault();
    return this.resolveLinkedFile(event, instanceDate);
  }

  public async getFileForEventAfterHydration(
    eventUid: string,
    recurrenceId?: string
  ): Promise<TFile | null> {
    const existingFile = this.getFileForEvent(eventUid, recurrenceId);
    if (existingFile) {
      return existingFile;
    }

    await this.waitForStartupHydration();
    const hydratedFile = this.getFileForEvent(eventUid, recurrenceId);
    if (hydratedFile) return hydratedFile;

    await this.recoverLinkedFilesFromVault();
    return this.getFileForEvent(eventUid, recurrenceId);
  }

  public async waitForStartupHydration(timeoutMs = 1500): Promise<void> {
    if (!this.startupHydrationPending) {
      return;
    }

    const revision = this.revision;
    this.reconcileStartupHydration(revision);
    if (!this.startupHydrationPending || revision !== this.revision) {
      return;
    }

    await new Promise<void>((resolve) => {
      const resolveOnce = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(() => {
        this.hydrationWaiters = this.hydrationWaiters.filter((waiter) => waiter !== resolveOnce);
        resolve();
      }, timeoutMs);

      this.hydrationWaiters.push(resolveOnce);
    });
  }

  private getDirectory(): string {
    try {
      return PluginState.getSettings()?.linkedNotesDirectory || '';
    } catch {
      return '';
    }
  }

  private frontmatterString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString();
    }
    return null;
  }

  private isFileInScope(file: TFile): boolean {
    // Google Tasks may link a local note stored in any class folder.
    // This changes only where links are found; new notes still use the configured directory.
    if (this.searchWholeVault) return file.extension === 'md';

    const dir = this.getDirectory().trim();
    if (!dir) return file.parent?.path === '/' || !file.path.includes('/');
    // Normalize paths
    const normalizedDir = dir.replace(/\/$/, '');
    return file.path.startsWith(`${normalizedDir}/`);
  }

  public initialize(): void {
    this.destroy();
    const activeRevision = this.revision;
    const unresolvedFiles = this.scanDirectory();

    this.registerWatchers();
    this.beginStartupHydration(activeRevision);
    this.scheduleLayoutReadyRescan(activeRevision);

    if (unresolvedFiles.length > 0) {
      void this.backfillUnresolvedFiles(unresolvedFiles, activeRevision);
    } else if (this.index.size > 0) {
      this.completeStartupHydration(activeRevision);
    }
  }

  private async backfillUnresolvedFiles(files: TFile[], revision: number): Promise<void> {
    const appWithMetadata = this.app as App & {
      waitForMetadata?: (file: TFile) => Promise<unknown>;
    };
    if (typeof appWithMetadata.waitForMetadata !== 'function') {
      return;
    }

    let changed = false;

    for (const file of files) {
      try {
        await appWithMetadata.waitForMetadata(file);
      } catch {
        continue;
      }

      if (revision !== this.revision || !this.isFileInScope(file)) {
        return;
      }

      changed = this.processFile(file, false) || changed;
    }

    if (changed && revision === this.revision) {
      this.triggerReload();
    }

    if (revision === this.revision) {
      this.reconcileStartupHydration(revision);
    }
  }

  private processFile(file: TFile, triggerReload = true): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    if (!frontmatter) {
      // A vault-create or metadata update may arrive before frontmatter is
      // available. Do not forget a valid association on a transient cache miss.
      if (!cache) return false;
      return this.removePathFromIndex(file.path, triggerReload);
    }

    const calId = this.frontmatterString(frontmatter['fc-calendar-id']);
    const eventUid = this.frontmatterString(frontmatter['fc-event-uid']);
    const recurrenceId = this.frontmatterString(frontmatter['fc-event-recurrence-id']);

    if (calId === this.calendarId && eventUid) {
      const recurrenceSuffix = recurrenceId ? `::${recurrenceId}` : '';
      const key = `${eventUid}${recurrenceSuffix}`;

      // Clean up any stale mappings in the index map that point to the same file path but have a different key
      let removedOld = false;
      for (const [k, indexedFile] of this.index.entries()) {
        if (indexedFile.path === file.path && k !== key) {
          this.index.delete(k);
          const sep = k.indexOf('::');
          const oldUid = sep === -1 ? k : k.slice(0, sep);
          const oldRecId = sep === -1 ? '' : k.slice(sep + 2);
          const oldMap = this.filesByUid.get(oldUid);
          if (oldMap) {
            oldMap.delete(oldRecId);
            if (oldMap.size === 0) {
              this.filesByUid.delete(oldUid);
            }
          }
          removedOld = true;
        }
      }

      const prevFile = this.index.get(key);
      if (prevFile?.path !== file.path || removedOld) {
        this.index.set(key, file);
        let mapForUid = this.filesByUid.get(eventUid);
        if (!mapForUid) {
          mapForUid = new Map<string, TFile>();
          this.filesByUid.set(eventUid, mapForUid);
        }
        mapForUid.set(recurrenceId || '', file);

        if (triggerReload) {
          this.triggerReload();
        }
        return true;
      }
    } else {
      return this.removePathFromIndex(file.path, triggerReload);
    }

    return false;
  }

  private removePathFromIndex(path: string, triggerReload = true): boolean {
    let removed = false;
    for (const [key, indexedFile] of this.index.entries()) {
      if (indexedFile.path === path) {
        this.index.delete(key);
        const sep = key.indexOf('::');
        const uid = sep === -1 ? key : key.slice(0, sep);
        const recId = sep === -1 ? '' : key.slice(sep + 2);
        const mapForUid = this.filesByUid.get(uid);
        if (mapForUid) {
          mapForUid.delete(recId);
          if (mapForUid.size === 0) {
            this.filesByUid.delete(uid);
          }
        }
        removed = true;
      }
    }
    if (removed && triggerReload) {
      this.triggerReload();
    }
    return removed;
  }

  private triggerReload(): void {
    try {
      PluginState.getProviderRegistry().reloadProviderNow(this.calendarId);
    } catch (e) {
      console.warn(
        `Failed to reload calendar provider ${this.calendarId} after linked note change`,
        e
      );
    }
  }

  private registerWatchers(): void {
    const changedRef = this.app.metadataCache.on('changed', (file) => {
      if (file instanceof TFile) {
        this.recoveryGeneration++;
        if (this.isFileInScope(file)) {
          this.processFile(file);
        } else {
          // The file no longer belongs to the configured lookup scope.
          this.removePathFromIndex(file.path);
        }
      }
    });
    this.eventRefs.push(changedRef);

    const createRef = this.app.vault.on('create', (file) => {
      if (file instanceof TFile && this.isFileInScope(file)) {
        this.recoveryGeneration++;
        this.processFile(file);
      }
    });
    this.eventRefs.push(createRef);

    const deleteRef = this.app.vault.on('delete', (file) => {
      if (file instanceof TFile) {
        this.recoveryGeneration++;
        this.removePathFromIndex(file.path);
      }
    });
    this.eventRefs.push(deleteRef);

    const renameRef = this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) {
        this.recoveryGeneration++;
        // Obsidian mutates the same TFile on moves, so an existing mapping
        // already points at its new path. Keep it even if metadata is not
        // hydrated yet, then refresh the calendar's cached event location.
        const wasIndexed = Array.from(this.index.values()).some(indexed => indexed === file);
        if (wasIndexed && this.isFileInScope(file)) {
          this.triggerReload();
          return;
        }

        const removed = this.removePathFromIndex(oldPath, false);
        if (this.isFileInScope(file)) {
          this.processFile(file);
        } else if (this.removePathFromIndex(file.path, false) || removed) {
          // For directory-limited providers, moving out of scope unlinks it.
          this.triggerReload();
        }
      }
    });
    this.eventRefs.push(renameRef);
  }

  public destroy(): void {
    this.revision += 1;
    this.startupHydrationPending = false;
    this.resolveHydrationWaiters();
    for (const ref of this.eventRefs) {
      // metadataCache and vault can offref their listeners
      this.app.metadataCache.offref(ref);
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    this.index.clear();
    this.filesByUid.clear();
    this.recoveryGeneration++;
    this.lastRecoveryGeneration = -1;
    this.recoveryInFlight = null;
  }

  private resolveHydrationWaiters(): void {
    const waiters = this.hydrationWaiters;
    this.hydrationWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}
