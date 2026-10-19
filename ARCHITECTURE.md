# Architecture: Instagram Reels Control

## Build and runtime components

- `src/app/`: Next.js client page used for the extension popup.
- `src/content/`: React HUD, active-video selection, playback commands, hotkeys, DOM lifecycle, and auto-scroll.
- `src/shared/`: validated settings model and guarded Chrome storage access shared by popup and content code.
- `public/background.js`: MV3 service worker that initializes missing defaults and reinjects the current content bundle into already-open Instagram tabs after install/update/reload.
- `build.mjs`: bundles the content script and its CSS into `public/`.
- `postbuild.mjs`: moves Next assets to extension-safe paths and externalizes Next's inline data scripts so the popup works under MV3's strict CSP.
- `out/`: generated unpacked extension loaded by the browser.

## Active video selection

1. One idempotent content-script controller tracks every current `<video>` with an `IntersectionObserver`.
2. A `MutationObserver` registers videos added by Instagram and forgets removed videos.
3. On every selection decision, the controller refreshes geometry for all tracked videos. This avoids stale observer ratios during fast scrolls or recycled DOM changes.
4. Detached or less-than-12%-visible videos are rejected. Remaining candidates are ranked by visible pixel area, viewport-center proximity, and a small playing-video preference.
5. A 10% hysteresis margin keeps the current video selected when candidates are effectively tied, preventing control flapping.
6. Every playback action captures the selected video and revalidates that it is still connected, visible, and active before changing it.

The selector intentionally avoids Instagram's generated class names. It treats the dominant visible Instagram video as the Reel candidate so Reel modals embedded in Home, Explore, and profile routes continue to work even when the pathname is not `/reels/`.

## HUD and playback flow

The content controller owns playback and settings mutations. The React HUD only renders state and calls guarded actions for play/pause, seek, volume, mute, playback rate, Picture in Picture, and auto-scroll.

The HUD is mounted once under `document.documentElement` and positioned over the active video. Position updates are event-driven (`scroll`, `resize`, and `ResizeObserver`) and coalesced through one animation frame; there is no continuous animation-frame loop or full-page polling.

## SPA and lifecycle handling

- DOM mutations and intersections cover Instagram push-state navigation and dynamically mounted/recycled videos.
- `popstate`, `hashchange`, `pageshow`, and visibility events trigger a bounded rescan or state refresh.
- Repeated content-script execution first cleans up the previous controller.
- Cleanup disconnects observers, removes every global/video listener, clears timers and animation frames, unmounts React, and removes the HUD.
- A lightweight five-second context check exists solely to detect an invalidated extension context after extension reload. The service worker reinjects the new bundle into open Instagram tabs using `scripting` permission limited by the Instagram host permission.

## Settings flow

`chrome.storage.local` is the source of truth. Values are type-checked and range-clamped when read. Popup writes, HUD writes, and hotkeys propagate to all Instagram tabs through one `chrome.storage.onChanged` subscription per context. Popup controls remain disabled until the initial asynchronous read completes, preventing default values from overwriting stored values during startup.

## Auto-scroll safety

The active video's `ended` event starts the specified one-second delay. Before scrolling, the controller rechecks active-video identity, connection, settings, tab visibility, pointer hover, and visible text editors/comment inputs. It scrolls the nearest aligned tracked video into view, with a scroll-container fallback when the next video has not mounted yet.
