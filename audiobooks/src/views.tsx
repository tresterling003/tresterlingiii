import { useEffect, useMemo, useRef, useState } from 'react';
import { GENRES, getBook, itemPage, searchBooks, coverThumb, type BookDetail, type BookSummary } from './api';
import { playBook, toggle, usePlayer, goToChapter } from './player';
import {
  deleteBookmark, editBookmark, elapsedInBook, getState, progress, removeBook, saveBook, setFinished, setState,
  useStore, type SavedBook,
} from './store';
import { Bar, clock, Cover, go, ICheck, ILeft, IPause, IPlay, IPlus, ISearch, IX, length } from './ui';

// ---------------------------------------------------------------- Library
export function Library() {
  const books = useStore((s) => s.books);
  const currentId = useStore((s) => s.currentId);
  const list = useMemo(
    () => Object.values(books).sort((a, b) => (b.lastPlayedAt || b.addedAt) - (a.lastPlayedAt || a.addedAt)),
    [books],
  );
  const current = (currentId && books[currentId]) || list.find((b) => b.lastPlayedAt && !b.finished) || null;
  const rest = list.filter((b) => b !== current);

  if (!list.length) return <EmptyShelf />;

  return (
    <div className="page">
      <h1 className="title">Your shelf</h1>
      {current && <ContinueCard book={current} />}
      {rest.length > 0 && (
        <>
          <h2 className="section">{current ? 'Also on your shelf' : 'On your shelf'}</h2>
          <ul className="shelf">
            {rest.map((b) => (
              <li key={b.id}>
                <a className="shelf-item" href={`#book/${encodeURIComponent(b.id)}`}>
                  <Cover src={b.cover} title={b.title} />
                  <span className="shelf-meta">
                    <strong>{b.title}</strong>
                    <span className="muted">{b.author}</span>
                    {b.finished ? (
                      <span className="tag"><ICheck size={14} /> Finished</span>
                    ) : b.lastPlayedAt ? (
                      <>
                        <Bar value={progress(b)} />
                        <span className="muted small">{length(b.total - elapsedInBook(b))} left</span>
                      </>
                    ) : (
                      <span className="muted small">Not started · {length(b.total)}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ContinueCard({ book }: { book: SavedBook }) {
  const p = usePlayer();
  const active = p.bookId === book.id;
  const ch = active ? p.ch : book.ch;
  const pos = active ? p.time : book.pos;
  const left = book.total - elapsedInBook(book, ch, pos);
  const playing = active && (p.playing || p.loading);
  return (
    <section className="continue">
      <a href={`#book/${encodeURIComponent(book.id)}`} className="continue-cover" aria-label={`${book.title} details`}>
        <Cover src={book.cover} title={book.title} />
      </a>
      <div className="continue-body">
        <span className="eyebrow">{book.lastPlayedAt ? 'Continue listening' : 'Up next'}</span>
        <a href={`#book/${encodeURIComponent(book.id)}`} className="continue-title">{book.title}</a>
        <span className="muted">{book.author}</span>
        <span className="small">{book.chapters[ch]?.title} · {clock(pos)}</span>
        <Bar value={book.total ? elapsedInBook(book, ch, pos) / book.total : 0} />
        <span className="muted small">{book.finished ? 'Finished' : `${length(left)} left`}</span>
        <button className="btn primary" onClick={() => (active ? toggle() : playBook(book))}>
          {playing ? <IPause size={18} /> : <IPlay size={18} />}
          {playing ? 'Pause' : book.lastPlayedAt && !book.finished ? 'Resume' : 'Play'}
        </button>
      </div>
    </section>
  );
}

function EmptyShelf() {
  return (
    <div className="page">
      <section className="hero">
        <h1 className="title">Free audiobooks, read by people who love them</h1>
        <p>
          Earshot plays the 18,000+ English recordings in the LibriVox catalogue: public-domain classics read by
          volunteers. Pick a book and it lands here, with your place saved.
        </p>
        <button className="btn primary" onClick={() => go('browse')}><ISearch size={18} /> Find a book</button>
      </section>
      <h2 className="section">Most listened to</h2>
      <Results query="" genre="" rows={12} />
    </div>
  );
}

// ---------------------------------------------------------------- Browse
export function Browse() {
  const english = useStore((s) => s.english);
  const [text, setText] = useState(() => sessionStorage.getItem('earshot:q') ?? '');
  const [query, setQuery] = useState(text);
  const [genre, setGenre] = useState(() => sessionStorage.getItem('earshot:g') ?? '');

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 350);
    sessionStorage.setItem('earshot:q', text);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => sessionStorage.setItem('earshot:g', genre), [genre]);

  return (
    <div className="page">
      <h1 className="title">Browse LibriVox</h1>
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(text.trim()); (document.activeElement as HTMLElement)?.blur(); }}>
        <ISearch size={20} />
        <input
          id="search" type="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Title or author" aria-label="Search by title or author" autoComplete="off" enterKeyHint="search"
        />
        {text && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setText('')}><IX size={18} /></button>}
      </form>
      <div className="chips" role="group" aria-label="Genre">
        {['', ...GENRES].map((g) => (
          <button key={g || 'all'} className={`chip ${genre === g ? 'on' : ''}`} aria-pressed={genre === g} onClick={() => setGenre(g)}>
            {g || 'All'}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={english} onChange={(e) => setState((s) => ({ ...s, english: e.target.checked }))} />
        English only
      </label>
      <Results query={query} genre={genre} english={english} />
    </div>
  );
}

function Results({ query, genre, english = true, rows = 24 }: { query: string; genre: string; english?: boolean; rows?: number }) {
  const [items, setItems] = useState<BookSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const key = `${query}|${genre}|${english}`;
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
    setPage(1);
    setItems([]);
  }, [key]);

  useEffect(() => {
    const ac = new AbortController();
    setStatus('loading');
    searchBooks({ query, genre, english, page, rows }, ac.signal)
      .then((r) => {
        if (keyRef.current !== key) return;
        setTotal(r.total);
        setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))]));
        setStatus('ok');
      })
      .catch((e) => e.name !== 'AbortError' && setStatus('error'));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, retry]);

  if (status === 'error' && !items.length)
    return (
      <div className="notice">
        <p>Couldn't reach LibriVox. Check your connection.</p>
        <button className="btn" onClick={() => setRetry((r) => r + 1)}>Try again</button>
      </div>
    );
  if (status === 'ok' && !items.length)
    return <p className="notice">No books match{query ? ` “${query}”` : ''}{genre ? ` in ${genre}` : ''}. Try fewer words or another genre.</p>;

  return (
    <>
      {status === 'ok' && (query || genre) && <p className="muted small count">{total.toLocaleString()} books</p>}
      <ul className="grid" aria-busy={status === 'loading'}>
        {items.map((b) => (
          <li key={b.id}>
            <a className="card" href={`#book/${encodeURIComponent(b.id)}`}>
              <Cover src={coverThumb(b.id)} title={b.title} />
              <strong>{b.title}</strong>
              <span className="muted small">{b.author}</span>
              {b.runtime > 0 && <span className="muted small">{length(b.runtime)}</span>}
            </a>
          </li>
        ))}
        {status === 'loading' &&
          Array.from({ length: items.length ? 4 : 8 }, (_, i) => (
            <li key={`s${i}`} className="card skeleton" aria-hidden="true"><div className="cover" /><span /><span /></li>
          ))}
      </ul>
      {status === 'ok' && items.length < total && items.length >= rows && (
        <button className="btn wide" onClick={() => setPage((p) => p + 1)}>Show more</button>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Book
export function Book({ id }: { id: string }) {
  const saved = useStore((s) => s.books[id]);
  const p = usePlayer();
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setDetail(null);
    setError('');
    getBook(id, ac.signal)
      .then((d) => {
        setDetail(d);
        // Keep the shelf copy's chapter list fresh.
        if (getState().books[id]) saveBook(d);
      })
      .catch((e) => e.name !== 'AbortError' && setError(e.message || "Couldn't load this book."));
    return () => ac.abort();
  }, [id]);

  useEffect(() => window.scrollTo(0, 0), [id]);

  const title = detail?.title ?? saved?.title ?? '';
  const author = detail?.author ?? saved?.author ?? '';
  const cover = detail?.cover ?? saved?.cover ?? coverThumb(id);
  const chapters = detail?.chapters ?? saved?.chapters ?? [];
  const total = detail?.total ?? saved?.total ?? 0;
  const active = p.bookId === id;
  const playing = active && (p.playing || p.loading);
  const curCh = active ? p.ch : saved?.ch ?? 0;
  const curPos = active ? p.time : saved?.pos ?? 0;
  const started = !!saved?.lastPlayedAt && !saved.finished;

  const ensureSaved = () => saved ?? (detail ? saveBook(detail) : null);
  const playFrom = (ch: number, pos = 0) => {
    const b = ensureSaved();
    if (!b) return;
    if (active && ch === p.ch) {
      if (pos !== p.time) goToChapter(ch, pos);
      if (!playing) toggle();
      return;
    }
    playBook(b, ch, pos);
  };
  const mainAction = () => {
    if (active) return toggle();
    const b = ensureSaved();
    if (b) playBook(b);
  };

  if (error && !saved)
    return (
      <div className="page">
        <BackLink />
        <p className="notice">{error}</p>
      </div>
    );

  const desc = detail?.description ?? '';
  const long = desc.length > 420;

  return (
    <div className="page book">
      <BackLink />
      <header className="book-head">
        <Cover src={cover} title={title} className="big" />
        <div className="book-info">
          <h1 className="title">{title || <span className="skeleton-line" />}</h1>
          <p className="author">{author}</p>
          <p className="muted small">
            {[length(total), chapters.length ? `${chapters.length} ${chapters.length === 1 ? 'part' : 'parts'}` : '', 'LibriVox']
              .filter(Boolean).join(' · ')}
          </p>
          {saved && !saved.finished && saved.lastPlayedAt > 0 && (
            <div className="book-progress">
              <Bar value={total ? elapsedInBook({ chapters, ch: curCh, pos: curPos }) / total : 0} />
              <span className="muted small">{length(total - elapsedInBook({ chapters, ch: curCh, pos: curPos }))} left</span>
            </div>
          )}
          <div className="actions">
            <button className="btn primary" onClick={mainAction} disabled={!chapters.length}>
              {playing ? <IPause size={18} /> : <IPlay size={18} />}
              {playing ? 'Pause' : started || active ? 'Resume' : saved?.finished ? 'Listen again' : 'Play'}
            </button>
            {saved ? (
              confirmRemove ? (
                <span className="confirm">
                  <button className="btn danger" onClick={() => { removeBook(id); setConfirmRemove(false); }}>Remove</button>
                  <button className="btn" onClick={() => setConfirmRemove(false)}>Keep</button>
                </span>
              ) : (
                <button className="btn" onClick={() => setConfirmRemove(true)}><ICheck size={18} /> On shelf</button>
              )
            ) : (
              <button className="btn" onClick={() => detail && saveBook(detail)} disabled={!detail}><IPlus size={18} /> Add to shelf</button>
            )}
          </div>
          {saved && saved.lastPlayedAt > 0 && (
            <button className="link small" onClick={() => setFinished(id, !saved.finished)}>
              {saved.finished ? 'Mark as not finished' : 'Mark as finished'}
            </button>
          )}
        </div>
      </header>

      {saved && saved.bookmarks.length > 0 && (
        <section>
          <h2 className="section">Bookmarks</h2>
          <ul className="marks">
            {[...saved.bookmarks].sort((a, b) => a.ch - b.ch || a.pos - b.pos).map((m) => (
              <li key={m.id}>
                <button className="mark-play" onClick={() => playFrom(m.ch, m.pos)} aria-label={`Play from bookmark at ${clock(m.pos)}`}>
                  <IPlay size={16} />
                </button>
                <div>
                  <span className="small">{chapters[m.ch]?.title ?? `Part ${m.ch + 1}`} · {clock(m.pos)}</span>
                  <input
                    className="note" value={m.note} placeholder="Add a note" aria-label="Bookmark note"
                    onChange={(e) => editBookmark(id, m.id, e.target.value)}
                  />
                </div>
                <button className="icon-btn" aria-label="Delete bookmark" onClick={() => deleteBookmark(id, m.id)}><IX size={18} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {desc && (
        <section>
          <h2 className="section">About this book</h2>
          <p className={`desc ${long && !more ? 'clamped' : ''}`}>{desc}</p>
          {long && <button className="link" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Read more'}</button>}
        </section>
      )}

      <section>
        <h2 className="section">Chapters</h2>
        {!chapters.length && !error && <p className="muted">Loading chapters…</p>}
        {error && <p className="notice">{error}</p>}
        <ol className="chapters">
          {chapters.map((c, i) => {
            const isCur = (active || started) && i === curCh;
            const done = saved && !saved.finished && saved.lastPlayedAt > 0 && i < curCh;
            return (
              <li key={c.url} className={isCur ? 'current' : done ? 'done' : ''}>
                <button onClick={() => playFrom(i, isCur ? curPos : 0)}>
                  <span className="num">{isCur && playing ? <IPause size={14} /> : i + 1}</span>
                  <span className="ch-title">{c.title}</span>
                  <span className="muted small time">{isCur ? `${clock(curPos)} / ` : ''}{clock(c.dur)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="muted small credit">
          Recording from LibriVox, hosted by the Internet Archive. <a href={itemPage(id)} target="_blank" rel="noreferrer">See it on archive.org</a>
        </p>
      </section>
    </div>
  );
}

// Counts in-app navigations so Back never leaves the app.
let navCount = 0;
window.addEventListener('hashchange', () => navCount++);

function BackLink() {
  return (
    <button className="back" onClick={() => (navCount > 0 ? history.back() : go(''))}>
      <ILeft size={18} /> Back
    </button>
  );
}
