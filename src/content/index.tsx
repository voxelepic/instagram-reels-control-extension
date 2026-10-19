import React from "react";
import { createRoot, type Root } from "react-dom/client";
import HUD, { type HudActions } from "./HUD";
import { clampSeekTime, isEditableTarget, selectActiveCandidate } from "./logic";
import {
  DEFAULT_SETTINGS,
  clamp,
  normalizeSettings,
  type ExtensionSettings,
  type SettingsPatch,
} from "../shared/settings";
import {
  extensionContextAvailable,
  readSettings,
  subscribeToSettings,
  writeSettings,
} from "../shared/storage";

declare global {
  interface Window {
    __instagramReelsControlCleanup__?: () => void;
  }
}

type VideoMetric = {
  intersectionRatio: number;
  visibleArea: number;
  centerDistance: number;
};

const HUD_ATTRIBUTE = "data-instagram-reels-control-root";
const trackedVideos = new Set<HTMLVideoElement>();
const metrics = new Map<HTMLVideoElement, VideoMetric>();
const originalControls = new WeakMap<HTMLVideoElement, boolean>();
const videoIds = new WeakMap<HTMLVideoElement, number>();

let nextVideoId = 1;
let activeVideo: HTMLVideoElement | null = null;
let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let hudContainer: HTMLDivElement | null = null;
let reactRoot: Root | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let activeResizeObserver: ResizeObserver | null = null;
let positionFrame: number | null = null;
let autoScrollTimer: number | null = null;
let contextTimer: number | null = null;
let stopped = false;
let hoveringVideo = false;
let hoveringHud = false;
let unsubscribeSettings: () => void = () => undefined;

function warn(message: string, error?: unknown) {
  if (error === undefined) console.warn(`[Reels Control] ${message}`);
  else console.warn(`[Reels Control] ${message}`, error);
}

function videoId(video: HTMLVideoElement) {
  let id = videoIds.get(video);
  if (!id) {
    id = nextVideoId++;
    videoIds.set(video, id);
  }
  return id;
}

function measureVideo(video: HTMLVideoElement): VideoMetric {
  const rect = video.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  const visibleWidth = Math.max(0, right - left);
  const visibleHeight = Math.max(0, bottom - top);
  const visibleArea = visibleWidth * visibleHeight;
  const totalArea = Math.max(1, rect.width * rect.height);
  const viewportDiagonal = Math.max(1, Math.hypot(window.innerWidth, window.innerHeight));
  const centerDistance = Math.hypot(
    rect.left + rect.width / 2 - window.innerWidth / 2,
    rect.top + rect.height / 2 - window.innerHeight / 2,
  ) / viewportDiagonal;

  return {
    intersectionRatio: visibleArea / totalArea,
    visibleArea,
    centerDistance,
  };
}

function updateMetric(entry: IntersectionObserverEntry) {
  const video = entry.target as HTMLVideoElement;
  const viewportDiagonal = Math.max(1, Math.hypot(window.innerWidth, window.innerHeight));
  const centerDistance = Math.hypot(
    entry.boundingClientRect.left + entry.boundingClientRect.width / 2 - window.innerWidth / 2,
    entry.boundingClientRect.top + entry.boundingClientRect.height / 2 - window.innerHeight / 2,
  ) / viewportDiagonal;
  metrics.set(video, {
    intersectionRatio: entry.intersectionRatio,
    visibleArea: entry.intersectionRect.width * entry.intersectionRect.height,
    centerDistance,
  });
}

function selectActiveVideo() {
  const candidates = Array.from(trackedVideos, (video) => {
    // Refresh every candidate for this decision. IntersectionObserver batches
    // can leave the previous active video's ratio stale during rapid DOM moves.
    const metric = measureVideo(video);
    metrics.set(video, metric);
    return {
      value: video,
      connected: video.isConnected,
      intersectionRatio: metric.intersectionRatio,
      visibleArea: metric.visibleArea,
      centerDistance: metric.centerDistance,
      playing: !video.paused && !video.ended,
    };
  });

  setActiveVideo(selectActiveCandidate(candidates, activeVideo));
}

function schedulePosition() {
  if (positionFrame !== null || stopped) return;
  positionFrame = window.requestAnimationFrame(() => {
    positionFrame = null;
    positionHud();
  });
}

function positionHud() {
  if (!activeVideo?.isConnected || !hudContainer) return;
  const rect = activeVideo.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    hudContainer.style.display = "none";
    return;
  }

  Object.assign(hudContainer.style, {
    display: "block",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function ensureHudRoot() {
  if (hudContainer?.isConnected && reactRoot) return;

  document.querySelectorAll<HTMLElement>(`[${HUD_ATTRIBUTE}]`).forEach((element) => element.remove());
  hudContainer = document.createElement("div");
  hudContainer.setAttribute(HUD_ATTRIBUTE, "");
  hudContainer.className = "react-hud-container";
  Object.assign(hudContainer.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    isolation: "isolate",
  });
  hudContainer.addEventListener("pointerenter", handleHudEnter);
  hudContainer.addEventListener("pointerleave", handleHudLeave);
  document.documentElement.appendChild(hudContainer);
  reactRoot = createRoot(hudContainer);
}

function applyVideoSettings(video: HTMLVideoElement) {
  if (!video.isConnected) return;
  try {
    video.playbackRate = settings.defaultSpeed;
    video.volume = settings.defaultVolume;
    video.muted = settings.isMuted;
    video.controls = settings.useNativeControls;
  } catch (error) {
    warn("Could not apply playback settings.", error);
  }
}

function usableActiveVideo(expected?: HTMLVideoElement) {
  if (!activeVideo?.isConnected) return null;
  if (expected && activeVideo !== expected) return null;
  const metric = metrics.get(activeVideo) ?? measureVideo(activeVideo);
  return metric.intersectionRatio >= 0.12 ? activeVideo : null;
}

function seekableEnd(video: HTMLVideoElement) {
  if (video.seekable.length === 0) return undefined;
  const end = video.seekable.end(video.seekable.length - 1);
  return Number.isFinite(end) ? end : undefined;
}

function seekVideo(video: HTMLVideoElement, seconds: number) {
  if (!usableActiveVideo(video)) return;
  const nextTime = clampSeekTime(seconds, video.duration, seekableEnd(video));
  if (nextTime === null) return;
  try {
    video.currentTime = nextTime;
  } catch (error) {
    warn("Could not seek the active Reel.", error);
  }
}

async function playVideo(video: HTMLVideoElement) {
  if (!usableActiveVideo(video)) return;
  try {
    await video.play();
  } catch (error) {
    warn("Playback was blocked or failed.", error);
  }
}

function togglePlayback(video: HTMLVideoElement) {
  if (!usableActiveVideo(video)) return;
  if (video.paused || video.ended) {
    if (video.ended) seekVideo(video, 0);
    void playVideo(video);
  } else {
    video.pause();
  }
}

function persistSettings(patch: SettingsPatch) {
  void writeSettings(patch).catch((error) => {
    warn("Could not save settings.", error);
    if (!extensionContextAvailable()) cleanup();
  });
}

function updateSettings(patch: SettingsPatch, persist = true) {
  settings = normalizeSettings({ ...settings, ...patch });
  if (activeVideo) applyVideoSettings(activeVideo);
  renderHud();
  if (activeVideo?.ended && settings.autoScroll) scheduleAutoScroll(activeVideo);
  if (!settings.autoScroll) clearAutoScrollTimer();
  if (persist) persistSettings(patch);
}

function setVolume(video: HTMLVideoElement, volume: number) {
  if (!usableActiveVideo(video)) return;
  const nextVolume = clamp(volume, 0, 1);
  updateSettings({ defaultVolume: nextVolume, isMuted: nextVolume === 0 ? true : false });
}

function setSpeed(video: HTMLVideoElement, speed: number) {
  if (!usableActiveVideo(video)) return;
  updateSettings({ defaultSpeed: clamp(speed, 0.5, 2) });
}

async function togglePictureInPicture(video: HTMLVideoElement) {
  if (!usableActiveVideo(video) || !document.pictureInPictureEnabled) return;
  try {
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture();
      return;
    }
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    await video.requestPictureInPicture();
  } catch (error) {
    warn("Picture in Picture could not be changed.", error);
  }
}

function hudActionsFor(video: HTMLVideoElement): HudActions {
  return {
    seekTo: (seconds) => seekVideo(video, seconds),
  };
}

function renderHud() {
  if (!activeVideo) {
    reactRoot?.render(null);
    if (hudContainer) hudContainer.style.display = "none";
    return;
  }

  ensureHudRoot();
  const video = activeVideo;
  reactRoot?.render(
    <HUD
      key={videoId(video)}
      video={video}
      settings={settings}
      actions={hudActionsFor(video)}
    />,
  );
  schedulePosition();
}

function clearAutoScrollTimer() {
  if (autoScrollTimer !== null) {
    window.clearTimeout(autoScrollTimer);
    autoScrollTimer = null;
  }
}

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function commentsOrEditorOpen(video: HTMLVideoElement) {
  if (isEditableTarget(document.activeElement)) return true;
  const scope = video.closest("[role='dialog'], article") ?? video.parentElement;
  if (!scope) return false;
  return Array.from(
    scope.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']"),
  ).some(isVisible);
}

function findScrollParent(element: HTMLElement) {
  let current: HTMLElement | null = element.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const scrollable = /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrollable && current.scrollHeight > current.clientHeight + 4) return current;
    current = current.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

function scrollToNextVideo(video: HTMLVideoElement) {
  const currentRect = video.getBoundingClientRect();
  const minimumTop = currentRect.top + Math.max(40, currentRect.height * 0.3);
  const candidates = Array.from(trackedVideos)
    .filter((candidate) => candidate !== video && candidate.isConnected)
    .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
    .filter(({ rect }) => {
      const horizontalOverlap = Math.max(
        0,
        Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left),
      );
      return rect.width > 0 && rect.height > 0 && rect.top >= minimumTop &&
        horizontalOverlap >= Math.min(currentRect.width, rect.width) * 0.3;
    })
    .sort((left, right) => left.rect.top - right.rect.top);

  if (candidates[0]) {
    candidates[0].candidate.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const scrollParent = findScrollParent(video);
  const distance = Math.max(currentRect.height * 0.9, scrollParent?.clientHeight ?? window.innerHeight);
  if (scrollParent) scrollParent.scrollBy({ top: distance, behavior: "smooth" });
  else window.scrollBy({ top: distance, behavior: "smooth" });
}

function scheduleAutoScroll(video: HTMLVideoElement) {
  clearAutoScrollTimer();
  if (!settings.autoScroll || document.hidden || hoveringVideo || hoveringHud) return;
  autoScrollTimer = window.setTimeout(() => {
    autoScrollTimer = null;
    if (
      activeVideo !== video ||
      !video.isConnected ||
      !settings.autoScroll ||
      document.hidden ||
      hoveringVideo ||
      hoveringHud ||
      commentsOrEditorOpen(video)
    ) return;
    scrollToNextVideo(video);
  }, 1000);
}

function handleEnded() {
  if (activeVideo) scheduleAutoScroll(activeVideo);
}

function handleVideoEnter() {
  hoveringVideo = true;
}

function handleVideoLeave() {
  hoveringVideo = false;
  if (activeVideo?.ended) scheduleAutoScroll(activeVideo);
}

function handleHudEnter() {
  hoveringHud = true;
}

function handleHudLeave() {
  hoveringHud = false;
  if (activeVideo?.ended) scheduleAutoScroll(activeVideo);
}

function unbindActiveVideo(video: HTMLVideoElement) {
  video.removeEventListener("ended", handleEnded);
  video.removeEventListener("pointerenter", handleVideoEnter);
  video.removeEventListener("pointerleave", handleVideoLeave);
  const controls = originalControls.get(video);
  if (controls !== undefined) video.controls = controls;
}

function setActiveVideo(video: HTMLVideoElement | null) {
  if (activeVideo === video) {
    if (video) schedulePosition();
    return;
  }

  clearAutoScrollTimer();
  if (activeVideo) unbindActiveVideo(activeVideo);
  activeResizeObserver?.disconnect();
  hoveringVideo = false;
  activeVideo = video;

  if (!video) {
    renderHud();
    return;
  }

  if (!originalControls.has(video)) originalControls.set(video, video.controls);
  video.addEventListener("ended", handleEnded);
  video.addEventListener("pointerenter", handleVideoEnter);
  video.addEventListener("pointerleave", handleVideoLeave);
  activeResizeObserver?.observe(video);
  applyVideoSettings(video);
  renderHud();
}

function videosInNode(node: Node) {
  if (!(node instanceof Element)) return [];
  const videos: HTMLVideoElement[] = [];
  if (node instanceof HTMLVideoElement) videos.push(node);
  videos.push(...node.querySelectorAll<HTMLVideoElement>("video"));
  return videos;
}

function observeVideo(video: HTMLVideoElement) {
  if (trackedVideos.has(video)) return;
  trackedVideos.add(video);
  metrics.set(video, measureVideo(video));
  intersectionObserver?.observe(video);
}

function forgetVideo(video: HTMLVideoElement) {
  if (!trackedVideos.delete(video)) return;
  intersectionObserver?.unobserve(video);
  metrics.delete(video);
  if (activeVideo === video) setActiveVideo(null);
}

function rescanConnectedVideos() {
  for (const video of trackedVideos) {
    if (!video.isConnected) forgetVideo(video);
    else metrics.set(video, measureVideo(video));
  }
  document.querySelectorAll<HTMLVideoElement>("video").forEach(observeVideo);
  selectActiveVideo();
}

function handleMutations(mutations: MutationRecord[]) {
  if (!extensionContextAvailable()) {
    cleanup();
    return;
  }

  let videosChanged = false;
  for (const mutation of mutations) {
    for (const node of mutation.removedNodes) {
      for (const video of videosInNode(node)) {
        forgetVideo(video);
        videosChanged = true;
      }
    }
    for (const node of mutation.addedNodes) {
      for (const video of videosInNode(node)) {
        observeVideo(video);
        videosChanged = true;
      }
    }
  }

  if (videosChanged) selectActiveVideo();
}

function handleKeyDown(event: KeyboardEvent) {
  if (
    !settings.hotkeysEnabled ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    isEditableTarget(event.target)
  ) return;

  const video = usableActiveVideo();
  if (!video) return;
  const key = event.key.toLowerCase();
  let handled = true;

  if (event.shiftKey && key === "s") {
    updateSettings({ autoScroll: !settings.autoScroll });
  } else if (event.shiftKey && key === "p") {
    void togglePictureInPicture(video);
  } else if (event.shiftKey && event.key === "ArrowUp") {
    setVolume(video, settings.defaultVolume + 0.05);
  } else if (event.shiftKey && event.key === "ArrowDown") {
    setVolume(video, settings.defaultVolume - 0.05);
  } else if (!event.shiftKey && key === "w") {
    setVolume(video, settings.defaultVolume + 0.05);
  } else if (!event.shiftKey && key === "s") {
    setVolume(video, settings.defaultVolume - 0.05);
  } else if (event.code === "Space") {
    togglePlayback(video);
  } else if (event.key === "ArrowLeft") {
    seekVideo(video, video.currentTime - 5);
  } else if (event.key === "ArrowRight") {
    seekVideo(video, video.currentTime + 5);
  } else if (event.key === ">") {
    setSpeed(video, settings.defaultSpeed + 0.25);
  } else if (event.key === "<") {
    setSpeed(video, settings.defaultSpeed - 0.25);
  } else {
    handled = false;
  }

  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function handlePlaying(event: Event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !trackedVideos.has(video)) return;
  metrics.set(video, measureVideo(video));
  selectActiveVideo();
}

function handleViewportChange() {
  if (activeVideo) metrics.set(activeVideo, measureVideo(activeVideo));
  schedulePosition();
}

function handleRouteOrVisibilityChange() {
  if (document.hidden) clearAutoScrollTimer();
  rescanConnectedVideos();
  schedulePosition();
  if (!document.hidden && activeVideo?.ended) scheduleAutoScroll(activeVideo);
}

function cleanup() {
  if (stopped) return;
  stopped = true;
  clearAutoScrollTimer();
  if (contextTimer !== null) window.clearInterval(contextTimer);
  if (positionFrame !== null) window.cancelAnimationFrame(positionFrame);
  if (activeVideo) unbindActiveVideo(activeVideo);
  intersectionObserver?.disconnect();
  mutationObserver?.disconnect();
  activeResizeObserver?.disconnect();
  unsubscribeSettings();
  document.removeEventListener("keydown", handleKeyDown, true);
  document.removeEventListener("play", handlePlaying, true);
  document.removeEventListener("visibilitychange", handleRouteOrVisibilityChange);
  window.removeEventListener("resize", handleViewportChange);
  window.removeEventListener("scroll", handleViewportChange, true);
  window.removeEventListener("popstate", handleRouteOrVisibilityChange);
  window.removeEventListener("hashchange", handleRouteOrVisibilityChange);
  window.removeEventListener("pageshow", handleRouteOrVisibilityChange);
  window.removeEventListener("pagehide", cleanup);
  hudContainer?.removeEventListener("pointerenter", handleHudEnter);
  hudContainer?.removeEventListener("pointerleave", handleHudLeave);
  reactRoot?.unmount();
  hudContainer?.remove();
  trackedVideos.clear();
  metrics.clear();
  activeVideo = null;
  reactRoot = null;
  hudContainer = null;
  if (window.__instagramReelsControlCleanup__ === cleanup) {
    delete window.__instagramReelsControlCleanup__;
  }
}

async function initialize() {
  window.__instagramReelsControlCleanup__?.();
  document.querySelectorAll<HTMLElement>(`[${HUD_ATTRIBUTE}]`).forEach((element) => element.remove());
  window.__instagramReelsControlCleanup__ = cleanup;

  settings = await readSettings();
  if (stopped || !extensionContextAvailable()) {
    cleanup();
    return;
  }

  intersectionObserver = new IntersectionObserver((entries) => {
    if (!extensionContextAvailable()) {
      cleanup();
      return;
    }
    entries.forEach(updateMetric);
    selectActiveVideo();
  }, { threshold: [0, 0.12, 0.25, 0.5, 0.75, 0.9, 1] });

  mutationObserver = new MutationObserver(handleMutations);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  activeResizeObserver = new ResizeObserver(schedulePosition);
  document.querySelectorAll<HTMLVideoElement>("video").forEach(observeVideo);

  unsubscribeSettings = subscribeToSettings((nextSettings) => {
    settings = nextSettings;
    if (activeVideo) applyVideoSettings(activeVideo);
    renderHud();
    if (activeVideo?.ended && settings.autoScroll) scheduleAutoScroll(activeVideo);
    if (!settings.autoScroll) clearAutoScrollTimer();
  });

  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("play", handlePlaying, true);
  document.addEventListener("visibilitychange", handleRouteOrVisibilityChange);
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("popstate", handleRouteOrVisibilityChange);
  window.addEventListener("hashchange", handleRouteOrVisibilityChange);
  window.addEventListener("pageshow", handleRouteOrVisibilityChange);
  window.addEventListener("pagehide", cleanup, { once: true });

  contextTimer = window.setInterval(() => {
    if (!extensionContextAvailable()) cleanup();
  }, 5000);

  selectActiveVideo();
}

void initialize().catch((error) => {
  warn("Initialization failed.", error);
  cleanup();
});
