import React, { useEffect, useRef, useState } from "react";
import type { ExtensionSettings } from "../shared/settings";

export type HudActions = {
  seekTo: (seconds: number) => void;
};

type HudProps = {
  video: HTMLVideoElement;
  settings: ExtensionSettings;
  actions: HudActions;
};

function finiteDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  if (video.seekable.length > 0) {
    const end = video.seekable.end(video.seekable.length - 1);
    if (Number.isFinite(end) && end > 0) return end;
  }
  return 0;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function HUD({ video, settings, actions }: HudProps) {
  const [currentTime, setCurrentTime] = useState(() => video.currentTime || 0);
  const [duration, setDuration] = useState(() => finiteDuration(video));
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(() => video.currentTime || 0);
  const seekTrackRef = useRef<HTMLDivElement>(null);
  const scrubCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const syncTime = () => {
      if (!isSeeking) {
        const nextTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        setCurrentTime(nextTime);
        setSeekValue(nextTime);
      }
    };
    const syncDuration = () => setDuration(finiteDuration(video));

    video.addEventListener("timeupdate", syncTime);
    video.addEventListener("durationchange", syncDuration);
    video.addEventListener("loadedmetadata", syncDuration);

    return () => {
      video.removeEventListener("timeupdate", syncTime);
      video.removeEventListener("durationchange", syncDuration);
      video.removeEventListener("loadedmetadata", syncDuration);
    };
  }, [isSeeking, video]);

  useEffect(() => () => scrubCleanupRef.current?.(), []);

  if (!settings.hudEnabled) return null;

  const seekLimit = duration > 0 ? duration : 1;
  const displayedTime = isSeeking ? seekValue : currentTime;
  const seekProgress = Math.min(100, Math.max(0, (displayedTime / seekLimit) * 100));
  const bottomOffset = settings.useNativeControls ? 54 : 10;

  const stopNativeEvent = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const scrubFromClientX = (clientX: number) => {
    const track = seekTrackRef.current;
    if (!track || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const nextValue = ratio * duration;
    setSeekValue(nextValue);
    setCurrentTime(nextValue);
    actions.seekTo(nextValue);
  };

  const startScrubbing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    stopNativeEvent(event.nativeEvent);
    setIsSeeking(true);
    scrubFromClientX(event.clientX);

    const handleMove = (moveEvent: PointerEvent) => {
      stopNativeEvent(moveEvent);
      scrubFromClientX(moveEvent.clientX);
    };
    const stopScrubbing = (upEvent: PointerEvent) => {
      stopNativeEvent(upEvent);
      setIsSeeking(false);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", stopScrubbing, true);
      window.removeEventListener("pointercancel", stopScrubbing, true);
      scrubCleanupRef.current = null;
    };

    scrubCleanupRef.current?.();
    scrubCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", stopScrubbing, true);
    window.addEventListener("pointercancel", stopScrubbing, true);
  };

  return (
    <div
      className="reels-control-panel"
      style={{ bottom: `${bottomOffset}px` }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="reels-seek-row">
        <span className="reels-time text-right">{formatTime(displayedTime)}</span>
        <div
          ref={seekTrackRef}
          className={`reels-seek-track ${duration <= 0 ? "is-disabled" : ""}`}
          role="slider"
          aria-label="Reel playback position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(displayedTime)}
          onPointerDown={startScrubbing}
        >
          <div className="reels-seek-fill" style={{ width: `${seekProgress}%` }} />
          <div className="reels-seek-thumb" style={{ left: `${seekProgress}%` }} />
        </div>
        <span className="reels-time">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
