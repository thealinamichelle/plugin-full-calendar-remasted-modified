import { App, Modal, Notice, Setting } from 'obsidian';
import { OFCEvent } from '../../types';
import { PluginState } from '../../core/PluginState';
import { t } from '../../features/i18n/i18n';
import {
  getGoogleTaskLocalNoteLink,
  saveGoogleTaskLocalNoteLink
} from '../../features/linked-notes/googleTaskLocalLinks';

/** Task settings are separate from Google Task data: only completion may be synced. */
export class GoogleTaskLocalSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly eventId: string,
    private readonly calendarId: string,
    private readonly task: OFCEvent
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: t('modals.googleTaskLocal.title') });
    contentEl.createEl('p', { text: this.task.title });

    let link = getGoogleTaskLocalNoteLink(this.calendarId, this.task.uid ?? '');
    let completed = this.task.type === 'single' && !!this.task.completed;

    new Setting(contentEl)
      .setName(t('modals.googleTaskLocal.noteLink'))
      .setDesc(t('modals.googleTaskLocal.noteLinkHelp'))
      .addText(input =>
        input
          .setPlaceholder(t('modals.googleTaskLocal.noteLinkPlaceholder'))
          .setValue(link)
          .onChange(value => {
            link = value;
          })
      );

    new Setting(contentEl).setName(t('modals.googleTaskLocal.completed')).addToggle(toggle =>
      toggle.setValue(completed).onChange(value => {
        completed = value;
      })
    );

    new Setting(contentEl).addButton(button =>
      button
        .setButtonText(t('modals.googleTaskLocal.save'))
        .setCta()
        .onClick(() => {
          void (async () => {
            button.setDisabled(true);
            try {
              const uid = this.task.uid;
              if (!uid) throw new Error(t('modals.googleTaskLocal.missingTaskId'));
              await saveGoogleTaskLocalNoteLink(this.app, this.calendarId, uid, link);
              if (completed !== (this.task.type === 'single' && !!this.task.completed)) {
                const provider = PluginState.getProviderRegistry().getInstance(this.calendarId);
                if (!provider || !('toggleComplete' in provider)) {
                  throw new Error(t('modals.googleTaskLocal.completionFailed'));
                }
                const success = await (
                  provider as typeof provider & {
                    toggleComplete(eventId: string, done: boolean): Promise<boolean>;
                  }
                ).toggleComplete(this.eventId, completed);
                if (!success) throw new Error(t('modals.googleTaskLocal.completionFailed'));
              }
              this.close();
            } catch (error) {
              new Notice(error instanceof Error ? error.message : String(error));
            } finally {
              button.setDisabled(false);
            }
          })();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function launchGoogleTaskLocalSettingsModal(
  app: App,
  eventId: string,
  calendarId: string,
  task: OFCEvent
): void {
  new GoogleTaskLocalSettingsModal(app, eventId, calendarId, task).open();
}
