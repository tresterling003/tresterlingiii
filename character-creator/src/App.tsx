import { useEffect, useState } from 'react';
import { Quiz } from './components/Quiz';
import { Results } from './components/Results';
import { Emoji, Toon } from './components/Art';
import { QUESTIONS } from './data/questions';
import { isPartComplete, type Answer, type BriefKey } from './lib/brief';
import { EMPTY, clear, load, save, type Saved } from './lib/storage';

const allAnswered = (s: Saved) => QUESTIONS.every((q) => q.parts.every((p) => isPartComplete(p, s.answers[p.id])));

function restore(): Saved {
  const s = load();
  // Never land on a results page that has holes in it.
  if (s.phase === 'results' && !allAnswered(s)) return { ...s, phase: 'quiz', step: 0 };
  return { ...s, step: Math.min(Math.max(0, s.step), QUESTIONS.length - 1) };
}

export function App() {
  const [state, setState] = useState<Saved>(restore);
  useEffect(() => save(state), [state]);

  const started = Object.keys(state.answers).length > 0;
  const set = (patch: Partial<Saved>) => setState((s) => ({ ...s, ...patch }));

  if (state.phase === 'quiz') {
    return (
      <Quiz
        step={state.step}
        answers={state.answers}
        onAnswer={(id: string, a: Answer) => setState((s) => ({ ...s, answers: { ...s.answers, [id]: a } }))}
        onStep={(step) => set({ step })}
        onFinish={() => set({ phase: 'results' })}
        onHome={() => set({ phase: 'intro' })}
      />
    );
  }

  if (state.phase === 'results') {
    return (
      <Results
        answers={state.answers}
        overrides={state.overrides}
        onOverride={(key: BriefKey, value) =>
          setState((s) => {
            const overrides = { ...s.overrides };
            if (value === undefined) delete overrides[key];
            else overrides[key] = value;
            return { ...s, overrides };
          })
        }
        onRetake={() => set({ phase: 'quiz', step: 0 })}
        onStartOver={() => {
          clear();
          setState(EMPTY);
        }}
      />
    );
  }

  const done = allAnswered(state);
  return (
    <div className="intro">
      <main className="intro-inner">
        <p className="eyebrow gold">Digital Arts &amp; Animation 1</p>
        <h1>
          Who’s the cartoon character <em>only you</em> could make?
        </h1>
        <p className="intro-lede">
          Answer {QUESTIONS.length} quick questions. Walk away with an original character, a story idea, and a ready-to-paste prompt for five inspiration sketches.
        </p>

        <div className="cast" aria-hidden="true">
          <Toon style="bouncy" />
          <Toon build="lanky" shape="triangle" colors={{ body: '#F2604C', head: '#FFE2C4' }} />
          <Toon style="cute" />
          <Toon build="broad" shape="square" colors={{ body: '#F5B81C', head: '#7FB2FF' }} />
          <Toon style="anime" />
          <Toon build="pear" shape="mix" colors={{ body: '#12B5A6', head: '#FFF4E0', accent: '#F5B81C' }} />
        </div>

        <div className="intro-cta">
          {started ? (
            <>
              <button className="btn gold big" onClick={() => set({ phase: done ? 'results' : 'quiz' })}>
                {done ? 'See my character →' : 'Pick up where I left off →'}
              </button>
              <button
                className="btn ghost-light"
                onClick={() => {
                  clear();
                  setState({ ...EMPTY, phase: 'quiz' });
                }}
              >
                Start a new character
              </button>
            </>
          ) : (
            <button className="btn gold big" onClick={() => set({ phase: 'quiz', step: 0 })}>
              Start the quiz →
            </button>
          )}
        </div>

        <ul className="intro-facts">
          <li>
            <Emoji name="hourglass-not-done" /> About 5 minutes
          </li>
          <li>
            <Emoji name="locked" /> No login. Your answers stay on this device.
          </li>
          <li>
            <Emoji name="artist-palette" /> You can change everything later
          </li>
        </ul>
      </main>
    </div>
  );
}
