# Changelog

## 0.4.9 — 2026-11-05

- Match each music section: albums, album artists, artists, playlists, songs,
  genres and collections. Keep Suggestions in Jellyfin's native section layout.
- Load artists through Jellyfin 12's Persons endpoint with the matching role;
  artist and genre cards reveal library-scoped albums and support browsing them.
- Show square music cards with useful labels and filtered album-art fallbacks.
  Preserve playlist order and repeated tracks using playlist occurrence IDs.
- Separate current-item anchors, native page queries and sort preferences by
  music section. Discard responses from sections that are no longer active.
- Prevent search-panel cleanup from saving old cards in a new section; bound
  stalled requests and stop pagination that returns the same page repeatedly.
- Add music-menu browser coverage and focused context/navigation checks.

## 0.4.8 — 2026-11-05

- Fix music album artist names displaying as `[object Object]` below the cover
  and on the track-list back. Read modern Jellyfin Name/Id pairs and legacy strings.
- Fall back to artist items and track-artist names when album artists are absent;
  ignore malformed optional values and trim/deduplicate display names.
- Explicitly request total catalog counts for loading and selection recovery.
- Add structured-artist and refreshed-response regression checks.

## 0.4.7 — 2026-11-03

- Follow Jellyfin's interface language and reuse its loaded globalize dictionaries
  for common labels, sections, counters, native menu matching and accessibility.
- Update labels after native language changes and asynchronous dictionary loading
  without replacing covers, changing selection or resetting detail focus/scroll.
- Keep Italian/English local fallbacks for CoverFlow-specific messages; use English
  for missing translations. Titles and metadata retain their original language.
- Discover the optional native translation module without fixed bundle IDs; use
  local fallbacks when the frontend bridge is unavailable or ambiguous.
- Replace browse/open detail actions with icons and translated accessible tooltips.
- Add locale-switch, fallback and native-dictionary regression checks, including
  an optional check using the installed Jellyfin 12.4 globalize factory.

## 0.4.6 — 2026-11-03

- Add an A-Z/# side index to CoverFlow, with normalized accents, SortName-based
  initials, active-letter feedback and pending jumps during background loading.
- Keep the current item ID across CoverFlow, Grid and List in the same
  library/folder, including items beyond the first native page.
- Track native focus, clicks and scrolling; restore the target page and focus
  without changing the sort or unrelated filters. A conflicting native alphabet
  constraint can be cleared so the selected item remains visible.
- Keep selection anchors separate by server, user, library and parent folder.
- Report excluded/missing targets instead of silently choosing another item.
  Automatic native navigation into a different folder is not implemented.
- Cancel stale page restoration on navigation, user selection or changed filters.
- Track native page-query snapshots independently of sort-event timestamps.
- Add native-page, view-switch, sorting, alphabet and mobile-geometry regression checks.

## 0.4.5 — 2026-11-03

- Preserve all repeated `sortBy` parameters emitted by the Jellyfin SDK. Keeping
  only the last field could replace Date Added, Album Artist and other criteria
  with the `SortName` tie-breaker, reverting CoverFlow to alphabetical order.
- Listen read-only to Jellyfin's committed native sort preferences so cached
  queries also update CoverFlow without requiring a new network response.
- Prefer committed settings over stale requests and capture fallback direction
  before the native click handler changes state.
- Keep the selected item and per-library view choices intact.
- Exercise real Jellyfin SVG arrows and the native useLocalStorage hook in the
  optional browser test, plus repeated-parameter and cache regression checks.

## 0.4.4 — 2026-11-03

- Remember CoverFlow, Grid and List independently for each library.
- Close CoverFlow when entering a native-view library; reopen it on returning to
  a remembered library, including a previously visited URL and browser reloads.
- Preserve Jellyfin's native per-library Grid/List settings without modifying
  its storage keys, private React state, sorting or filter preferences.
- Keep existing boolean CoverFlow preferences compatible with the new format
  and with rollback to the previous version.
- Cancel delayed auto-opens after navigation and clear cached contents when
  switching users; respect an explicit Escape until the next library visit.
- Add mixed-library navigation, reload and preference regression tests.

## 0.4.3 — 2026-11-02

- Fix the View menu integration for Jellyfin Web's current MUI MenuItem component.
- Follow the sort criterion and direction selected in Jellyfin's native menu.
- Preserve the selected item's ID when it moves to a later catalog page.
- Keep comic folders, subfolders and parent selections intact after reordering.
- Exercise the installed Jellyfin 12.4 React/MUI components in an optional browser test.

This is the first GitHub preview release. Earlier versions were developed and
tested privately; they are listed here as development history, not GitHub releases.

## 0.4.2 — 2026-11-02

- Introduce the View menu integration and remembered per-library view preference.
- The initial menu selector was incompatible with the actual MenuItem rows;
  version 0.4.3 corrects this integration.

## 0.4.1 — 2026-11-02

- Add dedicated plugin and catalog artwork.

## 0.4.0 — 2026-11-02

- Add square music album covers and flip-to-content card backs.
- Show album tracks, TV episodes grouped by season, and book/movie descriptions.
- Browse real comic/book folders and subfolders instead of inferred series groups.
- Request details on demand, with paginated lists and a bounded cache.

## 0.3.21 — 2026-10-16

- Use frame-synchronized, accelerating press-and-hold arrow navigation.
- Reuse existing cover nodes during background catalog loading.
