export const DEFAULT_SETTINGS = {
  autoScroll: true,
  hudEnabled: true,
  hotkeysEnabled: true,
  useNativeControls: false,
  defaultSpeed: 1,
  defaultVolume: 0.8,
  isMuted: false,
} as const;

export type ExtensionSettings = {
  autoScroll: boolean;
  hudEnabled: boolean;
  hotkeysEnabled: boolean;
  useNativeControls: boolean;
  defaultSpeed: number;
  defaultVolume: number;
  isMuted: boolean;
};

export type SettingsPatch = Partial<ExtensionSettings>;

const BOOLEAN_KEYS = [
  "autoScroll",
  "hudEnabled",
  "hotkeysEnabled",
  "useNativeControls",
  "isMuted",
] as const;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeSettings(
  value: SettingsPatch | Record<string, unknown> | undefined,
): ExtensionSettings {
  const candidate = value ?? {};
  const normalized: ExtensionSettings = { ...DEFAULT_SETTINGS };

  for (const key of BOOLEAN_KEYS) {
    if (typeof candidate[key] === "boolean") {
      normalized[key] = candidate[key];
    }
  }

  if (typeof candidate.defaultSpeed === "number" && Number.isFinite(candidate.defaultSpeed)) {
    normalized.defaultSpeed = clamp(candidate.defaultSpeed, 0.5, 2);
  }

  if (typeof candidate.defaultVolume === "number" && Number.isFinite(candidate.defaultVolume)) {
    normalized.defaultVolume = clamp(candidate.defaultVolume, 0, 1);
  }

  return normalized;
}

export function normalizePatch(value: SettingsPatch): SettingsPatch {
  const full = normalizeSettings(value);
  const patch: SettingsPatch = {};

  for (const key of Object.keys(value) as Array<keyof ExtensionSettings>) {
    if (key in DEFAULT_SETTINGS) {
      Object.assign(patch, { [key]: full[key] });
    }
  }

  return patch;
}
