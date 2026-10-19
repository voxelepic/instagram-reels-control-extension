# TECH STACK: Instagram Reels Control Extension

## Runtime Environment
- **Platform**: Google Chrome, Microsoft Edge, Brave, and other Chromium-based browsers.
- **Extension Spec**: Chrome Extensions Manifest V3.

## Languages & Core Technologies
- **HTML5**: Standard markup for UI structures inside `popup.html` and the injected overlay HTML elements.
- **JavaScript (Vanilla ECMAScript 2022)**: Content script logic, event listeners, dynamic DOM injection, and state management. No jQuery, React, or build steps are used for the content script to keep footprint extremely lightweight and prevent overhead.
- **CSS3 (Vanilla)**:
  - **Layout**: Flexbox and Grid.
  - **Visual Effects**: Backdrop-filter (blur), radial gradients, transitions, and keyframe animations.
  - **Variables**: Custom CSS properties for consistent coloring (`--hud-bg`, `--hud-accent`, etc.).

## Libraries & External Dependencies
- **None**: Zero external dependencies to maintain speed, lightness, and safety.
- **Fonts**: System UI font stack (`system-ui, -apple-system, sans-serif`) to match browser defaults while looking premium.

## Browser APIs Used
- **chrome.storage.local**: Direct configuration storage and cross-context syncing.
- **chrome.runtime**: Message passing between popup and content scripts.
- **IntersectionObserver API**: High-performance detection of active viewport video elements.
- **HTMLVideoElement API**: Video control properties (`currentTime`, `duration`, `volume`, `playbackRate`, `paused`, `requestPictureInPicture`).
- **MutationObserver API**: Tracking additions of new videos to the DOM.
