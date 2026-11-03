'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const path = require('node:path');

// Drive real input handlers with a deterministic clock, without a browser or server.
function runtime() {
    let now = 0;
    let nextId = 0;
    const timers = new Map();
    const classes = new Set();
    const window = {
        innerWidth: 390,
        setTimeout(callback, delay) { timers.set(++nextId, { callback, at: now + delay }); return nextId; },
        clearTimeout(id) { timers.delete(id); },
        requestAnimationFrame(callback) {
            timers.set(++nextId, { callback: () => callback(now), at: now + 16 });
            return nextId;
        },
        cancelAnimationFrame(id) { timers.delete(id); },
        positions: [],
        location: {},
    };
    const context = { window, document: { getElementById: () => null }, Date: { now: () => now }, console };
    const source = fs.readFileSync(path.join(__dirname, '../Jellyfin.Plugin.CoverFlow/Web/coverflow.js'), 'utf8')
        .replace('    installStyles();\n    ensureLauncher();\n    waitForApi();', `
            window.testApi = { state, bindArrowHold, stopArrowHold, onKeyDown, selectTypeahead, setSearchVisible,
                realRenderPosition: renderPosition, renderBooks };
            renderPosition = function () { window.positions.push(state.flowPosition === null ? state.index : state.flowPosition); };
        `);
    vm.runInNewContext(source, context);
    const api = window.testApi;
    api.state.entries = Array.from({ length: 500 }, (_, index) => ({ Id: String(index), Name: 'Item ' + index }));
    api.state.index = 100;
    api.state.overlay = { hidden: false };
    api.state.stage = { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } };
    function button(direction) {
        const events = {};
        const control = { addEventListener(name, callback) { events[name] = callback; }, setPointerCapture() {} };
        api.bindArrowHold(control, direction);
        return (name, options = {}) => events[name]({ isPrimary: true, button: 0, pointerId: 1, preventDefault() {}, ...options });
    }
    function advance(milliseconds) {
        const until = now + milliseconds;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            now = next[1].at;
            timers.delete(next[0]);
            next[1].callback();
        }
        now = until;
    }
    return { ...api, button, advance, classes, positions: window.positions };
}

test('a short tap moves once; a normal generated click adds no extra step', () => {
    const r = runtime();
    const fire = r.button(1);
    fire('pointerdown');
    r.advance(100);
    fire('pointerup');
    fire('click', { detail: 1 });
    r.advance(2000);
    assert.equal(r.state.index, 101);
    fire('click', { detail: 0 });
    assert.equal(r.state.index, 102);
});

test('holding accelerates and stops immediately on release or cancellation', () => {
    const r = runtime();
    const fire = r.button(1);
    fire('pointerdown');
    r.advance(1000);
    const firstSecond = r.state.index - 100;
    r.advance(2000);
    const beforeFastWindow = r.state.index;
    r.advance(1000);
    assert.ok(r.state.index - beforeFastWindow > firstSecond);
    assert.ok(r.classes.has('is-fast-scrolling'));
    fire('pointerup');
    const stoppedAt = r.state.index;
    r.advance(3000);
    assert.equal(r.state.index, stoppedAt);
    assert.equal(r.classes.has('is-fast-scrolling'), false);
    fire('pointerdown');
    fire('pointercancel');
    const cancelledAt = r.state.index;
    r.advance(1000);
    assert.equal(r.state.index, cancelledAt);
});

test('a new direction cancels the previous hold; losing focus can stop both', () => {
    const r = runtime();
    const next = r.button(1);
    const previous = r.button(-1);
    next('pointerdown');
    r.advance(400);
    previous('pointerdown', { pointerId: 2 });
    const switchedAt = r.state.index;
    r.advance(600);
    assert.ok(r.state.index < switchedAt);
    r.stopArrowHold();
    const stoppedAt = r.state.index;
    r.advance(2000);
    assert.equal(r.state.index, stoppedAt);
});

test('typing in a real input keeps native edits and Enter does not open a cover', () => {
    const r = runtime();
    let blurred = false;
    const input = { matches: () => true, blur() { blurred = true; } };
    r.state.searchInput = input;
    r.onKeyDown({ target: input, key: 'a', preventDefault() { assert.fail('native input must not be intercepted'); } });
    assert.equal(r.state.typeaheadBuffer, '');
    r.onKeyDown({ target: input, key: 'Enter', preventDefault() {} });
    assert.equal(blurred, true);
    r.state.entries = [{ Name: 'Álan Ford' }, { Name: 'Batman' }];
    r.state.index = 1;
    r.state.typeaheadBuffer = 'alan';
    assert.equal(r.selectTypeahead(false), true);
    assert.equal(r.state.index, 0);
});

test('the keyboard button focuses the real input synchronously and closing clears the search', () => {
    const r = runtime();
    let focused = false;
    r.state.overlay.classList = { toggle() {} };
    r.state.overlay.style = {};
    r.state.searchPanel = { hidden: true };
    r.state.keyboardButton = { setAttribute() {} };
    r.state.searchInput = { value: 'old', focus() { focused = true; }, blur() { focused = false; } };
    r.setSearchVisible(true);
    assert.equal(focused, true);
    assert.equal(r.state.searchPanel.hidden, false);
    assert.equal(r.state.searchInput.value, '');
    r.state.typeaheadBuffer = 'alan';
    r.setSearchVisible(false);
    assert.equal(focused, false);
    assert.equal(r.state.searchPanel.hidden, true);
    assert.equal(r.state.typeaheadBuffer, '');
});

test('Enter on a footer button preserves its native keyboard activation', () => {
    const r = runtime();
    r.onKeyDown({
        target: { closest: () => ({}), matches: () => false },
        key: 'Enter',
        preventDefault() { assert.fail('footer buttons must receive their native click'); },
    });
});

test('a held arrow renders fractional positions on frames instead of integer jumps', () => {
    const r = runtime();
    const fire = r.button(1);
    fire('pointerdown');
    r.advance(1500);
    const frames = r.positions.filter(position => !Number.isInteger(position));
    assert.ok(frames.length > 50);
    for (let index = 1; index < frames.length; index++) {
        assert.ok(frames[index] > frames[index - 1]);
        assert.ok(frames[index] - frames[index - 1] < 0.3);
    }
    fire('pointerup');
    assert.equal(r.state.flowPosition, null);
});

test('continuous navigation stays within library bounds in both directions', () => {
    const r = runtime();
    r.state.index = 498;
    const next = r.button(1);
    next('pointerdown');
    r.advance(4000);
    assert.equal(r.state.index, 499);
    assert.equal(r.state.flowPosition, 499);
    next('pointerup');
    r.state.index = 0;
    const previous = r.button(-1);
    previous('pointerdown');
    r.advance(1500);
    assert.equal(r.state.index, 0);
    assert.equal(r.state.flowPosition, 0);
    previous('pointerup');
});

test('background refresh reuses existing cover nodes even when their indices change', () => {
    const r = runtime();
    const first = { dataset: { entryKey: 'item:a', index: '0' }, querySelector: () => null };
    const second = { dataset: { entryKey: 'item:b', index: '1' }, querySelector: () => null };
    r.state.cards = [first, second];
    r.state.entries = [{ Id: 'b' }, { Id: 'a' }];
    r.renderBooks();
    assert.equal(r.state.cards[0], second);
    assert.equal(r.state.cards[1], first);
    assert.equal(first.dataset.index, '1');
    assert.equal(second.dataset.index, '0');
});

test('fractional cover geometry has no jump when passing the centered position', () => {
    const r = runtime();
    r.state.cards = Array.from({ length: 8 }, (_, index) => ({
        dataset: { index: String(index), loaded: 'true' }, style: {},
        setAttribute() {}, classList: { toggle() {} },
    }));
    r.state.index = 3;
    r.state.lastInfoIndex = 3;
    r.state.flowPosition = 2.999;
    r.realRenderPosition();
    const before = r.state.cards[3].style.transform;
    r.state.flowPosition = 3.001;
    r.realRenderPosition();
    const after = r.state.cards[3].style.transform;
    const offset = transform => Number(transform.match(/translate3d\((-?[\d.]+)px,0,0\)/)[1]);
    assert.ok(Math.abs(offset(before) - offset(after)) < 1);
    assert.equal(r.state.cards[3].style.zIndex, '100');
});
