/** A wiki-link input with inline note suggestions for the React event editor. */
import * as React from 'react';
import { useMemo, useState } from 'react';
import { App, TFile } from 'obsidian';
import { t } from '../../../features/i18n/i18n';
import {
  displayNoteLink,
  resolveNoteInput
} from '../../../features/linked-notes/localEventNoteLinks';
import { openLinkedFileInExistingLeafOrNew } from '../../../utils/leafUtils';

interface Props {
  app: App;
  value: string;
  onChange: (value: string) => void;
}

export const ObsidianNoteLinkInput = ({ app, value, onChange }: Props) => {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const query = value.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|', 1)[0].toLowerCase();
  const candidates = useMemo(() => {
    if (!focused) return [];
    return app.vault
      .getMarkdownFiles()
      .filter(
        file =>
          !query ||
          file.basename.toLowerCase().includes(query) ||
          file.path.toLowerCase().includes(query)
      )
      .sort((a, b) => a.basename.localeCompare(b.basename))
      .slice(0, 12);
  }, [app, focused, query]);

  const currentFile = resolveNoteInput(app, value);
  const select = (file: TFile) => {
    onChange(displayNoteLink(file.path));
    setActive(0);
    setFocused(false);
  };

  return (
    <div
      className="ofc-local-note-link"
      data-local-note-link="true"
      style={{ position: 'relative', width: '100%' }}
    >
      <input
        type="text"
        role="combobox"
        aria-expanded={focused && candidates.length > 0}
        aria-autocomplete="list"
        aria-controls="ofc-note-link-suggestions"
        value={value}
        placeholder={t('modals.editEvent.localNote.placeholder')}
        onChange={e => {
          onChange(e.target.value);
          setActive(0);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (!focused || candidates.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(i => (i + 1) % candidates.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(i => (i - 1 + candidates.length) % candidates.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            select(candidates[Math.min(active, candidates.length - 1)]);
          } else if (e.key === 'Escape') {
            setFocused(false);
          }
        }}
      />
      {focused && candidates.length > 0 && (
        <div
          id="ofc-note-link-suggestions"
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 1000,
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '220px',
            overflowY: 'auto',
            border: '1px solid var(--background-modifier-border)',
            borderRadius: 'var(--radius-m)',
            background: 'var(--background-primary)',
            boxShadow: 'var(--shadow-s)'
          }}
        >
          {candidates.map((file, index) => (
            <button
              key={file.path}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(file)}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 10px',
                textAlign: 'left',
                background: index === active ? 'var(--background-modifier-hover)' : 'transparent'
              }}
            >
              <span style={{ display: 'block' }}>{file.basename}</span>
              <small style={{ color: 'var(--text-muted)' }}>{file.parent?.path || '/'}</small>
            </button>
          ))}
        </div>
      )}
      {currentFile && (
        <a
          href={currentFile.path}
          className="internal-link"
          onClick={e => {
            e.preventDefault();
            void openLinkedFileInExistingLeafOrNew(app, currentFile);
          }}
          style={{ display: 'inline-block', marginTop: '6px' }}
        >
          {displayNoteLink(currentFile.path)}
        </a>
      )}
    </div>
  );
};
