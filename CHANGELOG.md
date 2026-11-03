# Changelog

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
