import { useEffect, useRef, useState } from 'react';
import { NAME_IDEAS, PARTS, QUESTIONS, type Option, type Part } from '../data/questions';
import { isPartComplete, type Answer, type Answers } from '../lib/brief';
import { ArtView } from './Art';

interface Props {
  step: number;
  answers: Answers;
  onAnswer: (partId: string, a: Answer) => void;
  onStep: (step: number) => void;
  onFinish: () => void;
  onHome: () => void;
}

const SO_FAR = ['type', 'room', 'world', 'genre', 'strength', 'goal', 'obstacle'];

function soFar(answers: Answers): string[] {
  return SO_FAR.flatMap((id) => {
    const a = answers[id];
    if (!a?.picks.length) return [];
    const o = PARTS[id].options?.find((x) => x.id === a.picks[0]);
    if (o) return [o.tag ?? o.label];
    const t = (a.custom ?? '').trim();
    return t ? [t.length > 26 ? `${t.slice(0, 24)}…` : t] : [];
  });
}

export function Quiz({ step, answers, onAnswer, onStep, onFinish, onHome }: Props) {
  const q = QUESTIONS[step];
  const total = QUESTIONS.length;
  const last = step === total - 1;
  const complete = q.parts.every((p) => isPartComplete(p, answers[p.id]));
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<number>();
  const tags = soFar(answers);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
    return () => window.clearTimeout(timer.current);
  }, [step]);

  const go = (n: number) => {
    window.clearTimeout(timer.current);
    if (n >= total) return onFinish();
    setDir(n > step ? 'fwd' : 'back');
    onStep(Math.max(0, n));
  };

  // One-tap questions move on by themselves, like a personality quiz.
  const autoAdvance = q.parts.length === 1 && q.parts[0].kind === 'single';
  const pickSingle = (p: Part, id: string) => {
    onAnswer(p.id, { picks: [id], custom: answers[p.id]?.custom });
    if (autoAdvance && id !== 'custom' && !last) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => go(step + 1), 420);
    }
  };

  return (
    <div className="quiz">
      <header className="topbar">
        <div className="topbar-row">
          <button className="brand" onClick={onHome} aria-label="Back to the start screen">
            <span className="brand-dot" aria-hidden="true" />
            Character Creator
          </button>
          <span className="count" aria-hidden="true">
            {step + 1} <span>/ {total}</span>
          </span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          aria-valuetext={`Question ${step + 1} of ${total}`}
        >
          <div className="progress-fill" style={{ width: `${((step + (complete ? 1 : 0.5)) / total) * 100}%` }} />
        </div>
      </header>

      <main className="stage">
        <section key={q.id} className={`question slide-${dir}`} aria-labelledby="q-title">
          <p className="eyebrow">{q.eyebrow}</p>
          <h1 id="q-title" ref={titleRef} tabIndex={-1}>
            {q.title}
          </h1>
          {q.subtitle && <p className="subtitle">{q.subtitle}</p>}

          {q.parts.map((p) => (
            <div className="part" key={p.id}>
              {p.kind !== 'text' && p.label && <h2 className="part-label">{p.label}</h2>}
              {p.kind === 'single' && <SinglePart part={p} answer={answers[p.id]} onPick={(id) => pickSingle(p, id)} onCustom={(t) => onAnswer(p.id, { picks: ['custom'], custom: t })} />}
              {p.kind === 'multi' && <MultiPart part={p} answer={answers[p.id]} onChange={(a) => onAnswer(p.id, a)} />}
              {p.kind === 'text' && <TextPart part={p} answer={answers[p.id]} typeId={answers.type?.picks[0]} onChange={(t) => onAnswer(p.id, { picks: [], custom: t })} onEnter={() => complete && go(step + 1)} />}
            </div>
          ))}
        </section>

        {tags.length > 0 && (
          <aside className="sofar" aria-label="Your character so far">
            <span className="sofar-label">So far:</span>
            {tags.map((t, i) => (
              <span className="tag" key={`${t}-${i}`}>
                {t}
              </span>
            ))}
          </aside>
        )}
      </main>

      <nav className="navbar" aria-label="Quiz navigation">
        <div className="navbar-inner">
          <button className="btn ghost" onClick={() => (step === 0 ? onHome() : go(step - 1))}>
            ← Back
          </button>
          <span className="nav-hint" role="status">
            {complete ? '' : hint(q.parts, answers)}
          </span>
          <button className="btn primary" disabled={!complete} onClick={() => go(step + 1)}>
            {last ? 'Reveal my character' : 'Next →'}
          </button>
        </div>
      </nav>
    </div>
  );
}

function hint(parts: Part[], answers: Answers): string {
  const p = parts.find((x) => !isPartComplete(x, answers[x.id]));
  if (!p) return '';
  if (p.kind === 'multi') {
    const n = answers[p.id]?.picks.length ?? 0;
    return `${n} of ${p.min} picked`;
  }
  if (p.kind === 'text') return 'Type an answer to continue';
  if (answers[p.id]?.picks[0] === 'custom') return 'Type your answer to continue';
  return parts.length > 1 && p.label ? `Pick a ${p.label.toLowerCase()}` : 'Pick one to continue';
}

function SinglePart({ part, answer, onPick, onCustom }: { part: Part; answer?: Answer; onPick: (id: string) => void; onCustom: (t: string) => void }) {
  const picked = answer?.picks[0];
  const layout = part.layout ?? 'cards';
  const inputId = `custom-${part.id}`;
  return (
    <>
      <div className={`options ${layout}`}>
        {part.options!.map((o) => (
          <OptionButton key={o.id} option={o} layout={layout} selected={picked === o.id} onClick={() => onPick(o.id)} />
        ))}
        {part.allowCustom && (
          <button type="button" className={`option custom-opt ${picked === 'custom' ? 'selected' : ''}`} aria-pressed={picked === 'custom'} onClick={() => onPick('custom')}>
            <span className="opt-art custom-art" aria-hidden="true">
              ✎
            </span>
            <span className="opt-text">
              <span className="opt-label">{part.customLabel}</span>
              <span className="opt-blurb">Write your own answer.</span>
            </span>
          </button>
        )}
      </div>
      {part.allowCustom && picked === 'custom' && (
        <div className="custom-box">
          <label htmlFor={inputId}>{part.customStem}</label>
          <input id={inputId} type="text" autoFocus autoComplete="off" maxLength={120} placeholder={`e.g. ${part.customPlaceholder}`} value={answer?.custom ?? ''} onChange={(ev) => onCustom(ev.target.value)} />
        </div>
      )}
    </>
  );
}

function OptionButton({ option, layout, selected, onClick }: { option: Option; layout: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`option ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}>
      {option.art && (
        <span className={`opt-art art-${option.art.kind}`}>
          <ArtView art={option.art} />
        </span>
      )}
      <span className="opt-text">
        <span className="opt-label">{option.label}</span>
        {option.blurb && layout !== 'list' && <span className="opt-blurb">{option.blurb}</span>}
      </span>
      <span className="check" aria-hidden="true">
        ✓
      </span>
    </button>
  );
}

function MultiPart({ part, answer, onChange }: { part: Part; answer?: Answer; onChange: (a: Answer) => void }) {
  const picks = answer?.picks ?? [];
  const max = part.max ?? Infinity;
  const full = picks.length >= max;
  const [draft, setDraft] = useState('');
  const toggle = (id: string) => onChange({ picks: picks.includes(id) ? picks.filter((x) => x !== id) : full ? picks : [...picks, id] });
  const add = () => {
    const t = draft.replace(/\s+/g, ' ').trim();
    if (!t || full || picks.includes(`custom:${t}`)) return;
    onChange({ picks: [...picks, `custom:${t}`] });
    setDraft('');
  };
  const customs = picks.filter((x) => x.startsWith('custom:'));
  return (
    <>
      <p className="multi-status" aria-live="polite">
        <strong>
          {picks.length} of {max}
        </strong>{' '}
        picked{full ? '. Tap one again to swap it out.' : ''}
      </p>
      <div className="options chips">
        {customs.map((c) => (
          <button type="button" key={c} className="chip selected" aria-pressed={true} onClick={() => toggle(c)}>
            {c.slice(7)} <span aria-hidden="true">×</span>
            <span className="sr-only"> (your own, tap to remove)</span>
          </button>
        ))}
        {part.options!.map((o) => {
          const on = picks.includes(o.id);
          return (
            <button type="button" key={o.id} className={`chip ${on ? 'selected' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => toggle(o.id)}>
              {o.label}
            </button>
          );
        })}
      </div>
      {part.allowCustom && (
        <div className="custom-box">
          <label htmlFor={`add-${part.id}`}>{part.customLabel}</label>
          <div className="add-row">
            <input
              id={`add-${part.id}`}
              type="text"
              autoComplete="off"
              maxLength={80}
              disabled={full}
              placeholder={full ? 'Unpick one first to add your own' : `e.g. ${part.customPlaceholder}`}
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => ev.key === 'Enter' && add()}
            />
            <button type="button" className="btn small" disabled={full || !draft.trim()} onClick={add}>
              Add
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function TextPart({ part, answer, typeId, onChange, onEnter }: { part: Part; answer?: Answer; typeId?: string; onChange: (t: string) => void; onEnter: () => void }) {
  const id = `text-${part.id}`;
  const surprise = () => {
    const pool = [...(NAME_IDEAS[typeId ?? ''] ?? []), ...NAME_IDEAS.any].filter((n) => n !== answer?.custom);
    onChange(pool[Math.floor(Math.random() * pool.length)]);
  };
  return (
    <div className="text-part">
      <label htmlFor={id}>{part.label}</label>
      <div className="add-row">
        <input id={id} type="text" autoComplete="off" maxLength={part.maxLength} placeholder={part.id === 'name' ? part.customPlaceholder : `e.g. ${part.customPlaceholder}`} value={answer?.custom ?? ''} onChange={(ev) => onChange(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && onEnter()} />
        {part.id === 'name' && (
          <button type="button" className="btn small gold" onClick={surprise}>
            Surprise me
          </button>
        )}
      </div>
    </div>
  );
}
