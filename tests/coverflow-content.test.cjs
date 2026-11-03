'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const path = require('node:path');

// A small DOM fixture exercises the actual flip, list and gesture handlers.
// It deliberately does not stand in for visual rendering or mobile Safari.
class Node {
    constructor(tag = 'div', className = '', text = '') {
        this.tagName = tag.toUpperCase(); this.className = className; this.textContent = text;
        this.children = []; this.dataset = {}; this.style = { setProperty(key, value) { this[key] = value; } }; this.attributes = {};
        this.events = {}; this.scrollTop = 0; this.clientHeight = 250; this.offsetHeight = 60;
        this.classList = {
            contains: value => this.className.split(' ').includes(value),
            add: value => { if (!this.classList.contains(value)) this.className += ' ' + value; },
            remove: value => { this.className = this.className.split(' ').filter(name => name !== value).join(' '); },
            toggle: (value, force) => {
                const enabled = force === undefined ? !this.classList.contains(value) : force;
                this.classList[enabled ? 'add' : 'remove'](value); return enabled;
            },
        };
    }
    get isConnected() { return true; }
    append(...nodes) { nodes.forEach(node => { node.parentNode = this; this.children.push(node); }); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(node => node !== this); } }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, handler) { this.events[key] = handler; }
    matches(selector) {
        return selector.split(',').some(value => value.startsWith('.') ? this.classList.contains(value.slice(1))
            : value.trim().toUpperCase() === this.tagName);
    }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus() { this.focused = true; }
    getBoundingClientRect() { return { top: 100, bottom: 500, height: 400 }; }
}

function runtime(storage = new Map()) {
    const timers = [];
    const window = {
        innerWidth: 390, innerHeight: 844,
        location: { hash: '#/library?topParentId=library', search: '', origin: 'https://local.test', href: 'https://local.test/web/' },
        setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
        requestAnimationFrame(fn) { timers.push(fn); return timers.length; },
        removeEventListener() {},
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    };
    const document = { createElement: tag => new Node(tag), getElementById: () => null,
        body: { style: {} }, removeEventListener() {} };
    const source = fs.readFileSync(path.join(__dirname, '../Jellyfin.Plugin.CoverFlow/Web/coverflow.js'), 'utf8')
        .replace('    installStyles();\n    ensureLauncher();\n    waitForApi();', `
            window.testApi = { state, renderBooks, flipCurrent, closeDetails, move, onWheel, onPointerDown,
                onKeyDown, browseFolder, showSeries, loadLibraryPage, rebuildEntries, rememberDetails,
                detailKind, formatDuration, getItemSubtitle, getPrimaryImageUrl, loadBooks, reloadSortedLibrary,
                readNativeSortRequest, getCurrentSortSettings, getLibraryView, setLibraryView,
                syncLibraryView, maybeAutoOpenRememberedLibrary, onNativeSortStorage, readNativeStoredSort };
        `);
    vm.runInNewContext(source, { window, document, console, Date, URL, URLSearchParams, DOMParser: class {
        parseFromString() { return { body: { textContent: 'Safe plot text' }, querySelectorAll: () => [] }; }
    } });
    const api = window.testApi;
    Object.assign(api.state, {
        overlay: new Node(), stage: new Node(), heading: new Node(), title: new Node(), subtitle: new Node(),
        backButton: new Node(), status: new Node(), loadingComplete: true,
        activeLibraryId: 'library', activeCollectionType: 'music',
        api: { getCurrentUserId: () => 'user' },
    });
    return { ...api, window, flush() { const pending = timers.splice(0); pending.forEach(fn => fn()); } };
}

function addEntry(r, entry) {
    r.state.entries = [entry]; r.state.books = [entry]; r.state.index = 0;
    r.renderBooks();
    return r.state.cards[0];
}

test('CoverFlow, list and grid preferences are saved independently and survive reload', () => {
    const storage = new Map(); const r = runtime(storage);
    r.setLibraryView('tv', 'coverflow'); r.setLibraryView('comics', 'coverflow');
    r.setLibraryView('photos', 'list'); r.setLibraryView('movies', 'grid');
    const fresh = runtime(storage);
    assert.equal(fresh.getLibraryView('tv'), 'coverflow');
    assert.equal(fresh.getLibraryView('comics'), 'coverflow');
    assert.equal(fresh.getLibraryView('photos'), 'list');
    assert.equal(fresh.getLibraryView('movies'), 'grid');
    assert.equal(fresh.getLibraryView('untouched'), null);
    const legacy = JSON.parse(storage.get('effecta-coverflow-libraries:server:user'));
    assert.deepEqual(legacy, { tv: true, comics: true });
});

test('existing boolean CoverFlow choices migrate without interpreting native views as enabled', () => {
    const storage = new Map([['effecta-coverflow-libraries:server:user', JSON.stringify({ tv: true, photos: false })]]);
    const r = runtime(storage);
    assert.equal(r.getLibraryView('tv'), 'coverflow'); assert.equal(r.getLibraryView('photos'), null);
    r.setLibraryView('tv', 'list');
    assert.equal(runtime(storage).getLibraryView('tv'), 'list');
    assert.equal(JSON.parse(storage.get('effecta-coverflow-libraries:server:user')).tv, undefined);
});

test('preferences are scoped to the account and malformed browser storage is harmless', () => {
    const storage = new Map([['effecta-coverflow-libraries:server:user:views', '[]']]);
    const r = runtime(storage); r.setLibraryView('tv', 'coverflow');
    r.state.api.getCurrentUserId = () => 'another-user';
    assert.equal(r.getLibraryView('tv'), null);
    r.setLibraryView('tv', 'grid');
    r.state.api.getCurrentUserId = () => 'user';
    assert.equal(r.getLibraryView('tv'), 'coverflow');
});

test('switching from CoverFlow to a native-view library closes it without changing either preference', () => {
    const r = runtime(); r.setLibraryView('library', 'coverflow'); r.setLibraryView('photos', 'list');
    r.syncLibraryView(); r.state.overlay.hidden = false;
    r.window.location.hash = '#/library?topParentId=photos'; r.window.location.href += '#photos';
    r.syncLibraryView();
    assert.equal(r.state.overlay.hidden, true);
    assert.equal(r.getLibraryView('photos'), 'list'); assert.equal(r.getLibraryView('library'), 'coverflow');
    r.state.lastAutoOpenRoute = 'old-route';
    r.window.location.hash = '#/library?topParentId=library'; r.window.location.href += '#library';
    r.syncLibraryView(); assert.equal(r.state.lastAutoOpenRoute, null);
});

test('a delayed auto-open is cancelled when navigating away from the remembered library', () => {
    const r = runtime(); r.state.overlay.hidden = true; r.setLibraryView('library', 'coverflow');
    r.maybeAutoOpenRememberedLibrary();
    r.window.location.hash = '#/library?topParentId=photos'; r.window.location.href += '#photos';
    r.flush(); assert.equal(r.state.overlay.hidden, true);
});

test('switching accounts closes the previous view and invalidates its cached catalog', () => {
    const r = runtime(); r.syncLibraryView(); r.state.overlay.hidden = false;
    r.state.books = [{ Id: 'private-album' }]; r.state.entries = r.state.books;
    const generation = r.state.loadGeneration;
    r.state.api.getCurrentUserId = () => 'new-user';
    r.syncLibraryView();
    assert.equal(r.state.overlay.hidden, true); assert.equal(r.state.books.length, 0);
    assert.equal(r.state.activeLibraryId, null); assert.ok(r.state.loadGeneration > generation);
});

test('Escape closes this visit without erasing the saved CoverFlow preference', () => {
    const r = runtime(); r.setLibraryView('library', 'coverflow'); r.syncLibraryView();
    r.state.overlay.hidden = false;
    r.onKeyDown({ key: 'Escape', target: new Node(), preventDefault() {} });
    assert.equal(r.state.overlay.hidden, true); assert.equal(r.getLibraryView('library'), 'coverflow');
    r.maybeAutoOpenRememberedLibrary(); r.flush(); assert.equal(r.state.overlay.hidden, true);
});

test('sorting keeps the exact album and its existing card while scanning later pages', async () => {
    const r = runtime();
    const card = addEntry(r, { Id: 'swan', Type: 'MusicAlbum', Name: 'Il lago dei cigni' });
    const catalog = Array.from({ length: 700 }, (_, i) => ({ Id: 'album-' + i, Type: 'MusicAlbum' }));
    catalog[620] = r.state.entries[0];
    const calls = []; let release;
    r.state.api.getItems = async (user, options) => {
        calls.push(options);
        if (options.StartIndex === 80) { await new Promise(resolve => { release = resolve; }); }
        return { Items: catalog.slice(options.StartIndex, options.StartIndex + options.Limit), TotalRecordCount: catalog.length };
    };
    const loading = r.reloadSortedLibrary({ by: 'AlbumArtist,SortName', order: 'Ascending' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.state.entries[r.state.index].Id, 'swan');
    assert.equal(r.state.cards[r.state.index], card);
    assert.match(r.state.status.textContent, /riordino/);
    release(); await loading;
    assert.equal(r.state.index, 620); assert.equal(r.state.entries[620].Id, 'swan');
    assert.equal(r.state.cards[620], card); assert.equal(r.state.reordering, false);
    assert.deepEqual(calls.map(call => call.StartIndex), [0, 80, 580]);
    assert.equal(calls.every(call => call.SortBy === 'AlbumArtist,SortName' && call.SortOrder === 'Ascending'), true);
});

test('a selected item beyond the normal 5000-item window is not replaced', async () => {
    const r = runtime(); addEntry(r, { Id: 'anchor', Type: 'MusicAlbum' });
    const catalog = Array.from({ length: 5200 }, (_, i) => ({ Id: 'item-' + i })); catalog[5100] = r.state.entries[0];
    r.state.api.getItems = async (user, q) => ({ Items: catalog.slice(q.StartIndex, q.StartIndex + q.Limit), TotalRecordCount: catalog.length });
    await r.reloadSortedLibrary({ by: 'SortName', order: 'Descending' });
    assert.equal(r.state.index, 5100); assert.equal(r.state.entries[5100].Id, 'anchor');
    assert.equal(r.state.loadingComplete, true);
});

test('a newer sort wins even when the previous request finishes later', async () => {
    const r = runtime(); const album = { Id: 'same', Type: 'MusicAlbum' }; addEntry(r, album);
    let release;
    r.state.api.getItems = (user, q) => q.SortOrder === 'Ascending'
        ? new Promise(resolve => { release = resolve; })
        : Promise.resolve({ Items: [{ Id: 'other' }, album], TotalRecordCount: 2 });
    const old = r.reloadSortedLibrary({ by: 'AlbumArtist,SortName', order: 'Ascending' });
    await r.reloadSortedLibrary({ by: 'AlbumArtist,SortName', order: 'Descending' });
    release({ Items: [album], TotalRecordCount: 1 }); await old;
    assert.equal(r.state.index, 1); assert.equal(r.state.entries[1].Id, 'same');
    assert.equal(r.state.activeSortOrder, 'Descending');
});

test('missing anchors leave the previous catalog and selection intact', async () => {
    const r = runtime(); addEntry(r, { Id: 'missing' }); const previous = r.state.books;
    r.state.api.getItems = async () => ({ Items: [{ Id: 'different' }], TotalRecordCount: 1 });
    await r.reloadSortedLibrary({ by: 'SortName', order: 'Descending' });
    assert.equal(r.state.books, previous); assert.equal(r.state.entries[0].Id, 'missing');
    assert.equal(r.state.reordering, false); assert.match(r.state.status.textContent, /mantenuta la selezione/);
});

test('native sort requests are scoped per library and ignore old or CoverFlow requests', () => {
    const r = runtime(); r.state.overlay.hidden = true;
    const native = (by, startTime = 10, extra = '') => r.readNativeSortRequest({ startTime,
        name: 'https://local.test/Items?ParentId=library&SortBy=' + encodeURIComponent(by) + '&SortOrder=Descending' + extra });
    native('AlbumArtist,SortName');
    assert.equal(r.getCurrentSortSettings().by, 'AlbumArtist,SortName');
    native('SortName', 5); assert.equal(r.getCurrentSortSettings().by, 'AlbumArtist,SortName');
    native('SortName', 20, '&Fields=PrimaryImageAspectRatio,People,ChildCount,ParentId,SortName');
    assert.equal(r.getCurrentSortSettings().by, 'AlbumArtist,SortName');
    r.window.location.hash = '#/library?topParentId=another';
    assert.equal(r.getCurrentSortSettings().by, 'SortName');
    r.window.location.hash = '#/library?topParentId=library';
    assert.equal(r.getCurrentSortSettings().order, 'Descending');
});

test('native SDK repeated sort parameters retain every field in priority order', () => {
    const r = runtime(); r.state.overlay.hidden = true;
    r.readNativeSortRequest({ startTime: 20,
        name: 'https://local.test/Items?parentId=library&sortBy=DateCreated&sortBy=SortName&sortOrder=Descending' });
    assert.equal(r.getCurrentSortSettings().by, 'DateCreated,SortName');
    assert.equal(r.getCurrentSortSettings().order, 'Descending');
    r.readNativeSortRequest({ startTime: 30,
        name: 'https://local.test/Items?parentId=library&sortBy=ProductionYear&sortBy=PremiereDate&sortBy=SortName&sortOrder=Ascending' });
    assert.equal(r.getCurrentSortSettings().by, 'ProductionYear,PremiereDate,SortName');
});

test('native stored sorting updates a cached catalog without rewriting native settings', async () => {
    const storage = new Map(); const r = runtime(storage);
    const selected = { Id: 'winnie', Type: 'Movie' }; addEntry(r, selected);
    r.state.api.getItems = async (user, q) => {
        assert.equal(q.SortBy, 'DateCreated,SortName'); assert.equal(q.SortOrder, 'Descending');
        return { Items: [{ Id: 'other' }, selected], TotalRecordCount: 2 };
    };
    const native = JSON.stringify({ SortBy: ['DateCreated', 'SortName'], SortOrder: 'Descending', Filters: { IsPlayed: true } });
    storage.set('Movies - library', native);
    r.onNativeSortStorage({ key: 'Movies - library' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.state.activeSortBy, 'DateCreated,SortName'); assert.equal(r.state.activeSortOrder, 'Descending');
    assert.equal(r.state.entries[r.state.index].Id, 'winnie'); assert.equal(r.state.index, 1);
    assert.equal(storage.get('Movies - library'), native);
    r.readNativeSortRequest({ startTime: 100, name: 'https://local.test/Items?ParentId=library&SortBy=SortName&SortOrder=Ascending' });
    assert.equal(r.getCurrentSortSettings().by, 'DateCreated,SortName');
    assert.equal(r.getCurrentSortSettings().order, 'Descending');
});

test('native sort storage ignores unrelated libraries and malformed preferences', () => {
    const storage = new Map(); const r = runtime(storage); r.state.overlay.hidden = true;
    storage.set('Movies - another-library', JSON.stringify({ SortBy: ['DateCreated', 'SortName'], SortOrder: 'Descending' }));
    r.onNativeSortStorage({ key: 'Movies - another-library' });
    assert.equal(r.getCurrentSortSettings().by, 'SortName');
    for (const value of ['null', '[]', '{bad json', '{"SortBy":["DateCreated"],"SortOrder":"unknown"}']) {
        storage.set('Movies - library', value);
        assert.equal(r.readNativeStoredSort('Movies - library'), null);
        r.onNativeSortStorage({ key: 'Movies - library' });
        assert.equal(r.getCurrentSortSettings().by, 'SortName');
    }
});

test('sorting inside a comic folder keeps the hierarchy and reorders its parent on return', async () => {
    const r = runtime(); r.state.activeCollectionType = 'books';
    r.state.activeSortBy = 'SortName'; r.state.activeSortOrder = 'Ascending';
    const root = [{ Id: 'a', Type: 'Folder' }, { Id: 'b', Type: 'Folder' }];
    r.state.books = root; r.state.entries = root; r.state.index = 1;
    const queries = [];
    r.state.api.getItems = async (user, q) => {
        queries.push(q);
        return { Items: q.ParentId === 'b' ? [{ Id: 'volume', Type: 'Book' }] : root.slice().reverse(), TotalRecordCount: q.ParentId === 'b' ? 1 : 2 };
    };
    r.browseFolder(root[1]); await new Promise(resolve => setImmediate(resolve));
    await r.reloadSortedLibrary({ by: 'SortName', order: 'Descending' });
    assert.equal(r.state.folderId, 'b'); assert.equal(r.state.folderStack.length, 1);
    r.showSeries(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.state.folderId, null); assert.equal(r.state.entries[r.state.index].Id, 'b'); assert.equal(r.state.index, 0);
    assert.equal(queries.at(-1).SortOrder, 'Descending'); assert.equal(queries.at(-1).Recursive, false);
});

test('albums have square art and separate front/back controls without nested buttons', async () => {
    const r = runtime();
    const album = { Id: 'album', Type: 'MusicAlbum', Name: 'Album', AlbumArtists: ['Artist'], ProductionYear: 2025 };
    const card = addEntry(r, album);
    assert.equal(card.tagName, 'DIV');
    assert.equal(card.classList.contains('is-album'), true);
    assert.equal(card.querySelector('.ecf-front').tagName, 'BUTTON');
    assert.equal(r.getItemSubtitle(album), 'Artist · 2025');
    r.state.api.getItems = async () => ({ Items: [{ Id: 'song', Name: 'First', IndexNumber: 1,
        ParentIndexNumber: 1, RunTimeTicks: 1850000000 }], TotalRecordCount: 1 });
    await r.flipCurrent(album, card); r.flush();
    assert.equal(card.classList.contains('is-flipped'), true);
    assert.equal(card.querySelector('.ecf-front').inert, true);
    assert.equal(card.querySelector('.ecf-detail-duration').textContent, '3:05');
    assert.equal(card.querySelector('.ecf-back-meta').textContent, 'Artist · 2025 · 1 traccia · 3 min');
    assert.equal(card.querySelectorAll('button').every(button => button.querySelectorAll('button').length === 0), true);
});

test('track requests are on demand, ordered by disc and track, cached, and never trigger playback', async () => {
    const r = runtime();
    const entry = { Id: 'album', Type: 'MusicAlbum' };
    const card = addEntry(r, entry);
    let calls = 0;
    r.state.api.getItems = async (user, options) => {
        calls++; assert.equal(user, 'user'); assert.equal(options.ParentId, 'album');
        assert.equal(options.IncludeItemTypes, 'Audio'); assert.equal(options.Limit, 100);
        assert.equal(options.SortBy, 'ParentIndexNumber,IndexNumber,SortName');
        return { Items: [], TotalRecordCount: 0 };
    };
    assert.equal(calls, 0);
    await r.flipCurrent(entry, card); r.flush(); r.closeDetails(true);
    await r.flipCurrent(entry, card); r.flush();
    assert.equal(calls, 1); assert.equal(r.window.location.hash, '#/library?topParentId=library');
});

test('a late response cannot replace the content after closing or switching library', async () => {
    const r = runtime();
    const entry = { Id: 'slow', Type: 'Series' };
    const card = addEntry(r, entry);
    let resolve;
    r.state.api.getItems = () => new Promise(done => { resolve = done; });
    const loading = r.flipCurrent(entry, card);
    r.closeDetails();
    resolve({ Items: [{ Name: 'Old episode' }], TotalRecordCount: 1 });
    await loading; r.flush();
    assert.equal(r.state.detailCard, null); assert.equal(r.state.detailCache.size, 0);
    assert.equal(card.classList.contains('is-flipped'), false);
});

test('TV episodes are grouped by season, including specials, and loaded in pages', async () => {
    const r = runtime(); const entry = { Id: 'show', Type: 'Series' }; const card = addEntry(r, entry);
    const calls = [];
    r.state.api.getItems = async (user, options) => {
        calls.push(options);
        return { Items: [{ Id: String(options.StartIndex), Name: 'Episode', ParentIndexNumber: options.StartIndex ? 1 : 0,
            IndexNumber: 1 }], TotalRecordCount: 2 };
    };
    await r.flipCurrent(entry, card); r.flush();
    assert.equal(calls[0].IncludeItemTypes, 'Episode'); assert.equal(calls[0].IsMissing, false);
    assert.equal(card.querySelector('.ecf-detail-section').textContent, 'Speciali');
    await card.querySelector('.ecf-back-body').querySelector('.ecf-detail-action').events.click();
    assert.equal(calls[1].StartIndex, 1);
    assert.deepEqual(card.querySelectorAll('.ecf-detail-section').map(node => node.textContent), ['Speciali', 'Stagione 1']);
});

test('real folder children stay non-recursive and folders are not inferred from SeriesName', async () => {
    const r = runtime(); r.state.activeCollectionType = 'books';
    let options;
    r.state.api.getItems = async (user, request) => { options = request; return { Items: [], TotalRecordCount: 0 }; };
    await r.loadLibraryPage('user', 'root', 'books', 0, 80);
    assert.equal(options.ParentId, 'root'); assert.equal(options.Recursive, false);
    assert.equal(options.IncludeItemTypes, 'Folder,Book');
    const entries = [{ Id: 'a', Type: 'Folder', Name: 'Same' }, { Id: 'b', Type: 'Folder', Name: 'Same' },
        { Id: 'c', Type: 'Book', SeriesName: 'Other' }];
    r.state.books = entries; r.rebuildEntries();
    assert.equal(r.state.entries, entries); assert.equal(r.state.entries.length, 3);
    assert.equal(r.detailKind(entries[0]), 'folder'); assert.equal(r.detailKind(entries[2]), 'plot');
    const card = addEntry(r, { Id: 'series-folder', Type: 'Folder', Name: 'Series' });
    await r.flipCurrent(r.state.entries[0], card);
    assert.equal(options.ParentId, 'series-folder'); assert.equal(options.Recursive, false);
});

test('returning to a parent folder restores the selected cover and its catalog', async () => {
    const r = runtime(); const root = [{ Id: 'a' }, { Id: 'b' }];
    r.state.books = root; r.state.entries = root; r.state.index = 1;
    r.state.activeCollectionType = 'books';
    r.state.api.getItems = async () => ({ Items: [{ Id: 'volume', Type: 'Book' }], TotalRecordCount: 1 });
    r.browseFolder({ Id: 'sub' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.state.folderId, 'sub'); assert.equal(r.state.folderStack.length, 1);
    r.showSeries();
    assert.equal(r.state.folderId, null); assert.equal(r.state.entries, root); assert.equal(r.state.index, 1);
});

test('scrolling the back does not change cover and touch is not captured by the carousel', async () => {
    const r = runtime(); const entry = { Id: 'album', Type: 'MusicAlbum' }; const card = addEntry(r, entry);
    r.state.api.getItems = async () => ({ Items: [], TotalRecordCount: 0 });
    await r.flipCurrent(entry, card); r.flush();
    const body = card.querySelector('.ecf-back-body');
    r.onWheel({ target: body, deltaY: 40, deltaX: 1, deltaMode: 0, preventDefault() {}, stopPropagation() {} });
    assert.equal(body.scrollTop, 40); assert.equal(r.state.index, 0);
    r.onPointerDown({ isPrimary: true, pointerId: 9, target: body });
    assert.equal(r.state.pointerId, null);
    r.onKeyDown({ key: 'Enter', target: card.querySelector('.ecf-flip-close'), preventDefault() { assert.fail('native button'); } });
    r.onKeyDown({ key: 'Escape', target: body, preventDefault() {} });
    assert.equal(r.state.detailCard, null);
});

test('books fetch their plot only when opened and render metadata as plain text', async () => {
    const r = runtime(); const entry = { Id: 'book', Type: 'Book' }; const card = addEntry(r, entry);
    let requests = 0;
    r.state.api.getItem = async (user, id) => {
        requests++; assert.equal(user, 'user'); assert.equal(id, 'book');
        return { Overview: '<p>Plot</p><script>unsafe()</script>', Type: 'Book', People: [{ Type: 'Author', Name: 'Author' }] };
    };
    assert.equal(requests, 0); await r.flipCurrent(entry, card);
    assert.equal(requests, 1); assert.equal(card.querySelector('.ecf-plot').textContent, 'Safe plot text');
    assert.equal(card.querySelector('.ecf-back-meta').textContent, 'Author');
});

test('failed content requests offer a retry and the metadata cache is bounded', async () => {
    const r = runtime(); const entry = { Id: 'album', Type: 'MusicAlbum' }; const card = addEntry(r, entry);
    r.state.api.getItems = async () => { throw Error('offline'); };
    await r.flipCurrent(entry, card);
    assert.equal(card.querySelector('.ecf-back-body').querySelector('.ecf-detail-action').textContent, 'Riprova');
    for (let i = 0; i < 20; i++) r.rememberDetails(String(i), {});
    assert.equal(r.state.detailCache.size, 8); assert.equal(r.state.detailCache.has('0'), false);
});
