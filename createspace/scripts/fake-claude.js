// TEST-ONLY stand-in for the hosting platform's services (window.claude), injected by scripts/e2e.mjs.
// It mimics the parts CreateSpace uses: db (documents, collections, live snapshots, privacy of
// data/users/<id> and of other people's suggestions), assets (upload/delete with the same type and
// size limits), downloads (records saves) and user (id, owner, names).
// Data lives in localStorage so it survives reloads and is shared by pages in the same test browser.
// It is NEVER included in the app build.
(() => {
  const cfg = () => Object.assign({ userId: 'u_owner', isOwner: true, canUpload: true, downloads: true, signedOut: false }, window.__FAKE_CLAUDE_CONFIG__ || {});
  const DB_KEY = 'fake-claude:db';
  const AS_KEY = 'fake-claude:assets';
  const load = (k) => JSON.parse(localStorage.getItem(k) || '{}');
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const listeners = new Set();
  const notify = () => setTimeout(() => listeners.forEach((l) => l()), 0);
  window.addEventListener('storage', (e) => e.key === DB_KEY && notify());
  window.__downloads = [];

  const segs = (p) => p.split('/');
  const canRead = (path) => {
    const s = segs(path), c = cfg();
    if (s[0] === 'data' && s[1] === 'users') return s[2] === c.userId;
    if (s[0] === 'suggestions' && s.length >= 2) return c.isOwner || s[1] === c.userId;
    return true;
  };
  const canWrite = (path) => {
    const s = segs(path), c = cfg();
    if (s[0] === 'data' && s[1] === 'users') return s[2] === c.userId;
    if (s[0] === 'suggestions') return c.isOwner || s[1] === c.userId;
    return true;
  };
  const denied = () => Promise.reject({ code: 'invalid_argument', message: 'not allowed' });
  const meta = { fromCache: false, hasPendingWrites: false };
  const snap = (path) => {
    const data = canRead(path) ? load(DB_KEY)[path] : undefined;
    return { id: segs(path).at(-1), exists: data !== undefined, data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined), metadata: meta };
  };
  const rid = () => Math.random().toString(36).slice(2, 12);

  const docRef = (path) => {
    if (segs(path).length % 2) throw new TypeError('document paths need an even number of segments: ' + path);
    return {
      id: segs(path).at(-1),
      path,
      get: async () => snap(path),
      set: async (data) => {
        if (!canWrite(path)) return denied();
        const all = load(DB_KEY);
        all[path] = JSON.parse(JSON.stringify(data));
        save(DB_KEY, all);
        notify();
      },
      update: async (data) => {
        if (!canWrite(path)) return denied();
        const all = load(DB_KEY);
        if (!all[path]) return Promise.reject({ code: 'invalid_argument', message: 'missing' });
        all[path] = Object.assign(all[path], data);
        save(DB_KEY, all);
        notify();
      },
      delete: async () => {
        if (!canWrite(path)) return denied();
        const all = load(DB_KEY);
        delete all[path];
        save(DB_KEY, all);
        notify();
      },
      onSnapshot: (next) => {
        let last;
        const fire = () => {
          const s = snap(path);
          const key = JSON.stringify([s.exists, s.data()]);
          if (key !== last) (last = key), next(s);
        };
        listeners.add(fire);
        setTimeout(fire, 0);
        return () => listeners.delete(fire);
      },
    };
  };

  const collRef = (path) => {
    if (segs(path).length % 2 === 0) throw new TypeError('collection paths need an odd number of segments: ' + path);
    const query = () => {
      const n = segs(path).length + 1;
      const docs = Object.keys(load(DB_KEY))
        .filter((p) => p.startsWith(path + '/') && segs(p).length === n && canRead(p))
        .sort()
        .map(snap);
      return { docs, size: docs.length, empty: !docs.length, metadata: meta, docChanges: () => [] };
    };
    const q = {
      path,
      doc: (id) => docRef(path + '/' + (id || rid())),
      orderBy: () => q,
      limit: () => q,
      where: () => q,
      get: async () => query(),
      onSnapshot: (next) => {
        let last;
        const fire = () => {
          const s = query();
          const key = JSON.stringify(s.docs.map((d) => [d.id, d.data()]));
          if (key !== last) (last = key), next(s);
        };
        listeners.add(fire);
        setTimeout(fire, 0);
        return () => listeners.delete(fire);
      },
    };
    return q;
  };

  const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf', 'font/ttf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'];
  const assets = {
    upload: (blob, opts = {}) =>
      new Promise((resolve, reject) => {
        const type = opts.type || blob.type;
        if (!TYPES.includes(type)) return reject({ code: 'unsupported_type', message: type });
        if (blob.size > 20 * 1024 * 1024) return reject({ code: 'too_large', message: 'too large' });
        const r = new FileReader();
        r.onload = () => {
          const id = rid() + rid();
          const all = load(AS_KEY);
          all[id] = { url: r.result, type, size: blob.size };
          save(AS_KEY, all);
          resolve({ id, url: r.result, sizeBytes: blob.size, contentType: type });
        };
        r.readAsDataURL(new Blob([blob], { type }));
      }),
    list: async () => {
      const all = load(AS_KEY);
      return { assets: Object.keys(all).map((id) => ({ id })), usage: { files: Object.keys(all).length, bytes: 0, maxFiles: 1000, maxBytes: 1e9 } };
    },
    delete: async (id) => {
      const all = load(AS_KEY);
      const had = !!all[id];
      delete all[id];
      save(AS_KEY, all);
      return { deleted: had };
    },
  };

  const NAMES = { u_owner: 'Owner Person', u_guest: 'Guest Person' };
  const user = {
    id: async () => (cfg().signedOut ? null : cfg().userId),
    isOwner: async () => cfg().isOwner,
    canEdit: async () => cfg().isOwner,
    can: async () => null,
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, { id, name: NAMES[id] || '', avatarUrl: '' }])),
  };
  const downloads = {
    save: async ({ filename, data }) => {
      window.__downloads.push({ filename, size: data.size ?? data.length });
      return { status: 'saved' };
    },
  };

  window.claude = {
    use: async (name) => {
      const c = cfg();
      if (name === 'db') return c.signedOut ? null : { doc: docRef, collection: collRef };
      if (name === 'assets') return c.canUpload && !c.signedOut ? assets : null;
      if (name === 'downloads') return c.downloads ? downloads : null;
      if (name === 'user') return user;
      return null;
    },
    assetUrl: (id) => (load(AS_KEY)[id] || {}).url || 'data:,missing',
  };
})();
