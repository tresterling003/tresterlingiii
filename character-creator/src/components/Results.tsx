import { useEffect, useMemo, useRef, useState } from 'react';
import { PARTS } from '../data/questions';
import { BRIEF_FIELDS, NEXT_STEPS, REMINDER, briefToText, buildPrompt, finalBrief, generateBrief, type Answers, type Brief, type BriefKey } from '../lib/brief';
import { copyText } from '../lib/clipboard';
import { canRenderInPdf, downloadPdf } from '../lib/pdf';
import { Emoji, Toon } from './Art';

interface Props {
  answers: Answers;
  overrides: Partial<Brief>;
  onOverride: (key: BriefKey, value: string | undefined) => void;
  onRetake: () => void;
  onStartOver: () => void;
}

export function Results({ answers, overrides, onOverride, onRetake, onStartOver }: Props) {
  const base = useMemo(() => generateBrief(answers), [answers]);
  const brief = useMemo(() => finalBrief(answers, overrides), [answers, overrides]);
  const prompt = useMemo(() => buildPrompt(brief), [brief]);
  const briefText = useMemo(() => briefToText(brief), [brief]);

  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState<'brief' | 'prompt' | ''>('');
  const [manual, setManual] = useState<{ title: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number>();
  const briefRef = useRef<HTMLElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  const say = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast('');
      setCopied('');
    }, 2600);
  };

  const copy = async (what: 'brief' | 'prompt') => {
    const text = what === 'brief' ? briefText : prompt;
    if (await copyText(text)) {
      setCopied(what);
      say(what === 'brief' ? 'Character Brief copied.' : 'Prompt copied. Paste it into ChatGPT.');
    } else {
      setManual({ title: what === 'brief' ? 'Copy your Character Brief' : 'Copy your 5-sketch prompt', text });
    }
  };

  const pdf = async () => {
    setBusy(true);
    try {
      if (!canRenderInPdf(`${briefText}\n${prompt}`)) throw new Error('needs-print');
      await downloadPdf(brief, prompt);
      say('PDF downloaded.');
    } catch {
      // Emoji or non-Latin alphabets, or a blocked download: the browser's own PDF printer handles everything.
      say('Choose “Save as PDF” in the print window.');
      window.setTimeout(() => window.print(), 350);
    } finally {
      setBusy(false);
    }
  };

  const toggleEdit = () => {
    setEditing((v) => !v);
    if (!editing) window.setTimeout(() => briefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const paletteArt = PARTS.palette.options?.find((o) => o.id === answers.palette?.picks[0])?.art;
  const sw = paletteArt?.kind === 'swatch' ? paletteArt.colors : ['#1F5FD1', '#F5B81C', '#0B1F4B', '#FFFFFF'];
  const edited = BRIEF_FIELDS.some((f) => overrides[f.key] !== undefined);

  return (
    <div className="results">
      <header className="reveal">
        <div className="reveal-inner">
          <div className="reveal-text">
            <p className="eyebrow gold">Your character concept</p>
            <h1>Meet {brief.name}.</h1>
            <p className="reveal-tagline">
              {[brief.type, brief.genre, brief.setting].filter(Boolean).join(' · ')}
            </p>
            <p className="reveal-story">{brief.story}</p>
            <div className="reveal-cta">
              <a className="btn gold big" href="#sketches">
                Get my 5-sketch prompt ↓
              </a>
            </div>
          </div>
          <figure className="mood">
            <Toon shape={answers.shape?.picks[0]} build={answers.build?.picks[0]} colors={{ body: sw[0], head: sw[1], accent: sw[2] }} />
            <div className="mood-swatch" aria-hidden="true">
              {sw.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
            <figcaption>Shape and color study from your answers. A placeholder, not your character. That part is yours to draw.</figcaption>
          </figure>
        </div>
      </header>

      <main className="results-main">
        <section className="panel" ref={briefRef} aria-labelledby="brief-h">
          <div className="panel-head">
            <div>
              <h2 id="brief-h">Character Brief</h2>
              <p className="muted">An early concept. Change anything that doesn’t feel right.</p>
            </div>
            <button className={`btn ${editing ? 'primary' : 'outline'}`} onClick={toggleEdit}>
              {editing ? '✓ Done Editing' : '✎ Edit My Character'}
            </button>
          </div>

          {editing && (
            <p className="edit-note">
              Type in any box to change it. Your edits flow straight into the prompt and the PDF. If you change the goal or the world, update the story idea to match.{' '}
              <button className="link" onClick={onRetake}>
                Or go back and change my quiz answers
              </button>
            </p>
          )}

          <dl className={`brief ${editing ? 'is-editing' : ''}`}>
            {BRIEF_FIELDS.map((f) => {
              const isEdited = overrides[f.key] !== undefined && overrides[f.key]!.trim() !== '' && overrides[f.key]!.trim() !== base[f.key];
              return (
                <div className={`field ${'short' in f && f.short ? 'short' : ''} field-${f.key}`} key={f.key}>
                  <dt>
                    <label htmlFor={`f-${f.key}`}>{f.label}</label>
                    {isEdited && <span className="badge">edited</span>}
                  </dt>
                  <dd>
                    {editing ? (
                      <>
                        <AutoTextarea
                          id={`f-${f.key}`}
                          value={overrides[f.key] ?? base[f.key]}
                          onChange={(v) => onOverride(f.key, v === base[f.key] ? undefined : v)}
                          onBlur={() => (overrides[f.key] ?? 'x').trim() === '' && onOverride(f.key, undefined)}
                        />
                        {isEdited && (
                          <button className="link small" onClick={() => onOverride(f.key, undefined)}>
                            Reset to my quiz answer
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="value">{brief[f.key]}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="actions" role="group" aria-label="Result actions">
            <button className="btn outline" onClick={() => copy('brief')}>
              {copied === 'brief' ? '✓ Copied' : 'Copy Character Brief'}
            </button>
            <button className="btn primary" onClick={() => copy('prompt')}>
              {copied === 'prompt' ? '✓ Copied' : 'Copy 5-Sketch AI Prompt'}
            </button>
            <button className="btn outline" onClick={toggleEdit}>
              {editing ? 'Done Editing' : 'Edit My Character'}
            </button>
            <button className="btn outline" onClick={pdf} disabled={busy}>
              {busy ? 'Building PDF…' : 'Download Results as PDF'}
            </button>
            <button className="btn danger" onClick={() => setConfirm(true)}>
              Start Over
            </button>
          </div>
        </section>

        <section className="panel sketches" id="sketches" aria-labelledby="sk-h">
          <div className="sk-head">
            <Emoji name="pencil" className="sk-icon" />
            <div>
              <h2 id="sk-h">Generate Your 5 Character Sketches</h2>
              <p>
                This prompt already contains your full Character Brief{edited ? ', including your edits' : ''}. Copy it, then paste it into ChatGPT or another AI tool that can <strong>create images</strong>.
              </p>
            </div>
          </div>
          <button className="btn gold big copy-big" onClick={() => copy('prompt')}>
            {copied === 'prompt' ? '✓ Prompt copied' : 'Copy Prompt'}
          </button>
          <p className="honest">
            <strong>Heads up:</strong> this quiz doesn’t draw anything. Your sketches are made by the AI tool you paste this into, and it has to support image generation. If it answers with only text, reply “Please generate the image.”
          </p>
          <details className="prompt-details" open>
            <summary>Your prompt (read-only preview)</summary>
            <pre className="prompt" tabIndex={0} aria-label="Your 5-sketch prompt">
              {prompt}
            </pre>
          </details>
        </section>

        <section className="panel next" aria-labelledby="next-h">
          <h2 id="next-h">What To Do Next</h2>
          <ol className="steps">
            {NEXT_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <blockquote className="reminder">“{REMINDER}”</blockquote>
        </section>

        <footer className="credits">
          <p>Your answers stay in this browser. Nothing is uploaded and there is no account.</p>
          <p>
            Card illustrations: Fluent Emoji by Microsoft (MIT License). Character figures and all quiz text are original to this project. Fonts: Bricolage Grotesque and Figtree (SIL Open Font License).
          </p>
        </footer>
      </main>

      {/* Used only when the browser prints the page (the Save-as-PDF fallback). */}
      <section className="print-sheet" aria-hidden="true">
        <h1>{brief.name}: Character Brief</h1>
        <pre>{briefText.replace(/^CHARACTER BRIEF\n\n/, '')}</pre>
        <h2>Generate Your 5 Character Sketches</h2>
        <p>Paste this prompt into ChatGPT or another AI tool that can create images.</p>
        <pre>{prompt}</pre>
        <h2>What To Do Next</h2>
        <ol>
          {NEXT_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p>
          <em>{REMINDER}</em>
        </p>
      </section>

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>

      {manual && (
        <Modal title={manual.title} onClose={() => setManual(null)}>
          <p>Your browser blocked automatic copying. Press and hold (or right-click) the text below, choose Select All, then Copy.</p>
          <textarea className="manual" readOnly value={manual.text} ref={(el) => el?.select()} onFocus={(ev) => ev.target.select()} />
          <div className="modal-actions">
            <button className="btn primary" onClick={() => setManual(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title="Start over?" onClose={() => setConfirm(false)}>
          <p>This erases {brief.name} and all of your answers from this device. Download the PDF first if you want to keep them.</p>
          <div className="modal-actions">
            <button className="btn outline" onClick={() => setConfirm(false)}>
              Keep my character
            </button>
            <button className="btn danger solid" onClick={onStartOver}>
              Yes, start over
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AutoTextarea({ id, value, onChange, onBlur }: { id: string; value: string; onChange: (v: string) => void; onBlur: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea id={id} ref={ref} rows={1} value={value} maxLength={600} onChange={(ev) => onChange(ev.target.value)} onBlur={onBlur} />;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="scrim" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
