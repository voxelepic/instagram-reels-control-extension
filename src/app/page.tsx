"use client";
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
} from "@/shared/settings";
import {
  readSettings,
  subscribeToSettings,
  writeSettings,
} from "@/shared/storage";

export default function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings>({ ...DEFAULT_SETTINGS });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void readSettings().then((savedSettings) => {
      if (mounted) {
        setSettings(savedSettings);
        setReady(true);
      }
    });
    const unsubscribe = subscribeToSettings((savedSettings) => {
      if (mounted) setSettings(savedSettings);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const setLocalSetting = <Key extends keyof ExtensionSettings>(
    key: Key,
    value: ExtensionSettings[Key],
  ) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  };

  const saveSetting = <Key extends keyof ExtensionSettings>(
    key: Key,
    value: ExtensionSettings[Key],
  ) => {
    setLocalSetting(key, value);
    setStorageError(null);
    void writeSettings({ [key]: value }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setStorageError(message);
      console.error("[Reels Control] Could not save popup setting:", error);
    });
  };

  return (
    <div className="w-[320px] min-h-[400px] p-4 bg-zinc-950 text-zinc-50 flex flex-col gap-4 font-sans">
      <header className="flex justify-between items-center border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5">
          {/* A plain img keeps the popup independent of Next's image runtime. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="icons/icon48.png" alt="Reels Control" className="w-8 h-8 drop-shadow-sm object-contain" />
          <h1 className="text-lg font-bold tracking-tight">Reels<span className="text-pink-500">Control</span></h1>
        </div>
      </header>
      
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col gap-3">
        <h2 className="text-[10px] font-bold text-pink-500 uppercase tracking-widest mb-1">Features</h2>
        
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold">Auto-Scroll</div>
            <div className="text-[10px] text-zinc-400">Play next automatically</div>
          </div>
          <Switch disabled={!ready} checked={settings.autoScroll} onCheckedChange={(value) => saveSetting("autoScroll", value)} />
        </div>

        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold">HUD Controls</div>
            <div className="text-[10px] text-zinc-400">Show video panel</div>
          </div>
          <Switch disabled={!ready} checked={settings.hudEnabled} onCheckedChange={(value) => saveSetting("hudEnabled", value)} />
        </div>

        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold">Hotkeys</div>
            <div className="text-[10px] text-zinc-400">Enable keyboard shortcuts</div>
          </div>
          <Switch disabled={!ready} checked={settings.hotkeysEnabled} onCheckedChange={(value) => saveSetting("hotkeysEnabled", value)} />
        </div>

        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold">Native Controls</div>
            <div className="text-[10px] text-zinc-400">Use default player</div>
          </div>
          <Switch disabled={!ready} checked={settings.useNativeControls} onCheckedChange={(value) => saveSetting("useNativeControls", value)} />
        </div>
      </section>

      <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col gap-5">
        <h2 className="text-[10px] font-bold text-pink-500 uppercase tracking-widest mb-1">Defaults</h2>
        
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-sm font-semibold">
            <span>Playback Speed</span>
            <span className="text-pink-500">{settings.defaultSpeed.toFixed(2)}x</span>
          </div>
          <Slider 
            value={[settings.defaultSpeed]} 
            min={0.5} max={2.0} step={0.25} 
            disabled={!ready}
            onValueChange={(value) => setLocalSetting("defaultSpeed", value[0] ?? settings.defaultSpeed)}
            onValueCommit={(value) => saveSetting("defaultSpeed", value[0] ?? settings.defaultSpeed)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-sm font-semibold">
            <span>Volume</span>
            <span className="text-pink-500">{Math.round(settings.defaultVolume * 100)}%</span>
          </div>
          <Slider 
            value={[settings.defaultVolume * 100]} 
            min={0} max={100} step={5} 
            disabled={!ready}
            onValueChange={(value) => setLocalSetting("defaultVolume", (value[0] ?? settings.defaultVolume * 100) / 100)}
            onValueCommit={(value) => saveSetting("defaultVolume", (value[0] ?? settings.defaultVolume * 100) / 100)}
          />
        </div>
      </section>
      {storageError && (
        <p className="text-[10px] text-red-400" role="status">
          Settings could not be saved. Reload the extension popup and try again.
        </p>
      )}
    </div>
  );
}
