// Undo/redo as a stack of closures. Bitmap edits store only the changed rectangle to save memory
// on Chromebooks; the stack is also capped by an approximate byte budget.
export interface HistoryEntry { label: string; undo: () => void; redo: () => void; bytes: number }

const MAX_ENTRIES = 80;
const MAX_BYTES = 160 * 1024 * 1024;

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  onChange: () => void = () => {};

  push(e: HistoryEntry) {
    this.past.push(e);
    this.future = [];
    let bytes = this.past.reduce((s, x) => s + x.bytes, 0);
    while (this.past.length > MAX_ENTRIES || (bytes > MAX_BYTES && this.past.length > 1)) {
      bytes -= this.past.shift()!.bytes;
    }
    this.onChange();
  }
  undo(): string | null {
    const e = this.past.pop();
    if (!e) return null;
    e.undo();
    this.future.push(e);
    this.onChange();
    return e.label;
  }
  redo(): string | null {
    const e = this.future.pop();
    if (!e) return null;
    e.redo();
    this.past.push(e);
    this.onChange();
    return e.label;
  }
  clear() {
    this.past = [];
    this.future = [];
    this.onChange();
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoLabel() { return this.past[this.past.length - 1]?.label; }
  get redoLabel() { return this.future[this.future.length - 1]?.label; }
}

export const history = new History();
