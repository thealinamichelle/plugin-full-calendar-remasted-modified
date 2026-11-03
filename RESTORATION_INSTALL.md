# Full Calendar restoration patch (based on zip 5 / commit `b09f5f0`)

## Apply to your existing repository

1. Make a backup or commit any unrelated work. You do **not** need to reset your branch.
2. Copy `full-calendar-restorations.patch` to your Downloads folder.
3. In Terminal:

```bash
nvm use 24
cd ~/Developer/plugin-full-calendar-remasted-modified
git status --short
git apply --check ~/Downloads/full-calendar-restorations.patch
git apply ~/Downloads/full-calendar-restorations.patch
pnpm run prod
```

If `git apply --check` fails, **do not force-apply**: it means the source has changed from zip 5. Share the error instead.

After a successful build, install the generated `main.js`, `styles.css`, and `manifest.json` using your existing plugin installation procedure, and reload the plugin in Obsidian.

## Linked note settings

In Full Calendar's **Linked Note Settings**, select `Calendar-INBOX` as the notes directory.

The original user-saved template isn't in Git history. If you want the reconstructed link template, paste the content of `RESTORED_CALENDAR_INBOX_TEMPLATE.md` into the **Linked note template** field:

```markdown
# {{title}}

[[{{calendarName}}/{{filename}}|{{filename}}]]
```

`{{filename}}` strips invalid filename characters, including `:`. `{{calendarName}}` must actually match the folder containing the note you intend to link to; change that part if your target folder is different. The plugin continues to add `fc-event-uid`, `fc-calendar-id`, and `prefer-view: read` as YAML.

**Existing settings**: The default for *new* settings is now `mod-click`. If your current settings saved `click` explicitly, change **Event creation click mode** to **Cmd/Ctrl-click** in Obsidian; this patch deliberately does not overwrite saved preferences.

## Scope and checks

- Normal click on an existing calendar event: open its associated note, or use the existing provider implementation to create and open one.
- Cmd/Ctrl-click on an existing event: event editor (details modal for read-only events).
- Cmd/Ctrl-click empty space: the default way to start event creation.
- Removed: broken manual note field, abandoned Google Tasks-specific note settings window, automatic Templater invocation.
- Kept: all local note mappings and rename/recovery data, `{{filename}}`, YAML properties, and visual styling.
- Tested: TypeScript/TSX syntax and six handler smoke scenarios plus template substitution in an isolated mocked Node runtime.
- Not tested here: full Jest/TypeScript project compile or Obsidian runtime (dependencies not installed in the available environment).
