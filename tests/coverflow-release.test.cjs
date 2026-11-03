'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('the public catalog and package describe the same plugin version', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const meta = JSON.parse(read('packaging/Book CoverFlow/meta.json'));
    const version = read('Jellyfin.Plugin.CoverFlow/Jellyfin.Plugin.CoverFlow.csproj').match(/<Version>([^<]+)<\/Version>/)[1];
    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].name, 'CoverFlow');
    assert.equal(manifest[0].guid, meta.guid);
    assert.equal(manifest[0].versions[0].version, version);
    assert.equal(meta.version, version);
    assert.match(manifest[0].versions[0].checksum, /^[A-F0-9]{32}$/);
    assert.match(manifest[0].versions[0].sourceUrl, /^https:\/\/github\.com\/lucalcin\/jellyfin-coverflow\/releases\/download\//);
    assert.equal(meta.imagePath, 'coverflow.png');
    assert.ok(read('Jellyfin.Plugin.CoverFlow/Constants.cs').includes('"' + version + '"'));
});

test('support links point to the existing Effecta Ko-fi account', () => {
    assert.equal(read('.github/FUNDING.yml').trim(), 'ko_fi: effecta');
    assert.ok(read('README.md').includes('https://ko-fi.com/effecta'));
});

test('readme links to checked-in local documents and artwork', () => {
    const localLinks = [...read('README.md').matchAll(/\]\(([^)]+)\)/g)]
        .map(match => match[1]).filter(target => !/^https?:|^#/.test(target));
    for (const target of localLinks) {
        assert.equal(fs.existsSync(path.join(root, target.split('#')[0])), true, target);
    }
});
