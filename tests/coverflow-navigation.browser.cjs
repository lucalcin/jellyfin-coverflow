'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '../Jellyfin.Plugin.CoverFlow/Web/coverflow.js'), 'utf8');
const catalog = Array.from({ length: 170 }, (_, n) => ({ Id: 'item-' + n, Type: 'Movie',
    Name: n === 0 ? '2001' : n === 169 ? 'Zebra' : 'Title ' + String(n).padStart(3, '0'),
    SortName: n === 0 ? '2001' : n === 169 ? 'Zebra' : 'Title ' + String(n).padStart(3, '0') }));

// Native card attributes, native view settings and the local-storage event match
// the installed Jellyfin 12.4 code. Requests use a real HTTP resource observer;
// no personal server, credentials or media are involved.
const html = `<!doctype html><html lang="it"><head><style>
body{margin:0;background:#111;color:white;font:16px Arial}header{position:fixed;inset:0 0 auto;height:64px;background:#111;z-index:1200}
header button{height:48px;width:48px}main{padding-top:80px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.card{height:120px;background:#243746;padding:8px}.card a{color:white}.MuiPopover-root{position:fixed;inset:0;z-index:1300}
.MuiBackdrop-root{position:absolute;inset:0}.MuiPopover-paper{position:absolute;top:64px;left:0;background:#383838;padding:8px;min-width:240px}
.MuiMenuItem-root{display:flex;padding:16px;cursor:pointer}.MuiListItemText-root{flex:1}svg{height:24px;width:24px}
</style></head><body><header><button id="view" title="Mostra impostazioni"><svg></svg></button><button id="sort" title="Ordina">Sort</button></header><main></main>
<script>
location.hash='#/movies?topParentId=library';
window.nativeKey='movies - library';
window.nativeSettings=JSON.parse(localStorage.getItem(nativeKey)||'null')||{ShowTitle:true,ShowYear:true,ViewMode:'grid',ImageType:'Primary',CardLayout:false,SortBy:['SortName'],SortOrder:'Ascending',StartIndex:0,Alphabet:'T',Filters:{IsPlayed:false}};
localStorage.setItem(nativeKey,JSON.stringify(nativeSettings));
window.ApiClient={getCurrentUserId:()=> 'user',serverInfo:{Id:'server'},serverAddress:()=>location.origin,
getUserViews:async()=>({Items:[{Id:'library',CollectionType:'movies'}]}),
getItems:async(user,q)=>{const params=new URLSearchParams();Object.entries(q).forEach(([key,value])=>params.set(key,value));return(await fetch('/Items?'+params)).json();}};
window.renderNative=async()=>{const s=nativeSettings;const p=new URLSearchParams({parentId:'library',includeItemTypes:'Movie',limit:'100',startIndex:String(s.StartIndex),sortOrder:s.SortOrder,isPlayed:'false'});s.SortBy.forEach(by=>p.append('sortBy',by));if(s.Alphabet)p.set('nameStartsWith',s.Alphabet);const data=await(await fetch('/Items?'+p)).json();const main=document.querySelector('main');main.style.gridTemplateColumns=s.ViewMode==='list'?'1fr':'repeat(4,1fr)';main.replaceChildren(...data.Items.map(item=>{const card=document.createElement('article');card.className='card';card.dataset.id=item.Id;card.dataset.type='Movie';const link=document.createElement('a');link.href='#/details?id='+item.Id;link.textContent=item.Name;card.append(link);return card;}));};
window.addEventListener('local-storage',event=>{if(event.key===nativeKey){nativeSettings=JSON.parse(localStorage.getItem(nativeKey));renderNative();}});
window.commitNative=patch=>{nativeSettings={...nativeSettings,...patch};localStorage.setItem(nativeKey,JSON.stringify(nativeSettings));window.dispatchEvent(new StorageEvent('local-storage',{key:nativeKey}));};
window.menu=function(id,sort){document.getElementById(id)?.remove();const root=document.createElement('div');root.id=id;root.className='MuiPopover-root MuiModal-root';const backdrop=document.createElement('div');backdrop.className='MuiBackdrop-root';backdrop.onclick=()=>root.remove();const paper=document.createElement('div');paper.className='MuiPopover-paper';const list=document.createElement('ul');list.className='MuiList-root';(sort?[['Nome','SortName'],['Aggiunto il','DateCreated,SortName']]:[['Vista Griglia','grid'],['Vista a Elenco','list']]).forEach(([label,value])=>{const row=document.createElement('li');row.className='MuiMenuItem-root';row.tabIndex=0;row.dataset.choice=value;const icon=document.createElement('span');icon.className='MuiListItemIcon-root';const text=document.createElement('span');text.className='MuiListItemText-root';const primary=document.createElement('span');primary.className='MuiListItemText-primary';primary.textContent=label;text.append(primary);row.append(icon,text);row.onclick=()=>sort?commitNative({SortBy:value.split(','),SortOrder:nativeSettings.SortBy.join(',')===value&&nativeSettings.SortOrder==='Ascending'?'Descending':'Ascending',StartIndex:0}):commitNative({ViewMode:value});list.append(row);});paper.append(list);root.append(backdrop,paper);document.body.append(root);};
document.getElementById('view').onclick=()=>menu('selectview-popover',false);
document.getElementById('sort').onclick=()=>menu('sort-popover',true);
renderNative();
</script></body></html>`;

test('alphabet and Grid/List/CoverFlow switches keep the same item across native pages and sorting', async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors = []; const warnings = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') { warnings.push(message.text()); } });
    await context.route('http://coverflow.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname !== '/Items') { return route.fulfill({ contentType: 'text/html', body: html }); }
        const params = Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
        const order = url.searchParams.getAll('sortBy').join(',') || params.sortby || 'SortName';
        let items = order.startsWith('DateCreated') ? [...catalog].reverse() : [...catalog];
        if (params.sortorder === 'Descending') { items.reverse(); }
        if (params.namestartswith) { items = items.filter(item => item.SortName.startsWith(params.namestartswith)); }
        const total = items.length;
        items = items.slice(Number(params.startindex || 0), Number(params.startindex || 0) + Number(params.limit || total));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Items: items, TotalRecordCount: total }) });
    });
    async function closeMenu(id) { await page.locator('#' + id + ' .MuiBackdrop-root').click({ position: { x: 1000, y: 500 } }); }
    async function chooseNative(mode) {
        await page.locator('#view').click(); await page.locator('#effecta-coverflow-menu-item').waitFor();
        await page.locator('[data-ecf-native-view][data-choice="' + mode + '"]').click(); await closeMenu('selectview-popover');
    }
    async function currentIs(id) {
        await page.waitForFunction(value => window.__effectaBookCoverFlow.entries[window.__effectaBookCoverFlow.index]?.Id === value, id);
    }
    async function nativeFocusIs(id) {
        await page.waitForFunction(value => document.activeElement?.closest('.card')?.dataset.id === value, id);
    }
    try {
        await page.goto('http://coverflow.test/'); await page.addScriptTag({ content: source });
        await page.waitForFunction(() => Boolean(window.__effectaBookCoverFlow.api));
        await page.locator('.card[data-id="item-30"] a').focus();
        await page.locator('#effecta-coverflow-toolbar-button').click(); await currentIs('item-30');
        assert.equal(await page.locator('.ecf-alphabet button').count(), 27);
        await page.getByRole('button', { name: 'Vai alla iniziale Z', exact: true }).focus();
        await page.keyboard.press('Enter'); await currentIs('item-169');
        await chooseNative('grid'); await nativeFocusIs('item-169');
        assert.equal(await page.evaluate(() => window.nativeSettings.StartIndex), 100);
        assert.equal(await page.evaluate(() => window.nativeSettings.Alphabet), null);
        assert.deepEqual(await page.evaluate(() => window.nativeSettings.Filters), { IsPlayed: false });
        await chooseNative('list'); await nativeFocusIs('item-169');
        await page.locator('#sort').click(); await page.locator('[data-choice="DateCreated,SortName"]').click(); await closeMenu('sort-popover');
        await nativeFocusIs('item-169');
        assert.equal(await page.evaluate(() => window.nativeSettings.StartIndex), 0);
        await page.locator('#effecta-coverflow-toolbar-button').click(); await currentIs('item-169');
        assert.equal(await page.evaluate(() => window.__effectaBookCoverFlow.activeSortBy), 'DateCreated,SortName');
        await page.getByRole('button', { name: 'Numeri e simboli', exact: true }).click(); await currentIs('item-0');
        await chooseNative('grid'); await nativeFocusIs('item-0');
        assert.equal(await page.evaluate(() => window.nativeSettings.StartIndex), 100);
        await page.locator('#effecta-coverflow-toolbar-button').click(); await currentIs('item-0');
        await page.setViewportSize({ width: 390, height: 844 });
        const fits = await page.locator('.ecf-alphabet').evaluate(node => {
            const bounds = node.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 48 && bounds.bottom <= innerHeight;
        });
        assert.equal(fits, true);
        assert.equal(await page.getByRole('button', { name: 'Vai alla iniziale Q', exact: true }).isDisabled(), true);
        assert.deepEqual(errors, []);
    } catch (error) {
        const snapshot = await page.evaluate(() => {
            const s = window.__effectaBookCoverFlow; const job = s.nativeSelectionJob;
            return { native: window.nativeSettings, focus: document.activeElement?.outerHTML.slice(0,200),
                query: s.nativeQueries, anchor: s.selectionAnchors,
                job: job && { busy: job.busy, located: job.located, firstId: job.firstId },
                note: s.selectionNote?.textContent, firstCard: document.querySelector('main .card')?.dataset.id };
        });
        throw new Error(error.message + '\n' + JSON.stringify(snapshot) + '\n' + warnings.join('\n') + '\n' + errors.join('\n'), { cause: error });
    } finally { await context.close(); await browser.close(); }
});
