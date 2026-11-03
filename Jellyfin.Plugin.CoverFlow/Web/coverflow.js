'use strict';

/********************************************************************
 *  BLOCK 01 - RUNTIME GUARD AND SETTINGS
 *
 *  The injector can evaluate this file more than once after cache or
 *  navigation changes. The global guard keeps one component instance.
 ********************************************************************/
(function initializeBookCoverFlow() {
    if (window.__effectaBookCoverFlow) {
        return;
    }

    var state = {
        api: null,
        button: null,
        overlay: null,
        stage: null,
        title: null,
        subtitle: null,
        heading: null,
        status: null,
        backButton: null,
        searchPanel: null,
        searchInput: null,
        searchResult: null,
        keyboardButton: null,
        arrowHoldStop: null,
        flowPosition: null,
        visibleCards: [],
        lastInfoIndex: -1,
        detailCard: null,
        detailKey: null,
        detailGeneration: 0,
        detailCache: new Map(),
        folderStack: [],
        folderId: null,
        books: [],
        series: [],
        entries: [],
        mode: 'items',
        currentSeries: null,
        seriesIndex: 0,
        index: 0,
        cards: [],
        activeStart: 0,
        activeEnd: -1,
        pointerId: null,
        pointerStartX: 0,
        pointerCurrentX: 0,
        pointerStartCardIndex: null,
        suppressClickUntil: 0,
        wheelLockedUntil: 0,
        launcherTimer: null,
        menuObserver: null,
        menuCloseObserver: null,
        menuRoot: null,
        menuReturnOverflow: '',
        menuRestoreTimer: null,
        menuWatchTimer: null,
        menuSyncPending: false,
        menuCaptureInstalled: false,
        layoutMenuRequestedUntil: 0,
        activeLibraryId: null,
        activeCollectionType: null,
        lastAutoOpenRoute: null,
        libraryIds: [],
        libraryViews: Object.create(null),
        loadGeneration: 0,
        loadingLoaded: 0,
        loadingTotal: 0,
        loadingComplete: true,
        typeaheadBuffer: '',
        typeaheadTimer: null,
        sortCaptureInstalled: false,
        sortPreferences: Object.create(null),
        sortResourceObserver: null,
        sortRequestSince: Object.create(null),
        reordering: false,
        activeSortBy: 'SortName',
        activeSortOrder: 'Ascending'
    };

    var MAX_ITEMS = 5000;
    var INITIAL_PAGE_SIZE = 80;
    var PAGE_SIZE = 500;
    var VISIBLE_RADIUS = 5;
    var STYLE_ID = 'effecta-coverflow-style';
    var MENU_ITEM_ID = 'effecta-coverflow-menu-item';
    var OVERLAY_ID = 'effecta-coverflow-overlay';

    window.__effectaBookCoverFlow = state;

    /****************************************************************
     *  BLOCK 02 - SAFE DOM HELPERS
     ****************************************************************/
    function element(tagName, className, text) {
        var node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = text;
        }
        return node;
    }

    function setStatus(message, isError) {
        if (!state.status) {
            return;
        }
        state.status.textContent = message || '';
        state.status.classList.toggle('is-error', Boolean(isError));
    }

    function getCurrentLibraryId() {
        var hashQuery = window.location.hash.includes('?')
            ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
            : '';
        var parameters = new URLSearchParams(window.location.search + '&' + hashQuery);
        return parameters.get('topParentId') || parameters.get('parentId') || null;
    }

    function getPreferenceKey() {
        var serverId = state.api && state.api.serverInfo ? state.api.serverInfo.Id : 'server';
        var userId = state.api && state.api.getCurrentUserId ? state.api.getCurrentUserId() : 'user';
        return 'effecta-coverflow-libraries:' + serverId + ':' + userId;
    }

    function getRememberedLibraries() {
        try {
            return JSON.parse(window.localStorage.getItem(getPreferenceKey()) || '{}');
        } catch (error) {
            return {};
        }
    }

    function setLibraryRemembered(libraryId, remembered) {
        if (!libraryId) {
            return;
        }
        var libraries = getRememberedLibraries();
        if (remembered) {
            libraries[libraryId] = true;
        } else {
            delete libraries[libraryId];
        }
        window.localStorage.setItem(getPreferenceKey(), JSON.stringify(libraries));
    }

    /****************************************************************
     *  BLOCK 03 - STYLES
     *
     *  All names are prefixed to avoid collisions with Jellyfin Web.
     ****************************************************************/
    function installStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        var style = element('style');
        style.id = STYLE_ID;
        style.textContent = [
            '#effecta-coverflow-menu-item .ecf-menu-icon,#effecta-coverflow-toolbar-button .ecf-menu-icon{width:1.5rem;height:1.5rem;fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}',
            '#effecta-coverflow-toolbar-button[aria-pressed="true"]{color:#00a4dc;background:#00a4dc2e}',
            '#effecta-coverflow-menu-item{box-sizing:border-box;width:100%;font:inherit;color:inherit;text-align:left}',
            '#effecta-coverflow-menu-item .ecf-menu-mark{width:1.5rem;height:1.5rem;display:block}',
            '#effecta-coverflow-menu-item .ecf-menu-trailing{margin-left:1rem;flex:none}',
            '#selectview-popover[data-ecf-coverflow-active="true"] [data-ecf-native-view] .MuiListItemIcon-root>svg{visibility:hidden}',
            '#effecta-coverflow-overlay{position:fixed;inset:0;z-index:1100;display:flex;flex-direction:column;background:radial-gradient(circle at 50% 38%,#263847 0,#101820 44%,#050708 100%);color:#fff;overflow:hidden;overscroll-behavior:none}',
            '#effecta-coverflow-overlay[hidden]{display:none}',
            '.ecf-heading{position:absolute;left:1rem;right:1rem;min-width:0;text-align:center;z-index:3;pointer-events:none;text-shadow:0 2px 7px #000,0 0 16px #000}',
            '.ecf-heading h2{display:inline-block;max-width:min(92vw,70rem);font-size:clamp(1.1rem,2.4vw,1.6rem);margin:0;padding:.18rem .7rem;border-radius:.6rem;background:#050708a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:top}',
            '.ecf-heading p{width:max-content;max-width:min(90vw,55rem);margin:.22rem auto 0;padding:.08rem .5rem;border-radius:.5rem;background:#0507088f;color:#d3dbe0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.ecf-icon-button{width:2.8rem;height:2.8rem;border:0;border-radius:50%;background:#ffffff1c;color:#fff;font-size:1.5rem;cursor:pointer}',
            '.ecf-icon-button:hover,.ecf-icon-button:focus-visible{background:#ffffff35;outline:2px solid #00a4dc}',
            '.ecf-stage{position:relative;flex:1;min-height:22rem;perspective:1250px;touch-action:none;user-select:none;-webkit-user-select:none}',
            '.ecf-card{position:absolute;left:50%;top:49%;width:clamp(11rem,26vw,23rem);aspect-ratio:2/3;border:0;padding:0;background:transparent;border-radius:.45rem;overflow:visible;transform-origin:center center;transition:transform .42s cubic-bezier(.22,.61,.36,1),opacity .3s ease,filter .3s ease;cursor:pointer;will-change:transform,opacity;backface-visibility:hidden;contain:layout}',
            '.ecf-stage.is-dragging .ecf-card{transition:none}',
            '.ecf-stage.is-fast-scrolling .ecf-card{transition:none}',
            '.ecf-cover-surface,.ecf-stack-layer{position:absolute;inset:0;border-radius:.45rem;overflow:hidden;background:linear-gradient(145deg,#38586b,#18272f);box-shadow:0 1.2rem 2.7rem #000c;pointer-events:none}',
            '.ecf-cover-surface{z-index:3;-webkit-box-reflect:below .6rem linear-gradient(to bottom,rgba(255,255,255,.22) 0,rgba(255,255,255,.08) 13%,transparent 29%)}',
            '.ecf-stack-layer{z-index:1;transform:translate3d(.72rem,-.48rem,0) rotate(4deg)}',
            '.ecf-stack-layer.ecf-stack-near{z-index:2;transform:translate3d(.38rem,-.25rem,0) rotate(2deg)}',
            '.ecf-cover-surface img,.ecf-stack-layer img{display:block;width:100%;height:100%;object-fit:cover;background:#24313a;pointer-events:none;-webkit-user-drag:none}',
            '.ecf-card-placeholder{display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:4rem;background:linear-gradient(145deg,#38586b,#18272f);pointer-events:none}',
            '.ecf-kind-badge,.ecf-item-index{position:absolute;z-index:4;bottom:.5rem;border-radius:1rem;background:#050708d9;color:#fff;font-size:.68rem;font-weight:700;letter-spacing:.06em;line-height:1;padding:.42rem .58rem;box-shadow:0 .15rem .55rem #0008;pointer-events:none}',
            '.ecf-kind-badge{left:50%;transform:translateX(-50%);white-space:nowrap}',
            '.ecf-item-index{right:.5rem;letter-spacing:0}',
            '.ecf-card.is-current{cursor:pointer}',
            '.ecf-card.is-album{aspect-ratio:1/1;width:clamp(13rem,32vw,27rem)}',
            '.ecf-flipper{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .52s cubic-bezier(.22,.61,.36,1)}',
            '.ecf-card.is-flipped .ecf-flipper{transform:rotateY(180deg)}',
            '.ecf-front,.ecf-back{position:absolute;inset:0;box-sizing:border-box;border:0;border-radius:.45rem;backface-visibility:hidden;-webkit-backface-visibility:hidden}',
            '.ecf-front{display:block;padding:0;width:100%;height:100%;background:transparent;color:inherit;cursor:pointer;transform:translateZ(1px)}',
            '.ecf-card.is-flipped .ecf-front{pointer-events:none}',
            '.ecf-back{display:flex;flex-direction:column;text-align:left;overflow:hidden;background:linear-gradient(145deg,#263a48,#101b24 70%);border:1px solid #ffffff26;box-shadow:0 1.2rem 2.7rem #000a;transform:rotateY(180deg) translateZ(1px);color:#f4f7fa;pointer-events:none;font-size:clamp(.76rem,1.05vw,.9rem)}',
            '.ecf-card.is-flipped .ecf-back{pointer-events:auto}',
            '.ecf-back-header{flex:none;padding:.85rem .9rem .65rem;border-bottom:1px solid #ffffff1a;position:relative}',
            '.ecf-back-kicker{margin:0 2rem .3rem 0;color:#6ed1f2;font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700}',
            '.ecf-back-title{margin:0 1.8rem .35rem 0;font-size:1.12em;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
            '.ecf-back-meta{margin:0;color:#bdcbd5;font-size:.9em;line-height:1.4}',
            '.ecf-flip-close{position:absolute;right:.45rem;top:.45rem;width:1.9rem;height:1.9rem;font-size:1.1rem}',
            '.ecf-back-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:#55778b transparent}',
            '.ecf-detail-note,.ecf-plot{margin:0;padding:.8rem .9rem;line-height:1.65;color:#e1e9ee;white-space:pre-wrap;overflow-wrap:anywhere}',
            '.ecf-detail-note{color:#b8c9d5;font-size:.92em}',
            '.ecf-detail-row{display:flex;align-items:center;gap:.55rem;width:100%;border:0;border-bottom:1px solid #ffffff0c;background:transparent;color:inherit;text-align:left;padding:.65rem .8rem;font:inherit;cursor:pointer;min-height:2.5rem;touch-action:pan-y}',
            '.ecf-detail-row:hover,.ecf-detail-row:focus-visible{background:#6ed1f217;outline-offset:-2px;outline:2px solid #6ed1f2}',
            '.ecf-detail-number{flex:none;min-width:1.6rem;color:#91acbd;font-variant-numeric:tabular-nums;font-size:.85em}',
            '.ecf-detail-name{flex:1;min-width:0;line-height:1.35;overflow-wrap:anywhere}',
            '.ecf-detail-duration{flex:none;color:#a6bbc9;font-size:.85em;font-variant-numeric:tabular-nums}',
            '.ecf-detail-section{position:sticky;top:0;margin:0;padding:.4rem .8rem;background:#1d303e;color:#7fd6f2;font-size:.8em;letter-spacing:.06em;z-index:1}',
            '.ecf-back-footer{display:flex;gap:.4rem;padding:.6rem .8rem;border-top:1px solid #ffffff1a;flex:none}',
            '.ecf-detail-action{display:block;width:100%;border:1px solid #5cc9ed66;border-radius:.35rem;background:#00a4dc1a;color:#a7e5fa;padding:.5rem;font:inherit;font-size:.9em;cursor:pointer;text-align:center}',
            '.ecf-detail-action:hover,.ecf-detail-action:focus-visible{background:#00a4dc40;outline:2px solid #6ed1f2}',
            '.ecf-stage.has-details{touch-action:pan-y}',
            '.ecf-stage.has-details .ecf-card:not(.is-flipped){opacity:.22!important;pointer-events:none!important}',
            '.ecf-stage.has-details .ecf-cover-surface{-webkit-box-reflect:unset}',
            '.ecf-stage.has-details .ecf-card.is-flipped{filter:none!important;z-index:120!important}',
            '.ecf-card:focus-visible{outline:3px solid #00a4dc;outline-offset:5px}',
            '.ecf-footer{display:flex;flex-direction:column;align-items:center;gap:.65rem;padding:.4rem 1rem max(.75rem,env(safe-area-inset-bottom));z-index:2}',
            '.ecf-controls{display:flex;align-items:center;gap:1rem}',
            '.ecf-controls .ecf-icon-button{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}',
            '.ecf-keyboard-icon{width:1.5rem;height:1.5rem;fill:none;stroke:currentColor;stroke-width:1.6;vertical-align:middle}',
            '.ecf-search{display:flex;flex-direction:column;align-items:center;gap:.5rem;width:min(90vw,26rem)}',
            '.ecf-search[hidden]{display:none}',
            '.ecf-search input{box-sizing:border-box;width:100%;min-width:0;padding:.7rem .9rem;border:1px solid #00a4dc;border-radius:.75rem;background:#101820;color:white;font:inherit;font-size:16px}',
            '.ecf-search-result{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}',
            '#effecta-coverflow-overlay.is-searching .ecf-stage{min-height:0}',
            '#effecta-coverflow-overlay.is-searching .ecf-heading{display:none}',
            '#effecta-coverflow-overlay.is-searching .ecf-card{width:min(30vw,18vh,8rem);top:45%}',
            '#effecta-coverflow-overlay.is-searching .ecf-cover-surface{-webkit-box-reflect:unset}',
            '.ecf-level-up{background:#00a4dc;color:#07151b;font-size:1.35rem;font-weight:700}',
            '.ecf-status{min-height:1.2rem;color:#bdc8d0;font-size:.88rem;text-align:center}',
            '.ecf-status.is-error{color:#ff9e9e}',
            '@media(max-width:600px){.ecf-stage{min-height:17rem}.ecf-card{top:48%;width:clamp(8rem,43vw,11.5rem)}.ecf-heading h2{font-size:1.05rem}}',
            '@media(max-width:600px){.ecf-card.is-album{width:clamp(10rem,52vw,14rem)}.ecf-card:not(.is-current) .ecf-cover-surface,.ecf-stage.is-fast-scrolling .ecf-cover-surface{-webkit-box-reflect:unset}.ecf-cover-surface,.ecf-stack-layer{box-shadow:0 .7rem 1.5rem #0009}.ecf-back-header{padding:.6rem .65rem .5rem}.ecf-back{font-size:.8rem;inset:auto;left:50%;top:50%;width:min(76vw,22rem);height:var(--ecf-back-height,24rem);transform:translate(-50%,-50%) rotateY(180deg) translateZ(1px)}.ecf-detail-row{padding:.6rem .65rem}.ecf-stage.has-details .ecf-card.is-flipped{transform:translate3d(-50%,-50%,0)!important}}',
            '@media(prefers-reduced-motion:reduce){.ecf-card,.ecf-flipper{transition:none}}'
        ].join('');
        document.head.appendChild(style);
    }

    /****************************************************************
     *  BLOCK 04 - JELLYFIN API DISCOVERY
     ****************************************************************/
    function waitForApi() {
        var attempts = 0;
        var timer = window.setInterval(function pollApi() {
            attempts += 1;
            if (window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function') {
                var userId = window.ApiClient.getCurrentUserId();
                if (userId) {
                    window.clearInterval(timer);
                    state.api = window.ApiClient;
                    discoverLibraries(userId);
                    return;
                }
            }
            if (attempts >= 120) {
                window.clearInterval(timer);
            }
        }, 500);
    }

    async function discoverLibraries(userId) {
        try {
            var response = await state.api.getUserViews({ userId: userId });
            state.libraryIds = (response.Items || []).map(function rememberLibrary(item) {
                state.libraryViews[item.Id] = item;
                return item.Id;
            });

            if (state.libraryIds.length > 0) {
                ensureLauncher();
            }
        } catch (error) {
            console.error('CoverFlow: unable to discover Jellyfin libraries.', error);
        }
    }

    /****************************************************************
     *  BLOCK 05 - LAUNCHER AND OVERLAY
     ****************************************************************/
    function ensureLauncher() {
        installMenuIntegration();
        installSortTracking();
        installNativeSortObserver();
        syncLauncher();
        if (!state.launcherTimer) {
            state.launcherTimer = window.setInterval(syncLauncher, 1000);
        }
    }

    function installMenuIntegration() {
        if (state.menuCaptureInstalled) { return; }
        document.addEventListener('click', function captureViewChoice(event) {
            var target = event.target;
            if (!target || !target.closest) { return; }
            var viewButton = target.closest([
                '.btnSelectView', 'button[title="Mostra impostazioni"]',
                'button[aria-label="Mostra impostazioni"]', 'button[title="View settings"]',
                'button[aria-label="View settings"]', 'button[aria-describedby="selectview-popover"]'
            ].join(','));
            if (viewButton && viewButton.id !== 'effecta-coverflow-toolbar-button') {
                if (!state.menuRestoreTimer) {
                    state.menuReturnOverflow = state.overlay && !state.overlay.hidden ? '' : document.body.style.overflow;
                }
                window.clearTimeout(state.menuRestoreTimer);
                state.menuRestoreTimer = null;
                state.layoutMenuRequestedUntil = Date.now() + 1500;
                watchLayoutMenu(document.body);
                scheduleMenuIntegration();
                window.clearTimeout(state.menuWatchTimer);
                state.menuWatchTimer = window.setTimeout(function stopUnmatchedMenuWatch() {
                    if (!state.menuRoot && state.menuObserver) { state.menuObserver.disconnect(); }
                }, 1600);
                return;
            }
            selectNativeViewFromMenu(target);
        }, true);
        document.addEventListener('keydown', function captureNativeViewKey(event) {
            if ((event.key === 'Enter' || event.key === ' ') && event.target && event.target.closest) {
                // MUI can activate onClick directly from keydown, without a DOM click.
                selectNativeViewFromMenu(event.target);
            }
        }, true);
        state.menuCaptureInstalled = true;
        window.setTimeout(integrateLayoutMenu, 0);
    }

    function selectNativeViewFromMenu(target) {
        var row = target.closest('[data-ecf-native-view]');
        // The Grid row includes a separate settings button, not a view choice.
        var nestedButton = target.closest('button');
        if (row && (!nestedButton || nestedButton === row)) {
            setLibraryRemembered(getCurrentLibraryId(), false);
            closeCoverFlow(false);
            syncLayoutMenuSelection();
        }
    }

    function watchLayoutMenu(root) {
        if (!root) { return; }
        if (!state.menuObserver) {
            state.menuObserver = new MutationObserver(function detectLayoutMenu() {
                if (state.menuSyncPending) { return; }
                state.menuSyncPending = true;
                window.requestAnimationFrame(function syncChangedMenu() {
                    state.menuSyncPending = false;
                    integrateLayoutMenu();
                });
            });
        }
        state.menuObserver.disconnect();
        if (state.menuCloseObserver) { state.menuCloseObserver.disconnect(); }
        state.menuRoot = root === document.body ? null : root;
        state.menuObserver.observe(root, { childList: true, subtree: true });
        if (state.menuRoot) {
            if (!state.menuCloseObserver) {
                state.menuCloseObserver = new MutationObserver(function detectPopoverRemoval() {
                    if (state.menuRoot && !state.menuRoot.isConnected) { releaseLayoutMenu(); }
                });
            }
            state.menuCloseObserver.observe(document.body, { childList: true });
        }
    }

    function releaseLayoutMenu() {
        state.menuObserver.disconnect();
        if (state.menuCloseObserver) { state.menuCloseObserver.disconnect(); }
        state.menuRoot = null;
        // MUI restores its saved body style when a popover exits. Reconcile
        // afterwards so switching from CoverFlow does not leave Grid locked.
        window.clearTimeout(state.menuRestoreTimer);
        state.menuRestoreTimer = window.setTimeout(function restoreAfterNativePopover() {
            state.menuRestoreTimer = null;
            if (document.getElementById('selectview-popover') || document.querySelector('.MuiModal-root')) { return; }
            document.body.style.overflow = state.overlay && !state.overlay.hidden ? 'hidden' : state.menuReturnOverflow;
        }, 50);
    }

    function syncLauncher() {
        if (state.menuRoot && !state.menuRoot.isConnected) {
            releaseLayoutMenu();
        }
        syncOpenLibrary();
        var currentButton = document.getElementById('effecta-coverflow-toolbar-button');
        if (currentButton && currentButton.getClientRects().length > 0) {
            state.button = currentButton;
            setLauncherActive(Boolean(state.overlay && !state.overlay.hidden));
            maybeAutoOpenRememberedLibrary();
            return;
        }

        var viewButton = Array.from(document.querySelectorAll([
            'button[title="Mostra impostazioni"]',
            'button[aria-label="Mostra impostazioni"]',
            'button[title="View settings"]',
            'button[aria-label="View settings"]',
            '.btnSelectView'
        ].join(','))).find(function isVisible(button) {
            return button.getClientRects().length > 0;
        });

        if (!viewButton) {
            state.button = null;
            return;
        }

        var button = viewButton.cloneNode(true);
        button.id = 'effecta-coverflow-toolbar-button';
        button.removeAttribute('aria-describedby');
        button.removeAttribute('aria-controls');
        button.setAttribute('title', 'CoverFlow');
        button.setAttribute('aria-label', 'Attiva o disattiva CoverFlow');
        button.setAttribute('aria-pressed', 'false');

        var originalIcon = button.querySelector('svg');
        var icon = createMenuIcon();
        if (originalIcon && originalIcon.getAttribute('class')) {
            icon.setAttribute('class', originalIcon.getAttribute('class') + ' ecf-menu-icon');
        }
        button.replaceChildren(icon);
        button.addEventListener('click', function toggleRememberedCoverFlow() {
            var isOpen = state.overlay && !state.overlay.hidden;
            setLibraryRemembered(getCurrentLibraryId(), !isOpen);
            if (isOpen) {
                closeCoverFlow();
            } else {
                openCoverFlow();
            }
        });
        viewButton.insertAdjacentElement('afterend', button);

        state.button = button;
        maybeAutoOpenRememberedLibrary();
    }

    function syncOpenLibrary() {
        var libraryId = getCurrentLibraryId();
        if (!state.api || !libraryId || !state.overlay || state.overlay.hidden) {
            return;
        }
        var sort = getCurrentSortSettings();
        var libraryChanged = libraryId !== state.activeLibraryId;
        var sortChanged = sort.by !== state.activeSortBy || sort.order !== state.activeSortOrder;
        if (libraryChanged) {
            selectLibrary(libraryId);
            loadBooks();
        } else if (sortChanged) {
            reloadSortedLibrary(sort);
        }
    }

    function reloadSortedLibrary(sort) {
        stopArrowHold();
        closeDetails();
        setSearchVisible(false);
        state.activeSortBy = sort.by;
        state.activeSortOrder = sort.order;
        return loadBooks(true);
    }

    function installSortTracking() {
        if (state.sortCaptureInstalled) {
            return;
        }
        function captureSortChoice(event) {
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') { return; }
            var row = event.target && event.target.closest
                ? event.target.closest('#sort-popover .MuiMenuItem-root')
                : null;
            if (!row) {
                var button = event.target && event.target.closest && event.target.closest(
                    'button[title="Ordina"],button[aria-label="Ordina"],button[title="Sort"],button[aria-describedby="sort-popover"]'
                );
                if (button) {
                    [0, 80, 250].forEach(function readOpenedSort(delay) {
                        window.setTimeout(readNativeSortMenu, delay);
                    });
                }
                return;
            }
            var labelNode = row.querySelector('.MuiListItemText-primary,.actionSheetItemText,.listItemBodyText');
            var label = String(labelNode ? labelNode.textContent : row.textContent || '').trim();
            var sortBy = getSortFieldForLabel(label);
            if (!sortBy) {
                return;
            }
            var libraryId = getCurrentLibraryId();
            state.sortRequestSince[libraryId] = window.performance ? window.performance.now() : 0;
            // Read after React commits: the arrow now describes the resulting
            // order, not the order that was selected before the click.
            window.setTimeout(function followNativeSortSelection() {
                if (libraryId !== getCurrentLibraryId()) { return; }
                if (!readNativeSortMenu()) {
                    var previous = getCurrentSortSettings();
                    rememberNativeSort(libraryId, sortBy, previous.by === sortBy
                        && previous.order === 'Ascending' ? 'Descending' : 'Ascending');
                }
            }, 0);
        }
        document.addEventListener('click', captureSortChoice, true);
        document.addEventListener('keydown', captureSortChoice, true);
        state.sortCaptureInstalled = true;
    }

    function rememberNativeSort(libraryId, by, order) {
        if (!libraryId || !by || !order) { return; }
        state.sortPreferences[libraryId] = { by: by, order: order };
        syncOpenLibrary();
    }

    function readNativeSortMenu() {
        var menu = document.getElementById('sort-popover');
        if (!menu) { return false; }
        var rows = Array.from(menu.querySelectorAll('.MuiMenuItem-root'));
        return rows.some(function findSelectedSort(row) {
            var order = detectSortOrder(row);
            var label = row.querySelector('.MuiListItemText-primary');
            var by = label && getSortFieldForLabel(String(label.textContent).trim());
            if (!order || !by) { return false; }
            rememberNativeSort(getCurrentLibraryId(), by, order);
            return true;
        });
    }

    function installNativeSortObserver() {
        if (!state.api || state.sortResourceObserver || typeof PerformanceObserver === 'undefined') { return; }
        // Observe completed native catalog requests rather than modifying
        // Jellyfin's fetch/XHR functions or reading private React state.
        state.sortResourceObserver = new PerformanceObserver(function nativeCatalogRequests(batch) {
            batch.getEntries().forEach(readNativeSortRequest);
        });
        try {
            state.sortResourceObserver.observe({ type: 'resource', buffered: true });
        } catch (error) {
            state.sortResourceObserver.disconnect();
            state.sortResourceObserver = null;
        }
    }

    function readNativeSortRequest(resource) {
        if (!resource.name || !/\/Items(?:\?|$)/i.test(resource.name)) { return; }
        try {
            var url = new URL(resource.name, window.location.href);
            var server = typeof state.api.serverAddress === 'function' ? state.api.serverAddress() : window.location.origin;
            if (url.origin !== new URL(server, window.location.href).origin) { return; }
            var params = Object.create(null);
            url.searchParams.forEach(function readParameter(value, key) { params[key.toLowerCase()] = value; });
            // CoverFlow catalog queries must never feed their own settings back.
            if (params.fields === 'PrimaryImageAspectRatio,People,ChildCount,ParentId,SortName') { return; }
            var libraryId = getCurrentLibraryId();
            var normalizeId = function normalizeId(value) { return String(value || '').replace(/-/g, '').toLowerCase(); };
            if (!libraryId || normalizeId(params.parentid) !== normalizeId(libraryId)) { return; }
            if (params.sortby && params.sortorder) {
                if (resource.startTime < (state.sortRequestSince[libraryId] || 0)) { return; }
                state.sortRequestSince[libraryId] = resource.startTime || 0;
                rememberNativeSort(libraryId, params.sortby, params.sortorder);
            }
        } catch (error) {
            // Resource timing is optional; the native menu remains the fallback.
        }
    }

    function getSortFieldForLabel(label) {
        var fields = {
            'Nome': 'SortName',
            'Name': 'SortName',
            'Casuale': 'Random',
            'Random': 'Random',
            'Artista album': 'AlbumArtist,SortName',
            'Artista dell’album': 'AlbumArtist,SortName',
            'Artista Album': 'AlbumArtist,SortName',
            'Album artist': 'AlbumArtist,SortName',
            'Autore': 'AlbumArtist,SortName',
            'Voto del pubblico': 'CommunityRating,SortName',
            'Community rating': 'CommunityRating,SortName',
            'Voto della critica': 'CriticRating,SortName',
            'Critics rating': 'CriticRating,SortName',
            'Aggiunto il': 'DateCreated,SortName',
            'Date added': 'DateCreated,SortName',
            'Data riproduzione': 'DatePlayed,SortName',
            'Date played': 'DatePlayed,SortName',
            'Classificazione per genitori': 'OfficialRating,SortName',
            'Parental rating': 'OfficialRating,SortName',
            'Riproduzioni': 'PlayCount,SortName',
            'Play count': 'PlayCount,SortName',
            'Data di Uscita': 'ProductionYear,PremiereDate,SortName',
            'Release date': 'ProductionYear,PremiereDate,SortName',
            'Durata': 'Runtime,SortName',
            'Runtime': 'Runtime,SortName',
            'Numero indice': 'IndexNumber,SortName',
            'Index number': 'IndexNumber,SortName',
            'Cartelle': 'IsFolder,SortName',
            'Folders': 'IsFolder,SortName'
        };
        var key = Object.keys(fields).find(function matchTranslatedLabel(value) {
            return value.toLocaleLowerCase() === label.toLocaleLowerCase();
        });
        return key ? fields[key] : null;
    }

    function detectSortOrder(row) {
        var down = row.querySelector('svg[data-testid*="ArrowDown"],.arrow_downward');
        var up = row.querySelector('svg[data-testid*="ArrowUp"],.arrow_upward');
        if (down) {
            return 'Descending';
        }
        if (up) {
            return 'Ascending';
        }
        return null;
    }

    function getCurrentSortSettings() {
        var hashQuery = window.location.hash.includes('?')
            ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
            : '';
        var parameters = new URLSearchParams(window.location.search + '&' + hashQuery);
        var routeSortBy = parameters.get('sortBy') || parameters.get('SortBy');
        var routeSortOrder = parameters.get('sortOrder') || parameters.get('SortOrder');
        var native = state.sortPreferences[getCurrentLibraryId()];
        return {
            by: native && native.by || routeSortBy || 'SortName',
            order: native && native.order || routeSortOrder || 'Ascending'
        };
    }

    function maybeAutoOpenRememberedLibrary() {
        var libraryId = getCurrentLibraryId();
        var route = window.location.href;
        if (state.api && libraryId && getRememberedLibraries()[libraryId]
            && state.lastAutoOpenRoute !== route
            && (!state.overlay || state.overlay.hidden)) {
            state.lastAutoOpenRoute = route;
            window.setTimeout(openCoverFlow, 0);
        }
    }

    function scheduleMenuIntegration() {
        [0, 50, 150, 300].forEach(function scheduleAttempt(delay) {
            window.setTimeout(integrateLayoutMenu, delay);
        });
    }

    function integrateLayoutMenu() {
        var modernMenu = Array.from(document.querySelectorAll('#selectview-popover'))
            .find(function isVisible(menu) { return menu.getClientRects().length > 0; });
        var textMatchedItems = findViewMenuItemsByText();
        if (!modernMenu && textMatchedItems.length < 2 && Date.now() > state.layoutMenuRequestedUntil) {
            return false;
        }

        // The current React popover has two direct view rows, separated by
        // an optional settings collapse. Do not depend on translated labels.
        var viewList = modernMenu && modernMenu.querySelector('.MuiList-root');
        var menuItems = viewList
            ? Array.from(viewList.children).filter(function isNativeView(item) {
                return item.id !== MENU_ITEM_ID && item.matches('.MuiMenuItem-root,.MuiListItemButton-root')
                    && item.getClientRects().length > 0;
            })
            : textMatchedItems;
        if (menuItems.length === 0) {
            return false;
        }

        menuItems.forEach(function markNativeView(row) {
            var label = row.querySelector('.MuiListItemText-primary,.actionSheetItemText,.listItemBodyText');
            if (modernMenu || label && /^(Vista Griglia|Vista a Elenco|Grid View|List View)$/i.test(String(label.textContent).trim())) {
                row.dataset.ecfNativeView = 'true';
            }
        });
        if (modernMenu && state.menuRoot !== modernMenu) { watchLayoutMenu(modernMenu); }
        if (document.getElementById(MENU_ITEM_ID)) {
            syncLayoutMenuSelection();
            return true;
        }

        var template = menuItems[menuItems.length - 1];
        var item = template.cloneNode(true);
        item.id = MENU_ITEM_ID;
        item.removeAttribute('data-id');
        item.removeAttribute('data-action');
        item.removeAttribute('data-value');
        item.removeAttribute('value');
        item.removeAttribute('data-ecf-native-view');
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', 'Vista CoverFlow');
        item.setAttribute('aria-checked', 'false');

        var label = item.querySelector(
            '.MuiListItemText-primary,.actionSheetItemText,.listItemBodyText,.button-text'
        );
        if (!label) {
            label = Array.from(item.querySelectorAll('*')).find(function findLabel(node) {
                return node.children.length === 0
                    && !node.classList.contains('material-icons')
                    && String(node.textContent || '').trim().length > 0;
            });
        }
        if (label) {
            label.textContent = 'CoverFlow';
        }

        var modernIconSlot = item.querySelector('.MuiListItemIcon-root');
        var oldIcon = item.querySelector('.actionSheetMenuItemIcon,.listItemIcon,.material-icons');
        if (modernIconSlot) {
            modernIconSlot.replaceChildren(createMenuCheck());
            var trailing = createMenuIcon();
            trailing.classList.add('ecf-menu-trailing');
            item.appendChild(trailing);
        } else if (oldIcon) {
            var icon = createMenuIcon();
            icon.setAttribute('class', oldIcon.getAttribute('class') + ' ecf-menu-icon');
            oldIcon.replaceWith(icon);
        } else {
            item.prepend(createMenuIcon());
        }

        function openFromLayoutMenu(event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            setLibraryRemembered(getCurrentLibraryId(), true);
            dismissLayoutMenu();
            window.setTimeout(openCoverFlow, 50);
        }
        item.addEventListener('click', openFromLayoutMenu);
        item.addEventListener('keydown', function activateMenuFromKeyboard(event) {
            if (event.key === 'Enter' || event.key === ' ') { openFromLayoutMenu(event); }
        });
        template.insertAdjacentElement('afterend', item);
        syncLayoutMenuSelection();
        return true;
    }

    function createMenuCheck() {
        var namespace = 'http://www.w3.org/2000/svg';
        var check = document.createElementNS(namespace, 'svg');
        check.setAttribute('class', 'ecf-menu-mark');
        check.setAttribute('viewBox', '0 0 24 24');
        check.setAttribute('aria-hidden', 'true');
        var path = document.createElementNS(namespace, 'path');
        path.setAttribute('d', 'm5 12 4 4L19 6');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        check.appendChild(path);
        return check;
    }

    function syncLayoutMenuSelection() {
        var item = document.getElementById(MENU_ITEM_ID);
        var active = Boolean(state.overlay && !state.overlay.hidden);
        if (state.menuRoot) { state.menuRoot.setAttribute('data-ecf-coverflow-active', String(active)); }
        if (!item) { return; }
        item.setAttribute('aria-pressed', String(active));
        item.setAttribute('aria-checked', String(active));
        var check = item.querySelector('.ecf-menu-mark');
        if (check) { check.style.visibility = active ? 'visible' : 'hidden'; }
    }

    function findViewMenuItemsByText() {
        var viewLabels = [
            'Vista Griglia',
            'Vista a Elenco',
            'Grid View',
            'List View'
        ];
        var rows = [];

        Array.from(document.querySelectorAll(
            '.MuiListItemText-primary,.actionSheetItemText,.listItemBodyText'
        )).forEach(function collectViewRow(label) {
            if (!viewLabels.includes(String(label.textContent || '').trim())) {
                return;
            }
            var row = label.closest(
                '.MuiMenuItem-root,.MuiListItemButton-root,.actionSheetMenuItem,[role="menuitem"],[role="button"],button'
            );
            if (row && row.getClientRects().length > 0 && !rows.includes(row)) {
                rows.push(row);
            }
        });

        return rows;
    }

    function dismissLayoutMenu() {
        var modernBackdrop = Array.from(document.querySelectorAll(
            '#selectview-popover .MuiBackdrop-root,#selectview-popover + .MuiBackdrop-root'
        )).find(function isVisible(backdrop) { return backdrop.getClientRects().length > 0; });
        if (modernBackdrop) {
            modernBackdrop.click();
            return;
        }

        var backdrops = Array.from(document.querySelectorAll('.dialogBackdrop'))
            .filter(function isVisible(backdrop) { return backdrop.getClientRects().length > 0; });
        if (backdrops.length > 0) {
            backdrops[backdrops.length - 1].click();
            return;
        }
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
        }));
    }

    function createMenuIcon() {
        var namespace = 'http://www.w3.org/2000/svg';
        var icon = document.createElementNS(namespace, 'svg');
        icon.classList.add('ecf-menu-icon');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        var leftCover = document.createElementNS(namespace, 'path');
        leftCover.setAttribute('d', 'M3 7.5 8 5v14l-5-2.5z');
        var centerCover = document.createElementNS(namespace, 'rect');
        centerCover.setAttribute('x', '9');
        centerCover.setAttribute('y', '3');
        centerCover.setAttribute('width', '6');
        centerCover.setAttribute('height', '18');
        centerCover.setAttribute('rx', '0.8');
        var rightCover = document.createElementNS(namespace, 'path');
        rightCover.setAttribute('d', 'm16 5 5 2.5v9L16 19z');
        icon.append(leftCover, centerCover, rightCover);
        return icon;
    }

    function createKeyboardIcon() {
        var namespace = 'http://www.w3.org/2000/svg';
        var icon = document.createElementNS(namespace, 'svg');
        icon.setAttribute('class', 'ecf-keyboard-icon');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        var outline = document.createElementNS(namespace, 'rect');
        outline.setAttribute('x', '2');
        outline.setAttribute('y', '5');
        outline.setAttribute('width', '20');
        outline.setAttribute('height', '14');
        outline.setAttribute('rx', '2');
        var keys = document.createElementNS(namespace, 'path');
        keys.setAttribute('d', 'M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M7 16h10');
        icon.append(outline, keys);
        return icon;
    }

    function setSearchVisible(visible) {
        if (!state.searchPanel) {
            return;
        }
        if (visible) {
            closeDetails();
        }
        stopArrowHold();
        window.clearTimeout(state.typeaheadTimer);
        state.typeaheadBuffer = '';
        state.searchInput.value = '';
        state.searchPanel.hidden = !visible;
        state.overlay.classList.toggle('is-searching', visible);
        state.keyboardButton.setAttribute('aria-expanded', String(visible));
        if (visible) {
            // Keep focus synchronous with the tap so iOS can open its keyboard.
            state.searchInput.focus();
        } else {
            state.searchInput.blur();
        }
        updateOverlayTop();
        renderPosition();
    }

    function buildOverlay() {
        if (state.overlay) {
            return;
        }

        var overlay = element('section');
        overlay.id = OVERLAY_ID;
        overlay.hidden = true;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'CoverFlow');

        var heading = element('div', 'ecf-heading');
        state.heading = heading;
        state.title = element('h2', null, 'CoverFlow');
        state.subtitle = element('p', null, 'Caricamento…');
        heading.append(state.title, state.subtitle);

        state.stage = element('div', 'ecf-stage');
        state.stage.addEventListener('pointerdown', onPointerDown);
        state.stage.addEventListener('pointermove', onPointerMove);
        state.stage.addEventListener('pointerup', onPointerUp);
        state.stage.addEventListener('pointercancel', onPointerCancel);

        var footer = element('footer', 'ecf-footer');
        var controls = element('div', 'ecf-controls');
        var previous = element('button', 'ecf-icon-button', '‹');
        previous.type = 'button';
        previous.setAttribute('aria-label', 'Elemento precedente; tieni premuto per scorrere velocemente');
        bindArrowHold(previous, -1);
        state.backButton = element('button', 'ecf-icon-button ecf-level-up', '↩');
        state.backButton.type = 'button';
        state.backButton.title = 'Torna al livello superiore';
        state.backButton.setAttribute('aria-label', 'Torna al livello superiore');
        state.backButton.hidden = true;
        state.backButton.addEventListener('click', showSeries);
        var next = element('button', 'ecf-icon-button', '›');
        next.type = 'button';
        next.setAttribute('aria-label', 'Elemento successivo; tieni premuto per scorrere velocemente');
        bindArrowHold(next, 1);
        state.keyboardButton = element('button', 'ecf-icon-button');
        state.keyboardButton.type = 'button';
        state.keyboardButton.title = 'Cerca per iniziali';
        state.keyboardButton.setAttribute('aria-label', 'Mostra tastiera per cercare per iniziali');
        state.keyboardButton.setAttribute('aria-expanded', 'false');
        state.keyboardButton.setAttribute('aria-controls', 'ecf-prefix-search');
        state.keyboardButton.appendChild(createKeyboardIcon());
        state.keyboardButton.addEventListener('click', function toggleKeyboard() {
            setSearchVisible(state.searchPanel.hidden);
        });
        controls.append(previous, state.backButton, next, state.keyboardButton);
        state.searchPanel = element('div', 'ecf-search');
        state.searchPanel.id = 'ecf-prefix-search';
        state.searchPanel.hidden = true;
        state.searchInput = element('input');
        state.searchInput.type = 'search';
        state.searchInput.inputMode = 'text';
        state.searchInput.enterKeyHint = 'search';
        state.searchInput.autocomplete = 'off';
        state.searchInput.setAttribute('autocapitalize', 'none');
        state.searchInput.spellcheck = false;
        state.searchInput.placeholder = 'Titolo: scrivi le iniziali…';
        state.searchInput.setAttribute('aria-label', 'Vai al titolo che inizia con');
        state.searchInput.addEventListener('input', function searchFromKeyboard() {
            window.clearTimeout(state.typeaheadTimer);
            state.typeaheadBuffer = state.searchInput.value;
            selectTypeahead(false);
            renderPosition();
        });
        state.searchPanel.appendChild(state.searchInput);
        state.searchResult = element('div', 'ecf-search-result');
        state.searchResult.setAttribute('aria-live', 'polite');
        state.searchPanel.appendChild(state.searchResult);
        state.status = element('div', 'ecf-status');
        state.status.setAttribute('aria-live', 'polite');
        footer.append(state.searchPanel, controls, state.status);

        overlay.append(state.stage, heading, footer);
        document.body.appendChild(overlay);
        state.overlay = overlay;
        window.addEventListener('resize', updateOverlayTop);
        window.addEventListener('blur', stopArrowHold);
        window.addEventListener('pagehide', stopArrowHold);
        document.addEventListener('visibilitychange', function stopHiddenHold() {
            if (document.hidden) {
                stopArrowHold();
            }
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateOverlayTop);
            window.visualViewport.addEventListener('scroll', updateOverlayTop);
        }
    }

    async function openCoverFlow() {
        var libraryId = getCurrentLibraryId();
        var sort = getCurrentSortSettings();
        var sortChanged = state.activeSortBy !== sort.by || state.activeSortOrder !== sort.order;
        if (libraryId && state.activeLibraryId !== libraryId) {
            selectLibrary(libraryId);
            sortChanged = false;
        }
        buildOverlay();
        updateOverlayTop();
        state.overlay.hidden = false;
        setLauncherActive(true);
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('wheel', onWheel, { passive: false, capture: true });

        if (sortChanged && state.books.length) {
            await reloadSortedLibrary(sort);
        } else if (state.books.length === 0) {
            await loadBooks();
        } else {
            renderBooks();
        }
    }

    function selectLibrary(libraryId) {
        stopArrowHold();
        closeDetails();
        state.detailCache.clear();
        state.folderStack = [];
        state.folderId = null;
        setSearchVisible(false);
        var sort = getCurrentSortSettings();
        state.loadGeneration += 1;
        state.activeLibraryId = libraryId;
        state.activeCollectionType = String(
            state.libraryViews[libraryId] && state.libraryViews[libraryId].CollectionType || ''
        ).toLowerCase();
        state.activeSortBy = sort.by;
        state.activeSortOrder = sort.order;
        state.books = [];
        state.series = [];
        state.entries = [];
        state.index = 0;
        state.mode = 'items';
        state.loadingLoaded = 0;
        state.loadingTotal = 0;
        state.loadingComplete = false;
        state.reordering = false;
        if (state.overlay) {
            renderBooks();
        }
    }

    function updateOverlayTop() {
        if (!state.overlay) {
            return;
        }
        var anchor = state.button || document.getElementById('effecta-coverflow-toolbar-button');
        var top = anchor ? Math.ceil(anchor.getBoundingClientRect().bottom) : 0;
        state.overlay.style.top = Math.max(0, top) + 'px';
        var viewport = window.visualViewport;
        state.overlay.style.bottom = state.searchPanel && !state.searchPanel.hidden && viewport
            ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) + 'px'
            : '0px';
        positionHeading();
    }

    function closeCoverFlow(restoreFocus) {
        if (!state.overlay) {
            return;
        }
        stopArrowHold();
        closeDetails();
        setSearchVisible(false);
        state.overlay.hidden = true;
        setLauncherActive(false);
        document.body.style.overflow = state.menuRoot && state.menuRoot.isConnected ? 'hidden' : '';
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('wheel', onWheel, true);
        if (state.button && restoreFocus !== false) {
            state.button.focus();
        }
    }

    function setLauncherActive(active) {
        var button = state.button || document.getElementById('effecta-coverflow-toolbar-button');
        if (button) {
            button.setAttribute('aria-pressed', String(Boolean(active)));
        }
        syncLayoutMenuSelection();
    }

    function positionHeading() {
        window.requestAnimationFrame(function alignHeadingToCover() {
            var card = state.cards[state.index];
            if (!state.heading || !state.overlay || state.overlay.hidden || !card) {
                return;
            }
            var cardBounds = card.getBoundingClientRect();
            var overlayBounds = state.overlay.getBoundingClientRect();
            var footer = state.overlay.querySelector('.ecf-footer');
            var footerBounds = footer ? footer.getBoundingClientRect() : null;
            var reflectionHeight = Math.min(cardBounds.height * 0.25, 150);
            var desiredTop = cardBounds.bottom - overlayBounds.top + reflectionHeight + 12;
            var maximumTop = footerBounds
                ? footerBounds.top - overlayBounds.top - state.heading.offsetHeight - 12
                : desiredTop;
            state.heading.style.top = Math.round(Math.min(desiredTop, maximumTop)) + 'px';
        });
    }

    /****************************************************************
     *  BLOCK 06 - BOOK LOADING
     ****************************************************************/
    async function loadBooks(preserveSelection) {
        var selected = preserveSelection && state.entries[state.index];
        var anchorId = selected && selected.Id;
        state.reordering = Boolean(anchorId);
        if (anchorId) {
            renderPosition();
        } else {
            setStatus('Caricamento della biblioteca…', false);
            state.subtitle.textContent = 'Caricamento…';
        }

        var generation = ++state.loadGeneration;
        try {
            var userId = state.api.getCurrentUserId();
            var parentId = state.folderId || state.activeLibraryId;
            if (!parentId) {
                throw new Error('No active Jellyfin library was detected.');
            }
            var firstResponse = await loadLibraryPage(
                userId,
                parentId,
                state.activeCollectionType,
                0,
                INITIAL_PAGE_SIZE
            );
            if (generation !== state.loadGeneration) {
                return;
            }
            // Keep the old cards until the selected ID is found in the new order.
            // The anchor may be beyond the usual window; do not silently replace it.
            var items = [];
            var seen = new Set();
            var page = firstResponse.Items || [];
            var scanned = page.length;
            var total = firstResponse.TotalRecordCount == null ? page.length : firstResponse.TotalRecordCount;
            while (true) {
                page.forEach(function stageItem(item) {
                    if (!seen.has(item.Id)) { seen.add(item.Id); items.push(item); }
                });
                var current = anchorId && state.entries[state.index];
                anchorId = current && current.Id || anchorId;
                if (!anchorId || seen.has(anchorId) || scanned >= total || page.length === 0) { break; }
                page = (await loadLibraryPage(userId, parentId, state.activeCollectionType, scanned, PAGE_SIZE)).Items || [];
                if (generation !== state.loadGeneration) { return; }
                scanned += page.length;
            }
            if (anchorId && !seen.has(anchorId)) {
                throw new Error('The selected item is absent from the reordered library.');
            }
            state.books = items;
            state.loadingLoaded = scanned;
            state.loadingTotal = Math.min(total, Math.max(MAX_ITEMS, scanned));
            state.loadingComplete = state.loadingLoaded >= state.loadingTotal;
            state.reordering = false;
            rebuildEntries();
            renderBooks();
            if (!state.loadingComplete) {
                loadRemainingItems(userId, parentId, state.activeCollectionType, generation);
            }
        } catch (error) {
            if (generation !== state.loadGeneration) {
                return;
            }
            console.error('CoverFlow: unable to load library items.', error);
            state.reordering = false;
            if (anchorId) {
                setStatus('Riordinamento non completato: mantenuta la selezione precedente. Riprova cambiando ordine.', true);
            } else {
                state.subtitle.textContent = 'Impossibile caricare la biblioteca';
                setStatus('Errore durante la lettura della biblioteca Jellyfin.', true);
            }
        }
    }

    async function loadRemainingItems(userId, parentId, collectionType, generation) {
        try {
            while (state.loadingLoaded < state.loadingTotal && state.loadingLoaded < MAX_ITEMS) {
                var response = await loadLibraryPage(
                    userId,
                    parentId,
                    collectionType,
                    state.loadingLoaded,
                    Math.min(PAGE_SIZE, MAX_ITEMS - state.loadingLoaded)
                );
                if (generation !== state.loadGeneration) {
                    return;
                }
                var page = response.Items || [];
                if (page.length === 0) {
                    break;
                }
                appendUniqueItems(page);
                state.loadingLoaded += page.length;
                rebuildEntries();
                selectTypeahead(false);
                renderBooks();
            }
        } catch (error) {
            if (generation === state.loadGeneration) {
                console.error('CoverFlow: background loading stopped.', error);
            }
        }
        if (generation === state.loadGeneration) {
            state.loadingComplete = true;
            renderPosition();
        }
    }

    function loadLibraryPage(userId, parentId, collectionType, startIndex, limit) {
        return state.api.getItems(userId, {
            ParentId: parentId,
            Recursive: collectionType !== 'books' && !state.folderId,
            IncludeItemTypes: collectionType === 'books' ? 'Folder,Book' : getItemTypesForLibrary(collectionType),
            Fields: 'PrimaryImageAspectRatio,People,ChildCount,ParentId,SortName',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary',
            SortBy: state.activeSortBy,
            SortOrder: state.activeSortOrder,
            StartIndex: startIndex,
            Limit: limit
        });
    }

    function appendUniqueItems(items) {
        var seen = Object.create(null);
        state.books.forEach(function rememberItem(item) { seen[item.Id] = true; });
        items.forEach(function appendItem(item) {
            if (!seen[item.Id]) {
                seen[item.Id] = true;
                state.books.push(item);
            }
        });
    }

    function rebuildEntries() {
        var previousIndex = state.index;
        var selected = state.entries[state.index];
        var selectedId = selected && selected.Id;
        var selectedSeriesKey = selected && selected.kind === 'series' ? selected.key : null;
        var openSeriesKey = state.currentSeries && state.currentSeries.key;

        if (state.activeCollectionType === 'books' && state.mode === 'series') {
            state.series = buildSeries(state.books);
            if (state.mode === 'volumes' && openSeriesKey) {
                state.currentSeries = state.series.find(function matchOpenSeries(series) {
                    return series.key === openSeriesKey;
                }) || null;
                state.entries = state.currentSeries ? state.currentSeries.books : state.series;
                state.mode = state.currentSeries ? 'volumes' : 'series';
            } else {
                state.entries = state.series;
                state.mode = 'series';
            }
        } else {
            state.series = [];
            state.entries = state.books;
            state.mode = 'items';
        }

        var preservedIndex = state.entries.findIndex(function preserveSelection(entry) {
            return selectedSeriesKey ? entry.key === selectedSeriesKey : entry.Id === selectedId;
        });
        state.index = preservedIndex >= 0 ? preservedIndex : Math.min(state.index, Math.max(0, state.entries.length - 1));
        if (state.flowPosition !== null) {
            state.flowPosition += state.index - previousIndex;
        }
    }

    function getLoadingSuffix() {
        if (state.reordering) { return ' · riordino…'; }
        if (state.loadingComplete || state.loadingTotal <= state.loadingLoaded) {
            return '';
        }
        return ' · caricamento ' + state.loadingLoaded + '/' + state.loadingTotal;
    }

    function normalizeLookupText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase();
    }

    function getEntryTitle(entry) {
        return entry && entry.kind === 'series' ? entry.name : entry && entry.Name;
    }

    function selectTypeahead(renderAfterSelection) {
        if (!state.typeaheadBuffer || state.entries.length === 0) {
            return false;
        }
        var prefix = normalizeLookupText(state.typeaheadBuffer);
        var matchingIndex = state.entries.findIndex(function matchesPrefix(entry) {
            return normalizeLookupText(getEntryTitle(entry)).startsWith(prefix);
        });
        if (matchingIndex < 0) {
            return false;
        }
        if (state.index !== matchingIndex) {
            closeDetails();
        }
        state.index = matchingIndex;
        if (renderAfterSelection) {
            renderPosition();
        }
        return true;
    }

    function handleTypeaheadKey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1
            || !/[\p{L}\p{N}]/u.test(event.key)) {
            return false;
        }
        event.preventDefault();
        state.typeaheadBuffer += event.key;
        window.clearTimeout(state.typeaheadTimer);
        state.typeaheadTimer = window.setTimeout(function clearTypeahead() {
            state.typeaheadBuffer = '';
            state.typeaheadTimer = null;
            renderPosition();
        }, 1200);
        selectTypeahead(true);
        return true;
    }

    function getItemTypesForLibrary(collectionType) {
        switch (collectionType) {
            case 'books':
                return 'Book';
            case 'tvshows':
                return 'Series';
            case 'movies':
                return 'Movie';
            case 'music':
                return 'MusicAlbum';
            case 'homevideos':
            case 'photos':
                return 'Video,Photo,PhotoAlbum';
            case 'boxsets':
                return 'BoxSet';
            default:
                return 'Movie,Series,Book,MusicAlbum,Video,PhotoAlbum';
        }
    }

    function buildSeries(books) {
        var groups = Object.create(null);
        books.forEach(function groupBook(book) {
            var seriesName = String(book.SeriesName || '').trim();
            var key = seriesName || '__standalone__';
            if (!groups[key]) {
                groups[key] = {
                    kind: 'series',
                    key: key,
                    name: seriesName || 'Libri senza serie',
                    books: []
                };
            }
            groups[key].books.push(book);
        });

        return Object.keys(groups).map(function prepareGroup(key) {
            var group = groups[key];
            group.books.sort(compareVolumes);
            group.coverBook = group.books[0];
            return group;
        });
    }

    function compareVolumes(left, right) {
        var leftIndex = Number(left.IndexNumber);
        var rightIndex = Number(right.IndexNumber);
        var leftHasIndex = left.IndexNumber !== null && left.IndexNumber !== undefined && Number.isFinite(leftIndex);
        var rightHasIndex = right.IndexNumber !== null && right.IndexNumber !== undefined && Number.isFinite(rightIndex);

        if (leftHasIndex && rightHasIndex && leftIndex !== rightIndex) {
            return leftIndex - rightIndex;
        }
        if (leftHasIndex !== rightHasIndex) {
            return leftHasIndex ? -1 : 1;
        }
        return String(left.SortName || left.Name || '').localeCompare(
            String(right.SortName || right.Name || ''),
            undefined,
            { numeric: true, sensitivity: 'base' }
        );
    }

    function showSeries() {
        if (state.folderStack.length) {
            closeDetails();
            stopArrowHold();
            var parent = state.folderStack.pop();
            state.loadGeneration += 1;
            state.folderId = parent.folderId;
            state.books = parent.books;
            state.entries = parent.books;
            state.index = parent.index;
            state.loadingLoaded = parent.loaded;
            state.loadingTotal = parent.total;
            state.loadingComplete = parent.complete;
            state.reordering = false;
            renderBooks();
            if (parent.sortBy !== state.activeSortBy || parent.sortOrder !== state.activeSortOrder) {
                loadBooks(true);
            } else if (!state.loadingComplete) {
                loadRemainingItems(state.api.getCurrentUserId(), state.folderId || state.activeLibraryId,
                    state.activeCollectionType, state.loadGeneration);
            }
            return;
        }
        if (state.mode === 'volumes') {
            state.index = state.seriesIndex;
        }
        state.mode = 'series';
        state.currentSeries = null;
        state.entries = state.series;
        if (state.backButton) {
            state.backButton.hidden = true;
        }
        renderBooks();
    }

    function openSeries() {
        var selectedSeries = state.entries[state.index];
        if (!selectedSeries || selectedSeries.kind !== 'series') {
            return;
        }
        state.seriesIndex = state.index;
        state.currentSeries = selectedSeries;
        state.entries = selectedSeries.books;
        state.mode = 'volumes';
        state.index = 0;
        state.backButton.hidden = false;
        renderBooks();
    }

    function renderBooks() {
        var previousCards = new Map(state.cards.map(function rememberCard(card) {
            return [card.dataset.entryKey, card];
        }));
        state.cards = [];

        if (state.entries.length === 0) {
            previousCards.forEach(function removeEmptyCard(card) { card.remove(); });
            state.visibleCards = [];
            state.activeStart = 0;
            state.activeEnd = -1;
            state.title.textContent = (state.libraryViews[state.activeLibraryId] || {}).Name || 'CoverFlow';
            state.subtitle.textContent = state.loadingComplete ? 'Nessun elemento trovato' : 'Caricamento…';
            state.backButton.hidden = state.folderStack.length === 0;
            setStatus(state.loadingComplete ? 'La biblioteca corrente non contiene elementi compatibili.'
                : 'Caricamento della biblioteca…', false);
            return;
        }

        state.entries.forEach(function createCard(entry, index) {
            var entryKey = entry.kind === 'series' ? 'series:' + entry.key : 'item:' + entry.Id;
            var retained = previousCards.get(entryKey);
            if (retained) {
                previousCards.delete(entryKey);
                retained.dataset.index = String(index);
                var badge = retained.querySelector('.ecf-kind-badge');
                if (badge && entry.kind === 'series') {
                    badge.textContent = 'SERIE · ' + entry.books.length;
                }
                state.cards.push(retained);
                return;
            }
            var card = element('div', 'ecf-card');
            var isGroup = entry.kind === 'series' || isLibraryFolder(entry);
            card.dataset.index = String(index);
            card.dataset.entryKey = entryKey;
            card.classList.add(isGroup ? 'is-group' : 'is-item');
            card.classList.toggle('is-album', entry.Type === 'MusicAlbum');
            card.setAttribute('aria-label', isGroup
                ? entry.name || entry.Name || 'Cartella'
                : entry.Name || 'Elemento');
            var flipper = element('div', 'ecf-flipper');
            var front = element('button', 'ecf-front');
            front.type = 'button';
            front.setAttribute('aria-label', 'Mostra contenuto: ' + (getEntryTitle(entry) || 'Elemento'));
            front.addEventListener('click', function selectCard() {
                if (Date.now() < state.suppressClickUntil) {
                    return;
                }
                var currentCardIndex = Number(card.dataset.index);
                if (state.index === currentCardIndex) {
                    activateCurrent();
                } else {
                    move(currentCardIndex > state.index ? 1 : -1);
                }
            });

            if (isGroup) {
                front.append(
                    element('span', 'ecf-stack-layer ecf-stack-far'),
                    element('span', 'ecf-stack-layer ecf-stack-near')
                );
            }
            var surface = element('span', 'ecf-cover-surface');
            surface.appendChild(element('span', 'ecf-card-placeholder', entry.Type === 'MusicAlbum' ? '♫' : '▤'));
            front.appendChild(surface);
            if (isGroup) {
                front.appendChild(element('span', 'ecf-kind-badge', entry.kind === 'series'
                    ? 'SERIE · ' + entry.books.length : 'CARTELLA'));
            } else if (entry.IndexNumber !== null && entry.IndexNumber !== undefined) {
                front.appendChild(element('span', 'ecf-item-index', '#' + entry.IndexNumber));
            }
            flipper.appendChild(front);
            card.appendChild(flipper);
            card.style.display = 'none';
            state.stage.appendChild(card);
            state.cards.push(card);
        });

        previousCards.forEach(function removeOldCard(card) { card.remove(); });

        renderPosition();
    }

    /****************************************************************
     *  BLOCK 07 - COVERFLOW LAYOUT
     ****************************************************************/
    function renderPosition() {
        var compactLayout = window.innerWidth <= 600;
        var visibleRadius = compactLayout ? 2 : VISIBLE_RADIUS;
        var position = state.flowPosition === null ? state.index : state.flowPosition;
        var activeStart = Math.max(0, Math.floor(position) - visibleRadius);
        var activeEnd = Math.min(state.cards.length - 1, Math.ceil(position) + visibleRadius);
        var visibleCards = state.cards.slice(activeStart, activeEnd + 1);
        state.visibleCards.forEach(function hideDepartingCard(card) {
            if (!visibleCards.includes(card)) {
                card.style.display = 'none';
                card.setAttribute('aria-hidden', 'true');
            }
        });
        state.visibleCards = visibleCards;

        for (var cardIndex = activeStart; cardIndex <= activeEnd; cardIndex += 1) {
            var card = state.cards[cardIndex];
            var distance = cardIndex - position;
            var absoluteDistance = Math.abs(distance);
            var direction = distance < 0 ? -1 : 1;
            var firstOffset = compactLayout ? 112 : 225;
            var additionalOffset = compactLayout ? 72 : 90;
            var offset = direction * (absoluteDistance <= 1
                ? firstOffset * absoluteDistance
                : firstOffset + Math.min(absoluteDistance - 1, 3) * additionalOffset);
            var rotation = direction * -56 * Math.min(absoluteDistance, 1);
            var centerScale = compactLayout ? 1.16 : 1.24;
            var scale = absoluteDistance <= 1
                ? centerScale + (0.785 - centerScale) * absoluteDistance
                : Math.max(0.66, 0.82 - absoluteDistance * 0.035);

            card.style.display = 'block';
            card.dataset.baseOffset = String(offset);
            card.dataset.rotation = String(rotation);
            card.dataset.scale = String(scale);
            setCardTransform(card, offset, rotation, scale);
            card.style.opacity = String(Math.max(0.18, 1 - absoluteDistance * 0.15)
                * Math.max(0, Math.min(1, visibleRadius + 1 - absoluteDistance)));
            var brightness = absoluteDistance < 1 ? 1 - absoluteDistance * 0.24
                : Math.max(0.42, 0.82 - absoluteDistance * 0.06);
            card.style.filter = 'brightness(' + brightness + ')';
            card.style.zIndex = String(Math.round(100 - absoluteDistance * 10));
            card.style.pointerEvents = 'auto';
            card.classList.toggle('is-current', distance === 0);
            card.setAttribute('aria-hidden', 'false');
            var front = card.querySelector && card.querySelector('.ecf-front');
            if (front) { front.tabIndex = distance === 0 ? 0 : -1; }

            if (!card.dataset.loaded) {
                loadCardImage(card, state.entries[cardIndex]);
            }
        }

        state.activeStart = activeStart;
        state.activeEnd = activeEnd;
        if (state.flowPosition === null) {
            positionHeading();
        } else if (state.lastInfoIndex === state.index) {
            return;
        }
        state.lastInfoIndex = state.index;

        var current = state.entries[state.index];
        if (!current) {
            return;
        }
        if (state.searchResult) {
            var currentTitle = getEntryTitle(current) || '';
            var prefixFound = !state.typeaheadBuffer || normalizeLookupText(currentTitle)
                .startsWith(normalizeLookupText(state.typeaheadBuffer));
            state.searchResult.textContent = prefixFound ? currentTitle : state.loadingComplete
                ? 'Nessun titolo con queste iniziali'
                : 'Ricerca nei titoli ancora in caricamento…';
        }
        if (state.mode === 'series') {
            state.title.textContent = current.name;
            state.subtitle.textContent = current.books.length + (current.books.length === 1 ? ' volume' : ' volumi');
            setStatus((state.index + 1) + ' di ' + state.entries.length + ' serie · tocca per entrare'
                + getLoadingSuffix() + (state.typeaheadBuffer ? ' · cerca “' + state.typeaheadBuffer + '”' : ''), false);
            state.backButton.hidden = true;
        } else if (state.mode === 'volumes') {
            state.title.textContent = current.Name || 'Senza titolo';
            state.subtitle.textContent = getBookSubtitle(current);
            setStatus((state.index + 1) + ' di ' + state.entries.length + ' volumi · usa frecce, rotella o swipe'
                + getLoadingSuffix() + (state.typeaheadBuffer ? ' · cerca “' + state.typeaheadBuffer + '”' : ''), false);
            state.backButton.hidden = false;
        } else {
            state.title.textContent = current.Name || 'Senza titolo';
            state.subtitle.textContent = getItemSubtitle(current);
            setStatus((state.index + 1) + ' di ' + state.entries.length + ' elementi · tocca per girare'
                + getLoadingSuffix() + (state.typeaheadBuffer ? ' · cerca “' + state.typeaheadBuffer + '”' : ''), false);
            state.backButton.hidden = state.folderStack.length === 0;
        }
    }

    function setCardTransform(card, offset, rotation, scale) {
        card.style.transform = 'translate3d(-50%,-50%,0) translate3d('
            + offset + 'px,0,0) rotateY(' + rotation + 'deg) scale(' + scale + ')';
    }

    function loadCardImage(card, entry) {
        card.dataset.loaded = 'true';
        if (isLibraryFolder(entry)) {
            loadFolderCover(card, entry);
            return;
        }
        var candidates = entry.kind === 'series'
            ? [getSeriesPosterUrl(entry.coverBook.Id)].concat(entry.books.map(function getBookCover(book) {
                return getPrimaryImageUrl(book.Id);
            }))
            : [getPrimaryImageUrl(entry.Id)];
        var surface = card.querySelector('.ecf-cover-surface');

        if (entry.kind === 'series') {
            Array.from(card.querySelectorAll('.ecf-stack-layer')).forEach(function loadStackLayer(layer, index) {
                var book = entry.books[index + 1];
                if (!book) {
                    return;
                }
                var stackImage = element('img');
                stackImage.alt = '';
                stackImage.decoding = 'async';
                stackImage.addEventListener('load', function showStackCover() {
                    layer.replaceChildren(stackImage);
                }, { once: true });
                stackImage.src = getPrimaryImageUrl(book.Id);
            });
        }

        function tryCandidate(candidateIndex) {
            if (candidateIndex >= candidates.length) {
                return;
            }

            var image = element('img');
            image.alt = '';
            image.decoding = 'async';
            image.addEventListener('load', function replacePlaceholder() {
                surface.replaceChildren(image);
            }, { once: true });
            image.addEventListener('error', function tryNextVolume() {
                tryCandidate(candidateIndex + 1);
            }, { once: true });
            image.src = candidates[candidateIndex];
        }

        tryCandidate(0);
    }

    function getPrimaryImageUrl(itemId) {
        var serverAddress = typeof state.api.serverAddress === 'function'
            ? state.api.serverAddress()
            : window.location.origin;
        return serverAddress.replace(/\/$/, '')
            + '/Items/' + encodeURIComponent(itemId)
            + '/Images/Primary?maxWidth=' + (window.innerWidth <= 600 ? 400 : 720) + '&quality=85';
    }

    async function loadFolderCover(card, entry) {
        var collectionType = state.activeCollectionType;
        var surface = card.querySelector('.ecf-cover-surface');
        var image = element('img');
        image.alt = '';
        image.decoding = 'async';
        image.addEventListener('load', function showFolderPoster() { surface.replaceChildren(image); }, { once: true });
        image.addEventListener('error', async function useFirstVolume() {
            try {
                // One request per visible folder, not one per catalog item. Respect real ancestry.
                var response = await state.api.getItems(state.api.getCurrentUserId(), {
                    ParentId: entry.Id, Recursive: true, IncludeItemTypes: getItemTypesForLibrary(collectionType),
                    SortBy: 'SortName', SortOrder: 'Ascending', Limit: 1, ImageTypeLimit: 1,
                    EnableImageTypes: 'Primary', EnableTotalRecordCount: false
                });
                var book = (response.Items || [])[0];
                if (!book || !card.isConnected) { return; }
                var fallback = element('img');
                fallback.alt = '';
                fallback.decoding = 'async';
                fallback.addEventListener('load', function showVolumeCover() { surface.replaceChildren(fallback); }, { once: true });
                fallback.src = getPrimaryImageUrl(book.Id);
            } catch (error) {
                // A missing poster must not interrupt library navigation.
            }
        }, { once: true });
        image.src = getSeriesPosterUrl(entry.Id);
    }

    function getSeriesPosterUrl(itemId) {
        var serverAddress = typeof state.api.serverAddress === 'function'
            ? state.api.serverAddress()
            : window.location.origin;
        var token = typeof state.api.accessToken === 'function'
            ? state.api.accessToken()
            : '';
        return serverAddress.replace(/\/$/, '')
            + '/CoverFlow/SeriesPoster/' + encodeURIComponent(itemId)
            + (token ? '?api_key=' + encodeURIComponent(token) : '');
    }

    function getBookSubtitle(book) {
        var authors = (book.People || [])
            .filter(function isAuthor(person) { return person.Type === 'Author'; })
            .map(function authorName(person) { return person.Name; })
            .filter(Boolean);
        if (authors.length > 0) {
            return authors.join(', ');
        }
        return book.SeriesName || 'Biblioteca Jellyfin';
    }

    function getItemSubtitle(item) {
        if (item.Type === 'MusicAlbum') {
            return [getAlbumArtist(item), item.ProductionYear].filter(Boolean).join(' · ');
        }
        if (isLibraryFolder(item)) {
            return 'Cartella · tocca per vedere il contenuto';
        }
        if (item.ProductionYear) {
            return String(item.ProductionYear);
        }
        return item.Type === 'Series' ? 'Serie TV' : 'Biblioteca Jellyfin';
    }

    /****************************************************************
     *  BLOCK 08 - ON-DEMAND CARD CONTENT
     *
     *  The inner flipper has its own transform, separate from carousel
     *  geometry. Only the open card owns a scrollable back; child lists
     *  are paged and a small library-scoped cache avoids repeat requests.
     ****************************************************************/
    function isLibraryFolder(item) {
        return Boolean(item && (item.Type === 'Folder' || item.Type === 'BoxSet'
            || item.Type === 'PhotoAlbum' || (item.IsFolder
                && !['MusicAlbum', 'Series', 'Season', 'MusicArtist'].includes(item.Type))));
    }

    function getAlbumArtist(item) {
        return (item.AlbumArtists || item.Artists || []).filter(Boolean).join(', ');
    }

    function formatDuration(ticks) {
        var seconds = Math.round(Number(ticks || 0) / 10000000);
        if (!seconds || !Number.isFinite(seconds)) {
            return '';
        }
        return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    }

    function overviewText(value) {
        // Metadata is untrusted HTML. Render text only, never live markup.
        var parsed = new DOMParser().parseFromString(String(value || '')
            .replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi, '\n'), 'text/html');
        parsed.querySelectorAll('script,style,iframe,object').forEach(function removeUnsafe(node) { node.remove(); });
        return (parsed.body.textContent || '').trim();
    }

    function detailKind(entry) {
        if (entry.kind === 'series') { return 'volumes'; }
        if (isLibraryFolder(entry)) { return 'folder'; }
        if (entry.Type === 'MusicAlbum') { return 'tracks'; }
        if (entry.Type === 'Series') { return 'episodes'; }
        return 'plot';
    }

    function detailKey(entry) {
        return entry.kind === 'series' ? 'series:' + entry.key + ':' + entry.books.length : 'item:' + entry.Id;
    }

    function rememberDetails(key, data) {
        state.detailCache.delete(key);
        state.detailCache.set(key, data);
        if (state.detailCache.size > 8) {
            state.detailCache.delete(state.detailCache.keys().next().value);
        }
    }

    function closeDetails(restoreFocus) {
        var card = state.detailCard;
        state.detailGeneration += 1;
        state.detailCard = null;
        state.detailKey = null;
        if (!card) { return; }
        if (state.heading) { state.heading.hidden = false; }
        card.classList.remove('is-flipped');
        state.stage.classList.remove('has-details');
        var front = card.querySelector('.ecf-front');
        if (front) { front.inert = false; }
        var back = card.querySelector('.ecf-back');
        if (back) {
            back.inert = true;
            window.setTimeout(function removeClosedBack() {
                if (state.detailCard !== card) { back.remove(); }
            }, 550);
        }
        if (restoreFocus && front) { front.focus({ preventScroll: true }); }
        positionHeading();
    }

    function openItemDetails(item) {
        if (!item || !item.Id) { return; }
        closeCoverFlow();
        window.location.hash = '#/details?id=' + encodeURIComponent(item.Id);
    }

    function browseFolder(entry) {
        closeDetails();
        stopArrowHold();
        state.folderStack.push({ folderId: state.folderId, books: state.books, index: state.index,
            loaded: state.loadingLoaded, total: state.loadingTotal, complete: state.loadingComplete,
            sortBy: state.activeSortBy, sortOrder: state.activeSortOrder });
        state.loadGeneration += 1;
        state.folderId = entry.Id;
        state.index = 0;
        state.books = [];
        state.entries = [];
        renderBooks();
        loadBooks();
    }

    async function fetchDetailPage(entry, startIndex) {
        var kind = detailKind(entry);
        var userId = state.api.getCurrentUserId();
        var options = {
            ParentId: entry.Id,
            Recursive: kind !== 'folder',
            Fields: 'ParentId,PrimaryImageAspectRatio',
            SortBy: kind === 'tracks' || kind === 'episodes' ? 'ParentIndexNumber,IndexNumber,SortName' : 'SortName',
            SortOrder: 'Ascending',
            StartIndex: startIndex,
            Limit: 100,
            EnableImages: false
        };
        if (kind === 'tracks') { options.IncludeItemTypes = 'Audio'; }
        if (kind === 'episodes') { options.IncludeItemTypes = 'Episode'; options.IsMissing = false; }
        if (kind === 'folder' && state.activeCollectionType === 'books') { options.IncludeItemTypes = 'Folder,Book'; }
        return state.api.getItems(userId, options);
    }

    function detailMetadata(data) {
        var item = data.item;
        var parts = [];
        if (data.kind === 'tracks') {
            parts = [getAlbumArtist(item), item.ProductionYear,
                data.total + (data.total === 1 ? ' traccia' : ' tracce')];
            var duration = item.RunTimeTicks || (data.items.length === data.total
                ? data.items.reduce(function sumTracks(sum, track) { return sum + Number(track.RunTimeTicks || 0); }, 0) : 0);
            if (duration) { parts.push(Math.round(duration / 600000000) + ' min'); }
        } else if (data.kind === 'episodes') {
            parts = [item.ProductionYear, data.total + ' episodi'];
        } else if (data.kind === 'folder' || data.kind === 'volumes') {
            parts = [data.total + ' elementi' + (data.complete === false ? ' · caricamento catalogo…' : '')];
        } else {
            parts = [item.Type === 'Book' ? getBookSubtitle(item) : '', item.ProductionYear];
        }
        return parts.filter(Boolean).join(' · ');
    }

    function addDetailAction(parent, label, action) {
        var button = element('button', 'ecf-detail-action', label);
        button.type = 'button';
        button.addEventListener('click', action);
        parent.appendChild(button);
        return button;
    }

    function paintDetails(back, data, entry, generation) {
        if (generation !== state.detailGeneration || !state.detailCard) { return; }
        var body = back.querySelector('.ecf-back-body');
        var savedScroll = body.scrollTop;
        body.replaceChildren();
        back.querySelector('.ecf-back-meta').textContent = detailMetadata(data);
        if (data.kind === 'plot') {
            body.appendChild(element('p', 'ecf-plot', overviewText(data.item.Overview)
                || 'Nessuna trama disponibile nei metadati Jellyfin.'));
        } else {
            var previousSection = null;
            data.items.forEach(function addContentRow(item) {
                var sectionNumber = item.ParentIndexNumber === undefined || item.ParentIndexNumber === null
                    ? 0 : item.ParentIndexNumber;
                if (data.kind === 'episodes' || data.kind === 'tracks') {
                    if (sectionNumber !== previousSection) {
                        body.appendChild(element('h4', 'ecf-detail-section', data.kind === 'episodes'
                            ? sectionNumber === 0 ? 'Speciali' : 'Stagione ' + sectionNumber
                            : 'Disco ' + (sectionNumber || 1)));
                        previousSection = sectionNumber;
                    }
                }
                var row = element('button', 'ecf-detail-row');
                row.type = 'button';
                row.appendChild(element('span', 'ecf-detail-number', isLibraryFolder(item) ? '▤'
                    : item.IndexNumber === undefined || item.IndexNumber === null ? '·' : String(item.IndexNumber)));
                row.appendChild(element('span', 'ecf-detail-name', item.Name || 'Senza titolo'));
                row.appendChild(element('span', 'ecf-detail-duration', isLibraryFolder(item) ? '›' : formatDuration(item.RunTimeTicks)));
                row.addEventListener('click', function openContentRow() {
                    if (isLibraryFolder(item)) { browseFolder(item); } else { openItemDetails(item); }
                });
                body.appendChild(row);
            });
            if (!data.items.length) {
                body.appendChild(element('p', 'ecf-detail-note', 'Nessun contenuto disponibile.'));
            }
            if (data.kind !== 'volumes' && data.items.length < data.total) {
                var more = addDetailAction(body, 'Carica altri (' + data.items.length + '/' + data.total + ')', async function moreContent() {
                    more.disabled = true;
                    more.textContent = 'Caricamento…';
                    try {
                        var page = await fetchDetailPage(entry, data.items.length);
                        if (generation !== state.detailGeneration) { return; }
                        var newItems = page.Items || [];
                        if (!newItems.length) { data.total = data.items.length; }
                        data.items = data.items.concat(newItems);
                        rememberDetails(detailKey(entry), data);
                        paintDetails(back, data, entry, generation);
                    } catch (error) {
                        if (generation === state.detailGeneration) {
                            more.disabled = false;
                            more.textContent = 'Caricamento non riuscito. Riprova';
                        }
                    }
                });
            }
        }
        body.scrollTop = savedScroll;
    }

    async function flipCurrent(entry, card) {
        if (state.detailCard === card) { closeDetails(true); return; }
        stopArrowHold();
        closeDetails();
        setSearchVisible(false);
        var generation = ++state.detailGeneration;
        state.detailCard = card;
        state.detailKey = detailKey(entry);
        var kind = detailKind(entry);
        var flipper = card.querySelector('.ecf-flipper');
        var oldBack = card.querySelector('.ecf-back');
        if (oldBack) { oldBack.remove(); }
        var back = element('section', 'ecf-back');
        // Size only the back plane, leaving cover geometry untouched throughout the flip.
        back.style.setProperty('--ecf-back-height', Math.max(180, Math.min(480, state.stage.clientHeight - 60)) + 'px');
        back.setAttribute('aria-label', 'Contenuto di ' + (getEntryTitle(entry) || 'Elemento'));
        var header = element('div', 'ecf-back-header');
        var labels = { tracks: 'Album · tracce', episodes: 'Serie TV · episodi', folder: 'Cartella · contenuto',
            volumes: 'Serie · volumi', plot: entry.Type === 'Book' ? 'Libro · trama' : 'Trama' };
        header.append(element('p', 'ecf-back-kicker', labels[kind]),
            element('h3', 'ecf-back-title', getEntryTitle(entry) || 'Senza titolo'),
            element('p', 'ecf-back-meta', 'Caricamento…'));
        var close = element('button', 'ecf-icon-button ecf-flip-close', '↶');
        close.type = 'button';
        close.setAttribute('aria-label', 'Torna alla copertina');
        close.addEventListener('click', function turnFront() { closeDetails(true); });
        header.appendChild(close);
        var body = element('div', 'ecf-back-body');
        body.setAttribute('tabindex', '0');
        body.setAttribute('aria-label', 'Contenuto scorrevole');
        body.appendChild(element('p', 'ecf-detail-note', 'Caricamento…'));
        var footer = element('div', 'ecf-back-footer');
        if (kind === 'folder') {
            addDetailAction(footer, 'Sfoglia in CoverFlow →', function browseCurrentFolder() { browseFolder(entry); });
        } else if (kind === 'volumes') {
            addDetailAction(footer, 'Sfoglia i volumi →', function browseSeriesVolumes() { closeDetails(); openSeries(); });
        } else {
            addDetailAction(footer, 'Apri in Jellyfin ↗', function openNativeDetails() { openItemDetails(entry); });
        }
        back.append(header, body, footer);
        flipper.appendChild(back);
        card.querySelector('.ecf-front').inert = true;
        state.stage.classList.add('has-details');
        // Commit the unrotated face before changing only the compositor transform.
        window.requestAnimationFrame(function startFlip() {
            if (generation === state.detailGeneration) {
                card.classList.add('is-flipped');
                // On small screens the enlarged back owns the reading area.
                if (state.heading) { state.heading.hidden = window.innerWidth <= 600; }
                close.focus({ preventScroll: true });
                positionHeading();
            }
        });
        try {
            var cached = state.detailCache.get(state.detailKey);
            var data = cached;
            if (!data) {
                if (kind === 'volumes') {
                    data = { kind: kind, item: entry, items: entry.books, total: entry.books.length, complete: state.loadingComplete };
                } else if (kind === 'plot') {
                    var item = await state.api.getItem(state.api.getCurrentUserId(), entry.Id);
                    data = { kind: kind, item: item, items: [], total: 0 };
                } else {
                    var response = await fetchDetailPage(entry, 0);
                    data = { kind: kind, item: entry, items: response.Items || [],
                        total: response.TotalRecordCount === undefined ? (response.Items || []).length : response.TotalRecordCount };
                }
            }
            if (generation !== state.detailGeneration) { return; }
            rememberDetails(state.detailKey, data);
            paintDetails(back, data, entry, generation);
        } catch (error) {
            if (generation !== state.detailGeneration) { return; }
            body.replaceChildren(element('p', 'ecf-detail-note', 'Impossibile caricare il contenuto.'));
            addDetailAction(body, 'Riprova', function retryDetails() { closeDetails(); flipCurrent(entry, card); });
        }
    }

    /****************************************************************
     *  BLOCK 08 - NAVIGATION INPUTS
     ****************************************************************/
    function move(delta) {
        if (state.entries.length === 0) {
            return;
        }
        closeDetails();
        state.index = Math.max(0, Math.min(state.entries.length - 1, state.index + delta));
        renderPosition();
    }

    function stopArrowHold() {
        if (state.arrowHoldStop) {
            state.arrowHoldStop();
        }
    }

    function bindArrowHold(button, direction) {
        var pointerId = null;
        var repeatTimer = null;
        var startedAt = 0;
        var frameId = null;
        var lastFrameTime = null;

        function stop() {
            window.clearTimeout(repeatTimer);
            window.cancelAnimationFrame(frameId);
            frameId = null;
            lastFrameTime = null;
            repeatTimer = null;
            pointerId = null;
            if (state.arrowHoldStop === stop) {
                state.arrowHoldStop = null;
                state.flowPosition = null;
                state.stage.classList.remove('is-fast-scrolling');
                renderPosition();
            }
        }

        function animateHold(timestamp) {
            if (pointerId === null || !state.overlay || state.overlay.hidden) {
                stop();
                return;
            }
            // Advance by elapsed frame time, with a cap after a stalled/background frame.
            var deltaSeconds = lastFrameTime === null ? 0 : Math.min(32, timestamp - lastFrameTime) / 1000;
            lastFrameTime = timestamp;
            var elapsed = Date.now() - startedAt;
            var speed = Math.min(12, 4 + Math.max(0, elapsed - 420) / 250);
            state.flowPosition = Math.max(0, Math.min(state.entries.length - 1,
                state.flowPosition + direction * speed * deltaSeconds));
            state.index = Math.max(0, Math.round(state.flowPosition));
            renderPosition();
            frameId = window.requestAnimationFrame(animateHold);
        }

        button.addEventListener('pointerdown', function startHold(event) {
            if (!event.isPrimary || event.button !== 0) {
                return;
            }
            event.preventDefault();
            stopArrowHold();
            pointerId = event.pointerId;
            startedAt = Date.now();
            state.arrowHoldStop = stop;
            button.setPointerCapture(pointerId);
            move(direction);
            repeatTimer = window.setTimeout(function startContinuousHold() {
                state.flowPosition = state.index;
                state.stage.classList.add('is-fast-scrolling');
                frameId = window.requestAnimationFrame(animateHold);
            }, 420);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function bindRelease(name) {
            button.addEventListener(name, function releaseHold(event) {
                if (event.pointerId === pointerId) {
                    stop();
                }
            });
        });
        button.addEventListener('contextmenu', function suppressCallout(event) { event.preventDefault(); });
        button.addEventListener('click', function accessibleArrowClick(event) {
            // Touch and mouse already moved at pointerdown; keyboard clicks have detail zero.
            if (event.detail === 0) {
                move(direction);
            }
        });
    }

    function onWheel(event) {
        if (!state.overlay || state.overlay.hidden) {
            return;
        }
        if (event.ctrlKey) { return; }
        if (event.target && event.target.closest && event.target.closest('#selectview-popover,#sort-popover')) {
            // Leave native settings scrolling alone without leaking a horizontal back gesture.
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        if (state.detailCard) {
            var back = event.target && event.target.closest && event.target.closest('.ecf-back');
            event.preventDefault();
            event.stopPropagation();
            if (back) {
                var body = back.querySelector('.ecf-back-body');
                var unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? body.clientHeight : 1;
                body.scrollTop += event.deltaY * unit;
            }
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (Math.abs(event.deltaX) < 4 && Math.abs(event.deltaY) < 4) {
            return;
        }
        if (Date.now() < state.wheelLockedUntil) {
            return;
        }
        state.wheelLockedUntil = Date.now() + 180;
        var dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
        move(dominantDelta > 0 ? 1 : -1);
    }

    function onPointerDown(event) {
        if (state.detailCard) { return; }
        if (!event.isPrimary || state.pointerId !== null) {
            return;
        }
        state.pointerId = event.pointerId;
        state.pointerStartX = event.clientX;
        state.pointerCurrentX = event.clientX;
        var startCard = event.target.closest && event.target.closest('.ecf-card');
        state.pointerStartCardIndex = startCard ? Number(startCard.dataset.index) : null;
        state.stage.setPointerCapture(event.pointerId);
        state.stage.classList.add('is-dragging');
    }

    function onPointerMove(event) {
        if (event.pointerId !== state.pointerId) {
            return;
        }
        state.pointerCurrentX = event.clientX;
        var delta = state.pointerCurrentX - state.pointerStartX;
        if (Math.abs(delta) > 4) {
            event.preventDefault();
        }
        var visualDelta = Math.max(-130, Math.min(130, delta * 0.8));
        for (var cardIndex = state.activeStart; cardIndex <= state.activeEnd; cardIndex += 1) {
            var card = state.cards[cardIndex];
            setCardTransform(
                card,
                Number(card.dataset.baseOffset) + visualDelta,
                Number(card.dataset.rotation),
                Number(card.dataset.scale)
            );
        }
    }

    function onPointerUp(event) {
        if (event.pointerId !== state.pointerId) {
            return;
        }
        var delta = event.clientX - state.pointerStartX;
        state.pointerId = null;
        state.stage.classList.remove('is-dragging');
        state.stage.getBoundingClientRect();
        if (Math.abs(delta) >= 35) {
            state.suppressClickUntil = Date.now() + 400;
            move(delta < 0 ? 1 : -1);
        } else if (Math.abs(delta) < 8 && state.pointerStartCardIndex === state.index) {
            state.suppressClickUntil = Date.now() + 400;
            renderPosition();
            activateCurrent();
        } else if (Math.abs(delta) < 8 && state.pointerStartCardIndex !== null) {
            state.suppressClickUntil = Date.now() + 400;
            move(state.pointerStartCardIndex > state.index ? 1 : -1);
        } else {
            renderPosition();
        }
        state.pointerStartCardIndex = null;
    }

    function onPointerCancel(event) {
        if (event.pointerId !== state.pointerId) {
            return;
        }
        state.pointerId = null;
        state.pointerStartCardIndex = null;
        state.stage.classList.remove('is-dragging');
        state.stage.getBoundingClientRect();
        renderPosition();
    }

    function onKeyDown(event) {
        var target = event.target;
        if (target && target.closest && target.closest('#selectview-popover,#sort-popover')) { return; }
        if (state.detailCard && event.key === 'Escape') {
            event.preventDefault();
            closeDetails(true);
            return;
        }
        if (target && target.closest && target.closest('.ecf-back')) { return; }
        if (target && target.closest && target.closest('.ecf-controls')
            && (event.key === 'Enter' || event.key === ' ')) {
            return;
        }
        if (target && ((target.matches && target.matches('input,textarea,select')) || target.isContentEditable)) {
            if (target === state.searchInput && event.key === 'Escape') {
                event.preventDefault();
                setSearchVisible(false);
            } else if (target === state.searchInput && event.key === 'Enter') {
                event.preventDefault();
                state.searchInput.blur();
            }
            return;
        }
        if (handleTypeaheadKey(event)) {
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            activateCurrent();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            if (state.mode === 'volumes' || state.folderStack.length) {
                showSeries();
            } else {
                closeCoverFlow();
            }
        }
    }

    function activateCurrent() {
        var current = state.entries[state.index];
        if (!current) {
            return;
        }
        var card = state.cards[state.index];
        if (card) { flipCurrent(current, card); }
    }

    /****************************************************************
     *  BLOCK 09 - STARTUP
     ****************************************************************/
    installStyles();
    ensureLauncher();
    waitForApi();
}());
