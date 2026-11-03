'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '../Jellyfin.Plugin.CoverFlow/Web/coverflow.js'), 'utf8');
const html = '<!doctype html><html lang="de"><head><style>body{background:#111;color:white;margin:0}header{height:70px;position:relative;z-index:1200}button{min-width:48px;min-height:48px}</style></head><body><header><button title="Ansichtseinstellungen"><svg></svg></button></header></body></html>';

// This fixture owns its origin and data. It never opens a personal browser profile.
async function startPage(page) {
    page.setDefaultTimeout(6000);
    await page.route('http://coverflow.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://coverflow.test/');
    await page.evaluate(() => {
        location.hash = '#/library?topParentId=music'; window.catalogCalls = 0;
        window.ApiClient = {
            serverInfo: { Id: 'server' }, getCurrentUserId: () => 'user',
            getUserViews: async () => ({ Items: [{ Id: 'music', CollectionType: 'music', Name: 'Music' }] }),
            getItems: async (user, query) => {
                if (query.IncludeItemTypes === 'Audio') {
                    return { Items: Array.from({ length: 35 }, (_, i) => ({ Id: 'track' + i, Name: 'Original track ' + i, IndexNumber: i + 1 })), TotalRecordCount: 35 };
                }
                window.catalogCalls++;
                return { Items: [{ Id: 'album', Name: 'Original album', Type: 'MusicAlbum', AlbumArtists: ['Original artist'] }], TotalRecordCount: 1 };
            },
        };
    });
}

async function exerciseLanguageSwitch(page, expected) {
    await page.addScriptTag({ content: source });
    await page.waitForFunction(() => window.__effectaBookCoverFlow.api && window.__effectaBookCoverFlow.libraryViews.music);
    await page.locator('#effecta-coverflow-toolbar-button').click();
    await page.locator('.ecf-card.is-current .ecf-front').click();
    await page.waitForFunction(() => document.querySelectorAll('.ecf-detail-row').length === 35);
    await page.waitForFunction(text => document.querySelector('.ecf-back-kicker')?.textContent === text, expected.de);
    await page.evaluate(() => {
        window.originalCard = document.querySelector('.ecf-card');
        window.originalRow = document.querySelector('.ecf-detail-row');
        const body = document.querySelector('.ecf-back-body'); body.scrollTop = 120;
        window.originalScroll = body.scrollTop; originalRow.focus({ preventScroll: true });
        window.originalCalls = catalogCalls;
        changeNativeLanguage('fr');
    });
    await page.waitForFunction(text => document.querySelector('.ecf-back-kicker')?.textContent === text, expected.fr);
    assert.deepEqual(await page.evaluate(() => ({ sameCard: originalCard === document.querySelector('.ecf-card'),
        sameRow: originalRow === document.querySelector('.ecf-detail-row'), focused: document.activeElement === originalRow,
        scroll: document.querySelector('.ecf-back-body').scrollTop === originalScroll, calls: catalogCalls === originalCalls,
        title: document.querySelector('.ecf-back-title').textContent })),
    { sameCard: true, sameRow: true, focused: true, scroll: true, calls: true, title: 'Original album' });
    await page.evaluate(() => { changeNativeLanguage('ar'); });
    await page.waitForFunction(text => document.querySelector('.ecf-back-kicker')?.textContent === text, expected.ar);
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    await page.evaluate(() => { changeNativeLanguage('it'); changeNativeLanguage('en-us'); });
    await page.waitForFunction(text => document.querySelector('.ecf-back-kicker')?.textContent === text, expected['en-us']);
    assert.equal(await page.locator('.ecf-back-footer button').getAttribute('aria-label'), 'Open in Jellyfin');
    assert.equal(await page.locator('.ecf-back-footer button').textContent(), '↗');
}

test('live native language changes preserve the flipped card, focus, scroll and catalog', async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await startPage(page);
        await page.evaluate(() => {
            const titles = { de: 'Titel', fr: 'Pistes', ar: 'المقاطع', it: 'Tracce', 'en-us': 'Tracks' };
            let locale = 'de';
            const native = {
                getCurrentLocale: () => locale,
                translate: key => key === 'HeaderTracks' ? titles[locale]
                    : key === 'ViewSettings' ? 'Ansichtseinstellungen' : key,
                loadStrings: () => new Promise(resolve => setTimeout(resolve, 25)),
            };
            function requireNative() { return { renamed: native }; }
            requireNative.m = { 98732: function translator() { return 'Translation dictionary is empty. getCurrentLocale'; } };
            window.webpackChunk = []; webpackChunk.push = packet => packet[2](requireNative);
            window.changeNativeLanguage = next => {
                locale = next; document.documentElement.lang = next;
                document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
            };
        });
        await exerciseLanguageSwitch(page, { de: 'Titel', fr: 'Pistes', ar: 'المقاطع', 'en-us': 'Tracks' });
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('installed Jellyfin globalize and dictionaries supply the live translated labels', {
    skip: !process.env.JELLYFIN_WEB_ROOT || !process.env.JELLYFIN_TRANSLATIONS_ROOT,
}, async () => {
    const chunks = { webpackChunk: [] };
    vm.runInNewContext(fs.readFileSync(path.join(process.env.JELLYFIN_WEB_ROOT, 'main.jellyfin.bundle.js'), 'utf8'), { self: chunks });
    const factories = Object.assign({}, ...chunks.webpackChunk.map(chunk => chunk[1]));
    const [moduleId, factory] = Object.entries(factories).find(([, fn]) => String(fn).includes('Translation dictionary is empty.'));
    const dictionaries = {};
    for (const file of fs.readdirSync(process.env.JELLYFIN_TRANSLATIONS_ROOT)) {
        const capture = { webpackChunk: [] };
        vm.runInNewContext(fs.readFileSync(path.join(process.env.JELLYFIN_TRANSLATIONS_ROOT, file), 'utf8'), { self: capture });
        const module = { exports: {} }; Object.values(capture.webpackChunk[0][1])[0](module);
        dictionaries[file.split('-json.')[0]] = module.exports;
    }
    const nativeKeys = [...source.split('var messages = {')[1].split('\n    };')[0].matchAll(/\['([^']+)'/g)].map(match => match[1]);
    for (const key of nativeKeys) { assert.ok(dictionaries['en-us'][key], 'Missing native key: ' + key); }
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) { errors.push(message.text()); } });
    try {
        await startPage(page);
        await page.evaluate(({ dictionaries, moduleId, factorySource }) => {
            let locale = 'de'; const cache = {};
            const settings = { language: () => locale, dateTimeLocale: () => locale };
            // Dependency shims isolate the installed, unmodified globalize factory.
            function requireNative(id) {
                if (cache[id]) { return cache[id]; }
                if (String(id) === moduleId) {
                    const exports = {}; cache[id] = exports;
                    requireNative.m[id]({}, exports, requireNative); return exports;
                }
                if (id === 77083) { return { A: object => !object || !Object.keys(object).length }; }
                if (id === 71286) { return { B: { LANGUAGE_CHANGE: 'languagechange' } }; }
                if (id === 95569) { return { fe: settings }; }
                if (id === 44797) { return { A: { on() {}, trigger() {} } }; }
                if (id === 93721) { return { cu() {} }; }
                if (id === 75481) { return file => Promise.resolve(dictionaries[file.replace('./', '').replace('.json', '')]); }
                return {};
            }
            requireNative.d = (exports, getters) => Object.entries(getters).forEach(([key, get]) => Object.defineProperty(exports, key, { enumerable: true, get }));
            requireNative.e = () => Promise.resolve();
            requireNative.m = { [moduleId]: (0, eval)('(' + factorySource + ')') };
            window.webpackChunk = []; webpackChunk.push = packet => packet[2](requireNative);
            const native = Object.values(requireNative(moduleId)).find(value => value && typeof value.translate === 'function');
            native.defaultModule('core');
            window.changeNativeLanguage = next => { locale = next; native.updateCurrentCulture(); };
            return native.loadStrings({ name: 'core', translations: Object.keys(dictionaries).map(lang => ({ lang, path: lang + '.json' })) })
                .then(() => { document.querySelector('header button').title = native.translate('ViewSettings'); });
        }, { dictionaries, moduleId, factorySource: String(factory) });
        await exerciseLanguageSwitch(page, Object.fromEntries(Object.entries(dictionaries).map(([key, dict]) => [key, dict.HeaderTracks])));
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});
