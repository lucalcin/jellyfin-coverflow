'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

// Technical DOM integration test, not user-profile automation. The fixture
// follows Jellyfin 12.4's installed SelectView popover: two direct MUI rows
// and an optional nested settings collapse. No server credentials are used.
const source = fs.readFileSync(path.join(__dirname, '../Jellyfin.Plugin.CoverFlow/Web/coverflow.js'), 'utf8');
const executablePath = process.env.CHROMIUM_EXECUTABLE;
const markup = `<!doctype html><html><head><style>
body{margin:0;background:#111;color:white;font:16px Arial}header{height:64px;display:flex;position:relative;z-index:1200}
header button{width:48px;height:48px;background:#222;color:white}svg{width:24px;height:24px}
.MuiBackdrop-root{position:fixed;inset:0}.MuiPopover-root{position:fixed;inset:0;z-index:1300}
.MuiPopover-paper{position:absolute;left:16px;top:65px;background:#383838;border-radius:6px;min-width:280px}
.MuiList-root{list-style:none;margin:0;padding:8px 0}.MuiMenuItem-root{display:flex;align-items:center;padding:16px;cursor:pointer}
.MuiListItemIcon-root{min-width:48px}.MuiListItemText-root{flex:1}.MuiListItemText-primary{font-size:18px}
</style></head><body><header><button id="view" title="Mostra impostazioni" aria-label="Mostra impostazioni"><svg></svg></button></header>
<script>
window.nativeChoice='grid'; window.menuLanguage='it';
window.ApiClient={getCurrentUserId:()=> 'user',getUserViews:async()=>({Items:[{Id:'library',Name:'Film',CollectionType:'movies'}]}),
getItems:async()=>({Items:[],TotalRecordCount:0}),serverInfo:{Id:'server'}};
location.hash='#/library?topParentId=library';
window.createNativeMenu=function(){
const labels=window.menuLanguage==='it'?['Vista Griglia','Vista a Elenco']:['Rasteransicht','Listenansicht'];
const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
const root=document.createElement('div');root.id='selectview-popover';root.className='MuiPopover-root MuiModal-root';
root.innerHTML='<div class="MuiBackdrop-root"></div><div class="MuiPopover-paper"><ul class="MuiList-root" role="menu">'
+'<li class="MuiMenuItem-root" role="menuitem" tabindex="0" data-native="grid"><div class="MuiListItemIcon-root"><svg data-testid="CheckIcon"></svg></div><div class="MuiListItemText-root"><span class="MuiListItemText-primary">'+labels[0]+'</span></div><button id="gear">Settings</button></li>'
+'<div class="MuiCollapse-root"></div>'
+'<li class="MuiMenuItem-root" role="menuitem" tabindex="-1" data-native="list"><div class="MuiListItemIcon-root"></div><div class="MuiListItemText-root"><span class="MuiListItemText-primary">'+labels[1]+'</span></div></li></ul></div>';
root.querySelector('.MuiBackdrop-root').onclick=()=>{root.remove();queueMicrotask(()=>{document.body.style.overflow=previousOverflow;});};
root.querySelector('#gear').onclick=event=>{event.stopPropagation();window.settingsOpened=true;};
root.querySelectorAll('[data-native]').forEach(row=>{
row.onclick=()=>{window.nativeChoice=row.dataset.native;};
row.onkeydown=event=>{if(event.target===row&&event.key==='Enter'){event.preventDefault();row.onclick();}};
});
document.body.append(root);return root;
};
document.getElementById('view').onclick=()=>setTimeout(window.createNativeMenu,20);
</script></body></html>`;

test('CoverFlow appears in the current view popover and behaves as a remembered view choice', async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath });
    const context = await browser.newContext();
    // A real HTTP origin enables localStorage, but every request stays in this fixture.
    await context.route('http://coverflow.test/**', route => route.fulfill({ contentType: 'text/html', body: markup }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto('http://coverflow.test/');
        await page.addScriptTag({ content: source });
        await page.waitForFunction(() => Boolean(window.__effectaBookCoverFlow.api));
        // Opening the view menu must not silently forget a remembered library.
        await page.evaluate(() => {
            localStorage.setItem('effecta-coverflow-libraries:server:user', JSON.stringify({ library: true }));
            window.__effectaBookCoverFlow.lastAutoOpenRoute = location.href;
        });
        await page.locator('#view').click();
        const entry = page.locator('#effecta-coverflow-menu-item');
        await entry.waitFor({ state: 'visible' });
        assert.equal(await page.locator('#selectview-popover .MuiList-root > .MuiMenuItem-root').count(), 3);
        assert.equal(await entry.locator('.MuiListItemText-primary').textContent(), 'CoverFlow');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('effecta-coverflow-libraries:server:user')).library), true);
        // The new row must fit inside the actual auto-sized Paper, not below a clipped box.
        const fits = await entry.evaluate(node => {
            const row = node.getBoundingClientRect(); const paper = node.closest('.MuiPopover-paper').getBoundingClientRect();
            return row.top >= paper.top && row.bottom <= paper.bottom;
        });
        assert.equal(fits, true);
        await entry.click();
        await page.waitForFunction(() => document.getElementById('effecta-coverflow-overlay')?.hidden === false);
        assert.equal(await page.locator('#selectview-popover').count(), 0);
        // Reopen: CoverFlow is checked, the native Grid check is hidden.
        await page.locator('#view').click();
        await entry.waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.getElementById('effecta-coverflow-menu-item')?.getAttribute('aria-checked') === 'true');
        assert.equal(await page.locator('[data-native="grid"] [data-testid="CheckIcon"]').evaluate(node => getComputedStyle(node).visibility), 'hidden');
        assert.equal(await page.evaluate(() => {
            const state = window.__effectaBookCoverFlow;
            state.entries = [{ Id: 'one' }, { Id: 'two' }]; state.index = 0;
            document.querySelector('.MuiPopover-paper').dispatchEvent(new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true }));
            const index = state.index; state.entries = [];
            return index;
        }), 0);
        await page.locator('#gear').click();
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.overlay.hidden), false);
        // Native List is allowed through to Jellyfin's handler and disables our overlay.
        await page.locator('[data-ecf-native-view][data-native="list"]').click();
        assert.equal(await page.evaluate(() => window.nativeChoice), 'list');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.overlay.hidden), true);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('effecta-coverflow-libraries:server:user')).library), undefined);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('effecta-coverflow-libraries:server:user:views')).library), 'list');
        // A React-style row replacement must restore exactly one extension row.
        await page.evaluate(() => {
            const list = document.querySelector('#selectview-popover .MuiList-root');
            list.replaceChildren(...Array.from(list.children).filter(node => node.id !== 'effecta-coverflow-menu-item').map(node => node.cloneNode(true)));
        });
        await entry.waitFor({ state: 'visible' });
        assert.equal(await entry.count(), 1);
        // Keyboard activation, then a different language: modern integration is structural.
        await entry.focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__effectaBookCoverFlow.overlay.hidden === false);
        await page.evaluate(() => { window.menuLanguage = 'de'; });
        await page.locator('#view').click(); await entry.waitFor({ state: 'visible' });
        assert.equal(await page.locator('#selectview-popover .MuiList-root > [data-ecf-native-view]').count(), 2);
        await page.locator('[data-native="grid"]').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.nativeChoice), 'grid');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.overlay.hidden), true);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('effecta-coverflow-libraries:server:user:views')).library), 'grid');
        await page.locator('#selectview-popover .MuiBackdrop-root').click({ position: { x: 900, y: 500 } });
        await page.waitForFunction(() => document.body.style.overflow === '');
        assert.deepEqual(errors, []);
    } finally {
        await context.close(); await browser.close();
    }
});

test('mixed libraries retain their own views after navigation, revisits and a browser reload', async () => {
    const browser = await chromium.launch({ headless: true, executablePath });
    const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const persistentRouteMarkup = markup.replace("location.hash='#/library?topParentId=library';",
        "if(!location.hash)location.hash='#/library?topParentId=library';");
    await context.route('http://coverflow.test/**', route => route.fulfill({ contentType: 'text/html', body: persistentRouteMarkup }));
    async function boot() {
        await page.evaluate(() => {
            window.ApiClient.getUserViews = async () => ({ Items: [
                { Id: 'tv', CollectionType: 'tvshows' }, { Id: 'comics', CollectionType: 'books' },
                { Id: 'photos', CollectionType: 'homevideos' }, { Id: 'movies', CollectionType: 'movies' },
            ] });
            // Jellyfin 12.4 persists native Grid/List by view type + topParentId.
            // Model that existing behavior; the extension must not overwrite it.
            const libraryId = () => new URLSearchParams(location.hash.split('?')[1]).get('topParentId');
            const restoreNative = () => { window.nativeChoice = localStorage.getItem('native-view:' + libraryId()) || 'grid'; };
            restoreNative(); window.addEventListener('hashchange', restoreNative);
            const create = window.createNativeMenu;
            window.createNativeMenu = () => {
                const root = create();
                root.querySelectorAll('[data-native]').forEach(row => {
                    const activate = row.onclick;
                    row.onclick = () => { activate(); localStorage.setItem('native-view:' + libraryId(), window.nativeChoice); };
                });
                return root;
            };
        });
        await page.addScriptTag({ content: source });
        await page.waitForFunction(() => Boolean(window.__effectaBookCoverFlow.api));
    }
    async function navigate(library) {
        await page.evaluate(id => { location.hash = '#/library?topParentId=' + id; }, library);
        await page.waitForFunction(id => window.__effectaBookCoverFlow.lastViewRoute === location.href
            && new URLSearchParams(location.hash.split('?')[1]).get('topParentId') === id, library);
    }
    async function choose(view) {
        await page.locator('#view').click();
        await page.locator('#effecta-coverflow-menu-item').waitFor();
        if (view === 'coverflow') { await page.locator('#effecta-coverflow-menu-item').click(); }
        else {
            await page.locator('[data-ecf-native-view][data-native="' + view + '"]').click();
            await page.locator('#selectview-popover .MuiBackdrop-root').click({ position: { x: 900, y: 500 } });
        }
        await page.waitForFunction(mode => Boolean(window.__effectaBookCoverFlow.overlay && !window.__effectaBookCoverFlow.overlay.hidden)
            === (mode === 'coverflow'), view);
    }
    try {
        await page.goto('http://coverflow.test/'); await boot();
        await navigate('tv'); await choose('coverflow');
        await navigate('comics');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.overlay.hidden), true);
        await choose('coverflow');
        await navigate('photos'); await choose('list');
        assert.equal(await page.evaluate(() => window.nativeChoice), 'list');
        await navigate('movies'); await choose('grid');
        await navigate('tv');
        await page.waitForFunction(() => window.__effectaBookCoverFlow.overlay.hidden === false
            && window.__effectaBookCoverFlow.activeLibraryId === 'tv');
        await navigate('photos');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.overlay.hidden), true);
        assert.equal(await page.evaluate(() => window.nativeChoice), 'list');
        await page.reload(); await boot();
        assert.equal(await page.evaluate(() => Boolean(window.__effectaBookCoverFlow.overlay && !window.__effectaBookCoverFlow.overlay.hidden)), false);
        assert.equal(await page.evaluate(() => window.nativeChoice), 'list');
        await navigate('comics');
        await page.waitForFunction(() => window.__effectaBookCoverFlow.overlay.hidden === false
            && window.__effectaBookCoverFlow.activeLibraryId === 'comics');
        await navigate('movies');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.overlay.hidden), true);
        assert.equal(await page.evaluate(() => window.nativeChoice), 'grid');
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('effecta-coverflow-libraries:server:user:views'))),
            { tv: 'coverflow', comics: 'coverflow', photos: 'list', movies: 'grid' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); }
});

// Optional release check against an extracted copy of the installed public web
// bundles. React, MenuList and MenuItem below are Jellyfin's actual components,
// not a hand-written approximation of their class names or keyboard handlers.
test('installed MUI menu supports CoverFlow keyboard navigation and native album sorting', {
    skip: !process.env.JELLYFIN_WEB_ROOT,
}, async () => {
    const root = process.env.JELLYFIN_WEB_ROOT;
    const browser = await chromium.launch({ headless: true,
        executablePath });
    const context = await browser.newContext();
    const page = await context.newPage(); const errors = []; let phase = 'load bundles';
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await context.route('http://coverflow.test/**', route => {
        const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
        return route.fulfill(name.endsWith('.js')
            ? { contentType: 'text/javascript', body: fs.readFileSync(path.join(root, path.basename(name)), 'utf8') }
            : { contentType: 'text/html', body: markup });
    });
    try {
        await page.goto('http://coverflow.test/');
        const scripts = ['runtime.bundle.js', ...fs.readdirSync(root).filter(name =>
            (name.startsWith('node_modules.') || name.startsWith('78701.')) && name.endsWith('.js')), '1133.bundle.js'];
        for (const file of scripts) { await page.addScriptTag({ url: '/' + encodeURIComponent(file) }); }
        await page.evaluate(() => {
            webpackChunk.push([[987654321], {}, require => { window.nativeRequire = require; }]);
            const React = nativeRequire(63696); const createRoot = nativeRequire(78325).createRoot;
            const MenuItem = nativeRequire(85637).A; const MenuList = nativeRequire(29095).A;
            const Text = nativeRequire(60434).A; const Icon = nativeRequire(44790).A;
            const ArrowUp = nativeRequire(16935).A; const ArrowDown = nativeRequire(46342).A;
            const useLocalStorage = nativeRequire(1161).Mj;
            const h = React.createElement;
            window.nativeChoice = 'grid'; window.nativeSort = { by: 'SortName', order: 'Ascending' };
            window.ApiClient.getUserViews = async () => ({ Items: [{ Id: 'library', CollectionType: 'music' }] });
            window.ApiClient.getItems = async (user, q) => {
                const albums = [{ Id: 'swan', Name: 'Il lago dei cigni', Type: 'MusicAlbum' }, { Id: 'other', Name: 'Other', Type: 'MusicAlbum' }];
                return { Items: q.SortBy === 'SortName' ? albums : albums.reverse(), TotalRecordCount: 2 };
            };
            function mountMenu(id, component) {
                document.getElementById(id)?.remove();
                const portal = document.createElement('div'); portal.id = id; portal.className = 'MuiPopover-root MuiModal-root';
                portal.innerHTML = '<div class="MuiBackdrop-root"></div><div class="MuiPopover-paper"></div>';
                portal.querySelector('.MuiBackdrop-root').onclick = () => portal.remove();
                document.body.append(portal); createRoot(portal.querySelector('.MuiPopover-paper')).render(h(component));
            }
            function ViewMenu() {
                const [selected, select] = React.useState(window.nativeChoice);
                return h(MenuList, null, ...['grid', 'list'].map((value, index) => h(MenuItem, {
                    key: value, 'data-native': value, onClick: () => { window.nativeChoice = value; select(value); },
                }, h(Icon, null, selected === value && h('svg', { 'data-testid': 'CheckIcon' })),
                h(Text, { primary: index ? 'Vista a Elenco' : 'Vista Griglia' }))));
            }
            function SortMenu() {
                const [saved, setSaved] = useLocalStorage('Albums - library', { SortBy: ['SortName'], SortOrder: 'Ascending' });
                const sort = { by: saved.SortBy.join(','), order: saved.SortOrder };
                return h(MenuList, null, ...[['Nome', 'SortName'], ['Artista album', 'AlbumArtist,SortName'], ['Aggiunto il', 'DateCreated,SortName']].map(([label, by]) => h(MenuItem, {
                    key: by, 'data-sort': by, onClick: () => {
                        const next = { by, order: sort.by === by && sort.order === 'Ascending' ? 'Descending' : 'Ascending' };
                        window.nativeSort = next; setSaved({ SortBy: by.split(','), SortOrder: next.order });
                    },
                }, h(Text, { primary: label }), h(Icon, null, sort.by === by
                    && h(sort.order === 'Ascending' ? ArrowUp : ArrowDown, { fontSize: 'small' })))));
            }
            window.createNativeMenu = () => mountMenu('selectview-popover', ViewMenu);
            window.createSortMenu = () => mountMenu('sort-popover', SortMenu);
        });
        await page.addScriptTag({ content: source });
        phase = 'open view menu';
        await page.waitForFunction(() => Boolean(window.__effectaBookCoverFlow.api), null, { timeout: 5000 });
        await page.locator('#view').click();
        const entry = page.locator('#effecta-coverflow-menu-item'); await entry.waitFor();
        assert.equal(await entry.evaluate(node => node.tagName), 'LI');
        assert.equal(await page.locator('#selectview-popover .MuiMenuItem-root').count(), 3);
        await page.locator('[data-ecf-native-view][data-native="list"]').focus(); await page.keyboard.press('ArrowDown');
        assert.equal(await entry.evaluate(node => document.activeElement === node), true);
        await page.keyboard.press('Enter');
        phase = 'load CoverFlow after keyboard activation';
        await page.waitForFunction(() => window.__effectaBookCoverFlow.entries.length === 2, null, { timeout: 5000 });
        await page.evaluate(() => window.createSortMenu());
        assert.ok(await page.locator('#sort-popover svg path').count() > 0);
        phase = 'choose album artist';
        await page.locator('[data-sort="AlbumArtist,SortName"]').click();
        await page.waitForFunction(() => window.__effectaBookCoverFlow.activeSortBy === 'AlbumArtist,SortName', null, { timeout: 5000 });
        assert.equal(await page.evaluate(() => window.nativeSort.order), 'Ascending');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.entries[window.__effectaBookCoverFlow.index].Id), 'swan');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.index), 1);
        await page.locator('[data-sort="AlbumArtist,SortName"]').focus(); await page.keyboard.press('Enter');
        phase = 'reverse artist order with keyboard';
        await page.waitForFunction(() => window.__effectaBookCoverFlow.activeSortOrder === 'Descending', null, { timeout: 5000 });
        assert.equal(await page.evaluate(() => window.nativeSort.order), 'Descending');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.entries[window.__effectaBookCoverFlow.index].Id), 'swan');
        phase = 'follow the native setting without a click or a network request';
        await page.evaluate(() => {
            localStorage.setItem('Albums - library', JSON.stringify({ SortBy: ['DateCreated', 'SortName'], SortOrder: 'Descending' }));
            window.dispatchEvent(new StorageEvent('local-storage', { key: 'Albums - library' }));
        });
        await page.waitForFunction(() => window.__effectaBookCoverFlow.activeSortBy === 'DateCreated,SortName'
            && window.__effectaBookCoverFlow.activeSortOrder === 'Descending', null, { timeout: 5000 });
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.entries[window.__effectaBookCoverFlow.index].Id), 'swan');
        assert.deepEqual(errors, []);
    } catch (error) {
        const snapshot = await page.evaluate(() => {
            const s = window.__effectaBookCoverFlow;
            return { entries: s?.entries.length, hidden: s?.overlay?.hidden, library: s?.activeLibraryId,
                api: Boolean(s?.api), status: s?.status?.textContent, errors: document.body.innerText.slice(-500) };
        });
        throw new Error(phase + ': ' + error.message + '\nState: ' + JSON.stringify(snapshot)
            + '\nBrowser errors: ' + errors.join(', '), { cause: error });
    } finally { await context.close(); await browser.close(); }
});
