import { useState } from 'react';
import { saveFile } from '../file/save-file';
import { useT } from '../i18n';
import { readLibraryFile, writeLibraryFile } from './library-files';
import type { Library } from './useLibrary';

/** Larger than any library worth importing, and small enough to read without stalling the tab. */
const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

// Only for telling an imported item's shapes apart: every shape gets a fresh
// id again as it is placed.
let nextShapeId = 0;
const importShapeId = () => `import-${(nextShapeId += 1)}`;

export type Notify = (message: string, tone?: 'warn') => void;

/**
 * Reading a library file into the library and writing the personal items out
 * to one: the same on a desktop's panel and a phone's sheet.
 */
export function useLibraryFiles(
  library: Library,
  onNotify: Notify,
  /** Once an import has gone in, whatever came of it, to show where it went. */
  onImported?: () => void,
) {
  const t = useT();
  const [importing, setImporting] = useState(false);

  const importFile = async (file: File) => {
    if (file.size > IMPORT_MAX_BYTES) {
      onNotify(t('library.fileTooLarge'), 'warn');
      return;
    }
    const title = file.name.replace(/\.[^.]*$/, '').trim() || t('library.imported');
    const read = readLibraryFile(await file.text(), importShapeId, title);
    if (!read) {
      onNotify(t('library.notAFile'), 'warn');
      return;
    }
    if (read.items.length === 0) {
      onNotify(t('library.nothingDrawable'), 'warn');
      return;
    }
    setImporting(true);
    const result = await library.importItems(read.items);
    setImporting(false);
    onImported?.();
    const total = read.items.length;
    if (result.error) {
      onNotify(
        t('library.importedPartly', { imported: result.imported, total, error: result.error }),
        'warn',
      );
      return;
    }
    const notes = [
      result.tooLarge > 0 && t('library.tooLargeCount', { count: result.tooLarge }),
      read.imagesLeftOut > 0 && t('library.imagesLeftOut'),
    ].filter(Boolean);
    onNotify(
      notes.length > 0
        ? t('library.importedWithNotes', {
            items: t('library.itemCount', { count: result.imported }),
            notes: notes.join(', '),
          })
        : t('library.importedItems', { items: t('library.itemCount', { count: result.imported }) }),
      notes.length > 0 ? 'warn' : undefined,
    );
  };

  const exportPersonal = async () => {
    try {
      const saved = await saveFile({
        boardName: t('library.personalFileName'),
        data: writeLibraryFile(library.items),
        format: 'library',
      });
      if (saved.status === 'saved') {
        onNotify(
          t('library.exported', { items: t('library.itemCount', { count: library.items.length }) }),
        );
      }
    } catch {
      onNotify(t('library.saveFailed'), 'warn');
    }
  };

  return { importing, importFile, exportPersonal };
}
