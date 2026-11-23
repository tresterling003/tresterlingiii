import { useEffect } from 'react';
import { loadImageFile, UploadError } from './lib/raster/image';
import { beginImport, boot, redo, saveNow, setScreen, stepFrame, toast, undo, useStore, actions } from './state/store';
import { CanvasView } from './components/CanvasView';
import { AboutDialog, CoinFlipDialog, ConsentDialog, ExportDialog, HarmonyDialog, ImportDialog, InbetweenDialog, NewProjectDialog, PoseSheetHost, ShortcutsDialog, TeacherDialog } from './components/Dialogs';
import { LeftToolbar } from './components/LeftToolbar';
import { QuickAnimate } from './components/QuickAnimate';
import { RightPanel } from './components/RightPanel';
import { StartScreen } from './components/StartScreen';
import { Timeline, togglePlay } from './components/Timeline';
import { Toasts } from './components/Toasts';
import { ToolOptions } from './components/ToolOptions';
import { TopBar } from './components/TopBar';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

export function App() {
  const screen = useStore((s) => s.screen);
  const project = useStore((s) => s.project);
  const dialog = useStore((s) => s.dialog);
  const importDraft = useStore((s) => s.importDraft);

  useEffect(() => { void boot(); }, []);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void saveNow(); };
    const onUnload = (e: BeforeUnloadEvent) => {
      const st = actions.get().saveStatus;
      if (st === 'unsaved' || st === 'saving') { void saveNow(); e.preventDefault(); e.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', onUnload); };
  }, []);
  useEffect(() => { if (!project && screen !== 'start') setScreen('start'); }, [project, screen]);
  useKeyboard();
  useDropImport();

  return (
    <div className="h-full flex flex-col">
      {screen === 'start' || !project ? (
        <StartScreen />
      ) : (
        <>
          <TopBar />
          {screen === 'quick' ? <QuickAnimate /> : <Studio />}
        </>
      )}
      {dialog === 'export' && project && <ExportDialog />}
      {dialog === 'harmony' && <HarmonyDialog />}
      {dialog === 'teacher' && <TeacherDialog />}
      {dialog === 'coin' && <CoinFlipDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'about' && <AboutDialog />}
      {dialog === 'newProject' && <NewProjectDialog />}
      {dialog === 'inbetween' && <InbetweenDialog />}
      {importDraft && <ImportDialog />}
      <ConsentDialog />
      <PoseSheetHost />
      <Toasts />
    </div>
  );
}

function Studio() {
  const rightOpen = useStore((s) => s.rightOpen);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex">
        <LeftToolbar />
        <main className="flex-1 min-w-0 flex flex-col relative">
          <ToolOptions />
          <CanvasView />
          <button className="absolute right-2 top-[52px] icon-btn panel border !w-7 !h-7" aria-label={rightOpen ? 'Hide side panel' : 'Show side panel'} title={rightOpen ? 'Hide panel (bigger canvas)' : 'Show panel'} onClick={() => actions.set({ rightOpen: !rightOpen })}>
            {rightOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </button>
        </main>
        {rightOpen && <RightPanel />}
      </div>
      <Timeline />
    </div>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = actions.get();
      if (!s.project || s.screen === 'start') return;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void saveNow().then(() => toast('Saved on this device', 'success', undefined, 1500)); return; }
      if (typing || s.dialog || s.importDraft || s.consentResolve) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      const tools: Record<string, typeof s.tool> = { b: 'draw', e: 'eraser', m: 'select', v: 'move', h: 'hand', p: 'rig' };
      const k = e.key.toLowerCase();
      if (tools[k]) { actions.set({ tool: tools[k] }); return; }
      if (k === 'o') { actions.set({ onion: { ...s.onion, enabled: !s.onion.enabled } }); return; }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
      if (e.key === ',' || e.key === 'ArrowLeft') { if (e.key === ',' || (e.target as HTMLElement) === document.body) { e.preventDefault(); stepFrame(-1); } return; }
      if (e.key === '.' || e.key === 'ArrowRight') { if (e.key === '.' || (e.target as HTMLElement) === document.body) { e.preventDefault(); stepFrame(1); } return; }
      if (e.key === '[') { actions.set(s.tool === 'eraser' ? { eraserSize: Math.max(4, s.eraserSize - 4) } : { brushSize: Math.max(1, s.brushSize - 1) }); return; }
      if (e.key === ']') { actions.set(s.tool === 'eraser' ? { eraserSize: Math.min(120, s.eraserSize + 4) } : { brushSize: Math.min(60, s.brushSize + 1) }); return; }
      if (e.key === '0') { actions.set({ fitToken: s.fitToken + 1 }); return; }
      if (e.key === 'i') { document.querySelector<HTMLInputElement>('[data-testid="toolbar-import"]')?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useDropImport() {
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = async (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      try {
        beginImport(await loadImageFile(f), f.name, actions.get().project ? 'new-frame' : 'new-project');
      } catch (err) {
        toast(err instanceof UploadError ? err.message : 'That file could not be opened.', 'error');
      }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);
}
