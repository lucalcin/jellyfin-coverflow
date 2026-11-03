# Contributing

Thanks for helping improve CoverFlow. This is an early preview; focused bug
reports and small, tested changes are especially useful.

## Report a problem

Search existing issues, then use the bug report form. Include the plugin,
Jellyfin Server and Web versions, device, browser, library type and rough item
count. Explain what you expected and what actually happened.

Remove passwords, access tokens, API keys, cookies, personal server addresses,
private file paths and unrelated library details from screenshots and logs.
Never publish an authenticated image or poster URL containing `api_key`.
Use [SECURITY.md](SECURITY.md) for security-sensitive reports.

## Work on the code

- Use .NET SDK 10 and Node.js 22 or newer.
- Keep changes focused and preserve existing library/folder behavior.
- Do not patch installed `jellyfin-web` files or add a second injection dependency
  without first discussing the compatibility implications.
- Keep new interface elements usable with keyboard, mouse and touch.
- Run `npm ci`, `npm test` and the build command from the README.
- For the browser fixture, run `npx playwright install chromium`, then
  `npm run test:browser`. `CHROMIUM_EXECUTABLE` can select an existing browser.
- The optional `JELLYFIN_WEB_ROOT` test uses an extracted copy of the installed
  public Web bundles. Do not commit those bundles: they belong to Jellyfin and
  are not test fixtures maintained by this repository.

Automated tests validate behavior, not perceived smoothness on actual devices.
State separately which browser/device interactions you personally tested.
No test or contribution requires access to the maintainer's Jellyfin server.

## Artwork

The editable source is `artwork/coverflow.svg`; the PNG is a generated export.
The optional export script uses `sharp`. Keep artwork distinct from screenshots
of the actual interface, and do not commit private media or credentials.

Contributions are made under the project's GPL-3.0-or-later license.
