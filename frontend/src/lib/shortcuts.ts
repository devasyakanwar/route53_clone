export interface ShortcutHandlers {
  create?: () => void;
  refresh?: () => void;
  delete?: () => void;
  focusFilter?: () => void;
  escape?: () => void;
}

export const SHORTCUT_LIST: { keys: string; description: string }[] = [
  { keys: '?', description: 'Show keyboard shortcuts' },
  { keys: 'Alt+S', description: 'Focus the search bar in the top navigation' },
  { keys: '/', description: 'Focus the table filter' },
  { keys: 'c', description: 'Create (hosted zone or record, depending on the page)' },
  { keys: 'r', description: 'Refresh the table' },
  { keys: 'Delete', description: 'Delete the selected items' },
  { keys: 'Esc', description: 'Close the open modal or split panel' },
  { keys: 'g then z', description: 'Go to Hosted zones' },
  { keys: 'g then d', description: 'Go to Dashboard' },
];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Focus the first Cloudscape filter input on the page (property filter or text filter). */
export function focusFirstFilter(): void {
  const input = document.querySelector<HTMLInputElement>('[data-shortcut="filter"] input');
  input?.focus();
}
