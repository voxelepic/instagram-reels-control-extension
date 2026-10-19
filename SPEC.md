# SPECIFICATION: Instagram Reels Control Extension

## Goal
To build a Manifest V3 browser extension that overlays standard and advanced video playback controls (playback speed, volume level, seekable timeline/progress bar, Picture-in-Picture, auto-scroll) on the Instagram Reels web interface.

---

## 1. Functional Requirements

### 1.1 Video Playback Overlay (HUD)
When browsing Reels on `instagram.com/reels/` or in a Reel post modal, the active Reel should show a premium glassmorphic overlay containing:
- **Timeline Seek Bar**: A clickable/draggable progress bar showing current time vs duration. Dragging/clicking updates the video's play position (`currentTime`).
- **Play/Pause Button**: Toggles playback state.
- **Volume Controller**:
  - A mute/unmute button.
  - A hover-activated slide volume bar. Adjusting the slider updates the video volume (`volume`).
- **Speed Selector**: A button/popover to select playback speeds: `0.5x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`. The selected speed applies to the active video and persists as the default speed for subsequent Reels.
- **Picture-in-Picture (PiP) Button**: Enters or exits HTML5 Picture-in-Picture mode for the active video.
- **Auto-Scroll Switch**: A toggle on the overlay to enable/disable auto-scrolling to the next Reel when the current one ends.

### 1.2 Auto-Scroll Feature
- When active video ends (`ended` event) and Auto-Scroll is enabled:
  - Wait for 1 second.
  - Scroll the page down to the next Reel.
- Auto-Scroll should pause if:
  - The Reels comments section is open (to avoid interrupting the user reading/typing comments).
  - The user is hovering their cursor over the video card.
  - The browser tab is inactive (not visible).

### 1.3 Keyboard Shortcuts (Hotkeys)
Users can control the active video using the following keyboard shortcuts:
- `Space`: Play/Pause.
- `ArrowLeft` / `ArrowRight`: Seek backward/forward by 5 seconds.
- `W` / `S` (or `Shift + ArrowUp` / `Shift + ArrowDown`): Increase / decrease volume by 5%.
- `Shift + S`: Toggle Auto-Scroll on/off.
- `Shift + P`: Toggle Picture-in-Picture.
- `>` / `<`: Increase / decrease playback speed.

### 1.4 Extension Popup UI
A settings dashboard visible when clicking the browser extension icon:
- **Toggles**: Enable Overlay HUD, Enable Hotkeys, Enable Auto-Scroll by default, Use Native Browser Controls.
- **Sliders**: Default Playback Speed, Default Volume.
- **Theme**: Premium modern dark mode with glassmorphism styling.

---

## 2. Technical Specification

### 2.1 Manifest V3 Configuration (`manifest.json`)
- **Permissions**: `storage`, `scripting`, plus an Instagram-only host permission. `scripting` is used only to refresh already-open Instagram tabs after an extension install/update/reload.
- **Content Scripts**: Matches `https://*.instagram.com/*`. Injects `content.js` and `content.css`.
- **Background Worker**: `background.js` (for installation handling and configuration sync).
- **Popup action**: Matches `popup.html`.

### 2.2 Active Reel Detection (`content.js`)
Since Instagram loads Reels dynamically and class names change:
1. **IntersectionObserver and bounded geometry scoring**:
   - Observes all current `<video>` elements and registers/unregisters dynamically mounted videos.
   - Detached and nearly hidden videos are rejected. Visible candidates are ranked by visible pixel area, viewport-center proximity, playing state, and a small hysteresis margin.
   - When a new video becomes active:
     - Rebind active-only video events.
     - Re-render the single fixed HUD root over the active video's bounds.
     - Set video volume, speed, and status based on saved settings in `chrome.storage.local`.
2. **Dynamic Overlay Container**:
   - Keep one fixed extension-owned root under `document.documentElement` and update it on resize/scroll events. This avoids depending on Instagram's generated containers or stacking contexts.

### 2.3 Storage Model
Using `chrome.storage.local` to store:
- `autoScroll`: Boolean (Default: `true`)
- `hudEnabled`: Boolean (Default: `true`)
- `hotkeysEnabled`: Boolean (Default: `true`)
- `defaultSpeed`: Float (Default: `1.0`)
- `defaultVolume`: Float (Default: `0.8`)
- `isMuted`: Boolean (Default: `false`)
- `useNativeControls`: Boolean (Default: `false`)

---

## 3. UI/UX Design System (CSS)
- **Glassmorphism**: Backdrop filter: `blur(8px) saturate(180%)`; background color: `rgba(18, 18, 18, 0.6)`.
- **Accents**: Modern gradient accents (e.g. Violet/Pink gradient `#8a2be2` to `#da70d6`).
- **Animations**: Soft hover scales (`transform: scale(1.05)`), transitions (`transition: all 0.2s ease`).
- **Typography**: `system-ui, -apple-system, sans-serif`.
