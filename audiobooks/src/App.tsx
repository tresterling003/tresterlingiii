import { useEffect, useState } from 'react';
import {
  addBookmark, elapsedInBook, getState, useStore,
} from './store';
import {
  cue, getPlayer, goToChapter, play, seek, setSleep, setSpeed, skip, SKIP_BACK, SKIP_FORWARD, SPEEDS, toggle, usePlayer, eject,
} from './player';
import { Book, Browse, Home, Kids } from './views';
import {
  clock, Cover, IBack, IDown, IFwd, IHome, IKids, IList, IMark, IMoon, INext, IPause, IPlay, IPrev, ISearch, IX, length,
} from './ui';

function useRoute() {
  const read = () => decodeURIComponent(location.hash.replace(/^#/, ''));
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const [sheet, setSheet] = useState(false);
  const p = usePlayer();

  // Put the last book back in the player (paused) when the app opens.
  useEffect(() => {
    const s = getState();
    const b = s.currentId ? s.books[s.currentId] : null;
    if (b && !getPlayer().bookId) cue(b);
  }, []);

  useEffect(() => {
    if (sheet) setSheet(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const bookId = route.startsWith('book/') ? route.slice(5) : null;
  const tab = bookId ? null : route === 'browse' || route === 'kids' ? route : 'home';

  return (
    <div className={`app ${p.bookId ? 'has-player' : ''}`}>
      <header className="topbar">
        <a href="#" className="brand" aria-label="Earshot home">
          <Logo /> Earshot
        </a>
      </header>
      <main>
        {bookId ? <Book id={bookId} key={bookId} /> : tab === 'browse' ? <Browse /> : tab === 'kids' ? <Kids /> : <Home />}
      </main>
      {p.bookId && <MiniPlayer onOpen={() => setSheet(true)} />}
      <nav className="tabs" aria-label="Sections">
        {([['home', '#', 'Home', IHome], ['kids', '#kids', 'Kids', IKids], ['browse', '#browse', 'Browse', ISearch]] as const).map(([key, href, label, Icon]) => (
          <a key={key} href={href} className={tab === key ? 'on' : ''} aria-current={tab === key ? 'page' : undefined}
            onClick={() => tab === key && window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Icon size={22} /> {label}
          </a>
        ))}
      </nav>
      {sheet && p.bookId && <PlayerSheet onClose={() => setSheet(false)} />}
    </div>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--wine)" />
      <path d="M23 44c0-10 0-20 9-20s9 7 9 11c0 6-6 6-6 12a6 6 0 0 1-12-3Z" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M44 17a20 20 0 0 1 6 15M47 9a28 28 0 0 1 9 23" fill="none" stroke="var(--sun)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const p = usePlayer();
  const b = useStore((s) => (p.bookId ? s.books[p.bookId] : undefined));
  if (!b) return null;
  const pct = p.duration ? (p.time / p.duration) * 100 : 0;
  return (
    <div className="mini" role="region" aria-label="Now playing">
      <div className="mini-progress"><span style={{ width: `${pct}%` }} /></div>
      <button className="mini-open" onClick={onOpen} aria-label="Open player">
        <Cover src={b.cover} title={b.title} />
        <span className="mini-text">
          <strong>{b.title}</strong>
          <span className="small">{p.error ? p.error : `${b.chapters[p.ch]?.title ?? ''} · ${clock(p.time)}`}</span>
        </span>
      </button>
      <button className="icon-btn" onClick={() => skip(-SKIP_BACK)} aria-label={`Back ${SKIP_BACK} seconds`}><IBack sec={SKIP_BACK} size={26} /></button>
      <button className="icon-btn play" onClick={toggle} aria-label={p.playing || p.loading ? 'Pause' : 'Play'}>
        {p.loading ? <span className="spinner" /> : p.playing ? <IPause size={22} /> : <IPlay size={22} />}
      </button>
    </div>
  );
}

function PlayerSheet({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const speed = useStore((s) => s.speed);
  const b = useStore((s) => (p.bookId ? s.books[p.bookId] : undefined));
  const [menu, setMenu] = useState<null | 'speed' | 'sleep'>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [flash, setFlash] = useState('');
  const [, tick] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (menu ? setMenu(null) : onClose());
    document.addEventListener('keydown', onKey);
    document.body.classList.add('locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
    };
  }, [menu, onClose]);

  useEffect(() => {
    if (p.sleep.mode !== 'timer') return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [p.sleep.mode]);

  if (!b) return null;
  const t = scrub ?? p.time;
  const dur = p.duration || b.chapters[p.ch]?.dur || 0;
  const bookLeft = (b.total - elapsedInBook(b, p.ch, t)) / speed;
  const sleepLabel =
    p.sleep.mode === 'timer' ? clock(Math.max(0, (p.sleep.endsAt - Date.now()) / 1000))
      : p.sleep.mode === 'chapter' ? 'End of chapter' : 'Sleep';

  const mark = () => {
    addBookmark(b.id, p.ch, p.time);
    setFlash(`Bookmarked at ${clock(p.time)}`);
    setTimeout(() => setFlash(''), 2200);
  };

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Player">
      <div className="sheet-top">
        <button className="icon-btn" onClick={onClose} aria-label="Close player"><IDown size={28} /></button>
        <span className="small muted">Part {p.ch + 1} of {b.chapters.length}</span>
        <button className="icon-btn" onClick={() => { eject(); onClose(); }} aria-label="Stop and close"><IX size={22} /></button>
      </div>

      <div className="sheet-art">
        <Cover src={b.cover} title={b.title} className="big" />
      </div>

      <div className="sheet-meta">
        <h2>{b.chapters[p.ch]?.title}</h2>
        <a href={`#book/${encodeURIComponent(b.id)}`} onClick={onClose}>{b.title}</a>
        <span className="muted">{b.author}</span>
      </div>

      <div className="scrubber">
        <input
          type="range" min={0} max={Math.max(1, Math.floor(dur))} step={1} value={Math.floor(t)}
          aria-label="Position in chapter" aria-valuetext={`${clock(t)} of ${clock(dur)}`}
          style={{ ['--fill' as string]: `${dur ? (t / dur) * 100 : 0}%` }}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={() => { if (scrub != null) { seek(scrub); setScrub(null); } }}
          onKeyUp={() => { if (scrub != null) { seek(scrub); setScrub(null); } }}
          onBlur={() => { if (scrub != null) { seek(scrub); setScrub(null); } }}
        />
        <div className="times small">
          <span>{clock(t)}</span>
          <span className="muted">{bookLeft > 0 ? `${length(bookLeft)} left in book` : ''}</span>
          <span>-{clock(dur - t)}</span>
        </div>
      </div>

      {p.error && (
        <div className="notice error">
          {p.error} <button className="btn" onClick={play}>Retry</button>
        </div>
      )}

      <div className="transport">
        <button className="icon-btn" onClick={() => (p.time > 5 ? seek(0) : goToChapter(p.ch - 1))} disabled={p.ch === 0 && p.time <= 5} aria-label="Previous chapter"><IPrev size={26} /></button>
        <button className="icon-btn" onClick={() => skip(-SKIP_BACK)} aria-label={`Back ${SKIP_BACK} seconds`}><IBack sec={SKIP_BACK} size={36} /></button>
        <button className="big-play" onClick={toggle} aria-label={p.playing || p.loading ? 'Pause' : 'Play'}>
          {p.loading ? <span className="spinner" /> : p.playing ? <IPause size={34} /> : <IPlay size={34} />}
        </button>
        <button className="icon-btn" onClick={() => skip(SKIP_FORWARD)} aria-label={`Forward ${SKIP_FORWARD} seconds`}><IFwd sec={SKIP_FORWARD} size={36} /></button>
        <button className="icon-btn" onClick={() => goToChapter(p.ch + 1)} disabled={p.ch >= b.chapters.length - 1} aria-label="Next chapter"><INext size={26} /></button>
      </div>

      <div className="tools">
        <button className={`tool ${speed !== 1 ? 'on' : ''}`} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} aria-expanded={menu === 'speed'}>
          <span className="speed-num">{speed}×</span> Speed
        </button>
        <button className={`tool ${p.sleep.mode !== 'off' ? 'on' : ''}`} onClick={() => setMenu(menu === 'sleep' ? null : 'sleep')} aria-expanded={menu === 'sleep'}>
          <IMoon size={20} /> {sleepLabel}
        </button>
        <button className="tool" onClick={mark}><IMark size={20} /> Bookmark</button>
        <a className="tool" href={`#book/${encodeURIComponent(b.id)}`} onClick={onClose}><IList size={20} /> Chapters</a>
      </div>

      {flash && <div className="toast" role="status">{flash}</div>}

      {menu && (
        <div className="menu-wrap" onClick={() => setMenu(null)}>
          <div className="menu" role="menu" onClick={(e) => e.stopPropagation()}>
            {menu === 'speed' ? (
              <>
                <h3>Playback speed</h3>
                <div className="menu-grid">
                  {SPEEDS.map((r) => (
                    <button key={r} role="menuitemradio" aria-checked={r === speed} className={`chip ${r === speed ? 'on' : ''}`}
                      onClick={() => { setSpeed(r); setMenu(null); }}>{r}×</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3>Sleep timer</h3>
                <div className="menu-grid">
                  {[5, 15, 30, 45, 60, 90].map((m) => (
                    <button key={m} role="menuitem" className={`chip ${p.sleep.mode === 'timer' && p.sleep.minutes === m ? 'on' : ''}`}
                      onClick={() => { setSleep({ mode: 'timer', minutes: m, endsAt: Date.now() + m * 60_000 }); setMenu(null); }}>{m} min</button>
                  ))}
                  <button role="menuitem" className={`chip ${p.sleep.mode === 'chapter' ? 'on' : ''}`}
                    onClick={() => { setSleep({ mode: 'chapter' }); setMenu(null); }}>End of chapter</button>
                  {p.sleep.mode !== 'off' && (
                    <button role="menuitem" className="chip" onClick={() => { setSleep({ mode: 'off' }); setMenu(null); }}>Turn off</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
