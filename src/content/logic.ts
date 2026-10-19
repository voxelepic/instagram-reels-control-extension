export type VideoCandidate<T> = {
  value: T;
  connected: boolean;
  intersectionRatio: number;
  visibleArea: number;
  centerDistance: number;
  playing: boolean;
};

function candidateScore<T>(candidate: VideoCandidate<T>) {
  const centerWeight = 1 - Math.min(0.35, Math.max(0, candidate.centerDistance) * 0.35);
  const playingWeight = candidate.playing ? 1.04 : 1;
  return candidate.visibleArea * centerWeight * playingWeight;
}

export function selectActiveCandidate<T>(
  candidates: Array<VideoCandidate<T>>,
  current: T | null,
) {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.connected &&
      candidate.intersectionRatio >= 0.12 &&
      candidate.visibleArea > 0,
  );
  if (eligible.length === 0) return null;

  let best = eligible[0];
  for (const candidate of eligible.slice(1)) {
    if (candidateScore(candidate) > candidateScore(best)) best = candidate;
  }

  const currentCandidate = eligible.find((candidate) => candidate.value === current);
  if (
    currentCandidate &&
    candidateScore(currentCandidate) >= candidateScore(best) * 0.9
  ) {
    return currentCandidate.value;
  }

  return best.value;
}

export function isEditableTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object") return false;

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tagName = element.tagName?.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (element.isContentEditable) return true;
  return Boolean(element.closest?.('[contenteditable="true"], [role="textbox"]'));
}

export function clampSeekTime(value: number, duration: number, seekableEnd?: number) {
  if (!Number.isFinite(value)) return null;
  const upperBound = Number.isFinite(duration) && duration > 0
    ? duration
    : Number.isFinite(seekableEnd) && Number(seekableEnd) > 0
      ? Number(seekableEnd)
      : undefined;
  return Math.max(0, upperBound === undefined ? value : Math.min(upperBound, value));
}
