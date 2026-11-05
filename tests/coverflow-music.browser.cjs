'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '../Jellyfin.Plugin.CoverFlow/Web/coverflow.js'), 'utf8');
const html = `<!doctype html><html lang="it"><head><style>
body{margin:0;background:#111;color:white;font:16px Arial}header{position:fixed;inset:0 0 auto;height:64px;z-index:1200;background:#111}
button{height:48px;min-width:48px}svg{width:24px;height:24px}main{padding-top:80px}.card{height:100px}
</style></head><body><header><button id="view" aria-describedby="selectview-popover" title="Mostra impostazioni"><svg></svg></button>
<button id="sort" aria-describedby="sort-popover">Sort</button></header><main></main><script>
location.hash='#/music?topParentId=library&tab=0';
window.query=async(route,q)=>{const params=new URLSearchParams(q);return(await fetch('/'+route+'?'+params)).json();};
window.ApiClient={getCurrentUserId:()=> 'user',serverInfo:{Id:'server'},serverAddress:()=>location.origin,
getUserViews:async()=>({Items:[{Id:'library',Name:'Classica',CollectionType:'music'}]}),
getItems:(u,q)=>query('Items',q),getPeople:(u,q)=>query('Persons',q),getGenres:(u,q)=>query('Genres',q),
getUrl:(route,q)=>'/'+route+'?'+new URLSearchParams(q),getJSON:async url=>(await fetch(url)).json()};
window.chooseSection=async tab=>{location.hash='#/music?topParentId=library&tab='+tab;
 const names=['albums','suggestions','albumartists','artists','playlists','songs','genres','collections'];
 const name=names[tab];localStorage.setItem(name+' - library',JSON.stringify({ViewMode:tab===5?'list':'grid',SortBy:['SortName'],SortOrder:'Ascending',StartIndex:0}));
 document.getElementById('view').hidden=tab===4||tab===5||tab===1;
 document.getElementById('sort').hidden=tab===1;
 if(tab===1){document.querySelector('main').textContent='Native suggestions';return;}
 const q={parentId:'library',limit:100,startIndex:0};let route='Items';
 if(tab===2||tab===3){route='Persons';q.personTypes=tab===2?'AlbumArtist':'Artist';}
 else if(tab===6){route='Genres';q.includeItemTypes='MusicAlbum';}
 else{q.includeItemTypes={0:'MusicAlbum',4:'Playlist',5:'Audio',7:'BoxSet'}[tab];q.sortBy='SortName';q.sortOrder='Ascending';}
 const response=await query(route,q);document.querySelector('main').replaceChildren(...response.Items.map(item=>{
 const card=document.createElement('article');card.className='card';card.dataset.id=item.Id;card.dataset.type=item.Type;
 const a=document.createElement('a');a.href='#/details?id='+item.Id;a.textContent=item.Name;card.append(a);return card;}));};
chooseSection(0);
</script></body></html>`;

test('music menu changes catalog, artist drill returns to its selected person, and suggestions stay native', async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    page.setDefaultTimeout(8000);
    const errors = []; const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    const album = { Id: 'album', Name: 'Cantatas', Type: 'MusicAlbum', AlbumArtists: [{ Name: 'Bach', Id: 'person' }] };
    const track = { Id: 'song', Name: 'Aria', Type: 'Audio', Album: 'Cantatas', Artists: ['Bach'], RunTimeTicks: 610000000 };
    await page.route('http://music.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') { return route.fulfill({ contentType: 'text/html', body: html }); }
        if (url.pathname.includes('/Images/')) { return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#345"/></svg>' }); }
        const q = Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
        requests.push({ route: url.pathname, q });
        let items;
        if (url.pathname === '/Persons') { items = [{ Id: q.persontypes === 'AlbumArtist' ? 'album-artist' : 'artist', Name: 'Bach', Type: 'Person', IsFolder: false }]; }
        else if (url.pathname === '/Genres') { items = [{ Id: 'genre', Name: 'Classical', Type: 'MusicGenre' }]; }
        else if (url.pathname.startsWith('/Playlists/')) { items = [{ ...track, PlaylistItemId: '1' }, { ...track, PlaylistItemId: '2' }]; }
        else if (q.includeitemtypes === 'Playlist') { items = [{ Id: 'playlist', Name: 'Favorites', Type: 'Playlist', IsFolder: true }]; }
        else if (q.includeitemtypes === 'Audio') { items = [track]; }
        else if (q.includeitemtypes === 'BoxSet') { items = [{ Id: 'collection', Name: 'Collection', Type: 'BoxSet' }]; }
        else { items = [album]; }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Items: items, TotalRecordCount: items.length }) });
    });
    async function current(id, key) {
        await page.waitForFunction(({ id, key }) => {
            const s = window.__effectaBookCoverFlow;
            return s.activeCatalogKey === key && s.entries[s.index]?.Id === id && !s.reordering;
        }, { id, key });
    }
    async function section(tab, id, name) {
        await page.evaluate(tab => chooseSection(tab), tab);
        await current(id, 'music:' + name);
    }
    try {
        await page.goto('http://music.test/'); await page.addScriptTag({ content: source });
        await page.waitForFunction(() => Boolean(window.__effectaBookCoverFlow.api));
        await page.locator('#effecta-coverflow-toolbar-button').click(); await current('album', 'music:albums');
        await section(2, 'album-artist', 'albumartists');
        await page.locator('.ecf-card[data-index="0"] .ecf-front').click();
        await page.locator('.ecf-back .ecf-detail-row').waitFor();
        assert.equal(await page.locator('.ecf-back .ecf-detail-name').textContent(), 'Cantatas');
        await page.locator('.ecf-back-footer button').click(); await current('album', 'music:albumartists');
        const query = requests.find(call => call.q.personids === 'album-artist');
        assert.equal(query.q.parentid, 'library'); assert.equal(query.q.persontypes, 'AlbumArtist');
        await page.locator('.ecf-level-up').click(); await current('album-artist', 'music:albumartists');
        await section(3, 'artist', 'artists');
        await section(4, 'playlist', 'playlists');
        assert.equal(await page.locator('#effecta-coverflow-toolbar-button').isVisible(), true);
        await page.locator('.ecf-card[data-index="0"] .ecf-front').click();
        await page.waitForFunction(() => document.querySelectorAll('.ecf-back .ecf-detail-row').length === 2);
        await section(5, 'song', 'songs');
        assert.match(await page.evaluate(() => window.__effectaBookCoverFlow.subtitle.textContent), /Bach.*Cantatas.*1:01/);
        await section(6, 'genre', 'genres');
        await section(7, 'collection', 'collections');
        await page.evaluate(() => chooseSection(1));
        await page.waitForFunction(() => window.__effectaBookCoverFlow.overlay.hidden);
        assert.equal(await page.locator('main').textContent(), 'Native suggestions');
        await page.waitForFunction(() => !document.getElementById('effecta-coverflow-toolbar-button'));
        await section(0, 'album', 'albums');
        assert.deepEqual(errors, []);
        assert.ok(requests.length < 45, 'bounded catalog requests, without a restoration loop');
    } catch (error) {
        console.error(await page.evaluate(() => {
            const s = window.__effectaBookCoverFlow;
            return { hash: location.hash, key: s.activeCatalogKey, collection: s.activeCollectionType,
                items: s.entries.map(e => e.Id), hidden: s.overlay?.hidden, status: s.status?.textContent };
        }), requests, errors);
        throw error;
    } finally { await browser.close(); }
});
