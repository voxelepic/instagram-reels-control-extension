import assert from "node:assert/strict";
import test from "node:test";
import { clampSeekTime, isEditableTarget, selectActiveCandidate } from "../src/content/logic";
import { normalizePatch, normalizeSettings } from "../src/shared/settings";

test("active selection prefers the largest visible video, not the latest observer entry", () => {
  const active = { id: "active" };
  const preload = { id: "preload" };
  const selected = selectActiveCandidate([
    {
      value: active,
      connected: true,
      intersectionRatio: 0.82,
      visibleArea: 410_000,
      centerDistance: 0.08,
      playing: true,
    },
    {
      value: preload,
      connected: true,
      intersectionRatio: 0.62,
      visibleArea: 285_000,
      centerDistance: 0.31,
      playing: false,
    },
  ], active);
  assert.equal(selected, active);
});

test("active selection switches when the next video is materially more visible", () => {
  const previous = { id: "previous" };
  const next = { id: "next" };
  const selected = selectActiveCandidate([
    {
      value: previous,
      connected: true,
      intersectionRatio: 0.24,
      visibleArea: 95_000,
      centerDistance: 0.42,
      playing: false,
    },
    {
      value: next,
      connected: true,
      intersectionRatio: 0.86,
      visibleArea: 430_000,
      centerDistance: 0.05,
      playing: true,
    },
  ], previous);
  assert.equal(selected, next);
});

test("detached and nearly hidden videos are never selected", () => {
  const selected = selectActiveCandidate([
    {
      value: "detached",
      connected: false,
      intersectionRatio: 1,
      visibleArea: 500_000,
      centerDistance: 0,
      playing: true,
    },
    {
      value: "hidden",
      connected: true,
      intersectionRatio: 0.05,
      visibleArea: 20_000,
      centerDistance: 0,
      playing: false,
    },
  ], null);
  assert.equal(selected, null);
});

test("seek values reject non-finite input and clamp to media bounds", () => {
  assert.equal(clampSeekTime(Number.NaN, 100), null);
  assert.equal(clampSeekTime(-5, 100), 0);
  assert.equal(clampSeekTime(120, 100), 100);
  assert.equal(clampSeekTime(35, Number.POSITIVE_INFINITY, 80), 35);
  assert.equal(clampSeekTime(90, Number.POSITIVE_INFINITY, 80), 80);
});

test("hotkey target detection protects form and editable elements", () => {
  assert.equal(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "DIV", closest: () => null } as unknown as EventTarget), false);
});

test("settings normalization rejects corrupt storage values and clamps ranges", () => {
  const settings = normalizeSettings({
    autoScroll: "yes",
    hudEnabled: false,
    defaultSpeed: 9,
    defaultVolume: -2,
  });
  assert.equal(settings.autoScroll, true);
  assert.equal(settings.hudEnabled, false);
  assert.equal(settings.defaultSpeed, 2);
  assert.equal(settings.defaultVolume, 0);
  assert.deepEqual(normalizePatch({ defaultSpeed: 3 }), { defaultSpeed: 2 });
});
