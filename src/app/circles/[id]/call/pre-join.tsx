"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Captions, Mic, MicOff, Sparkles, Video, VideoOff, Volume2 } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { useAiAvailable } from "@/components/ai-provider";
import { Avatar } from "@/components/avatar";
import { Button, Notice } from "@/components/ui";
import { useCaptionsSupported } from "./use-captions";
import type { ActiveCall, CallCircle, CallKind, CallSettings } from "./types";

interface Props {
  circle: CallCircle;
  kind: CallKind;
  interpreterByDefault: boolean;
  joining: boolean;
  error: string | null;
  initial: CallSettings | null;
  onJoin: (settings: CallSettings) => void;
}

const POLL_MS = 5000;

/** Camera preview so people see exactly what others will see before they join. */
function useCameraPreview(on: boolean): { stream: MediaStream | null; failed: boolean } {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!on) return;
    let current: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 360 } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        current = s;
        setFailed(false);
        setStream(s);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      current?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [on]);
  return { stream, failed };
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, icon, label, hint, disabled }: ToggleProps) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl p-3 hover:bg-paper-2 ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-sage)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" className="mt-0.5 text-ink-2">{icon}</span>
      <span className="min-w-0">
        <span className="block font-bold">{label}</span>
        <span className="block text-xs text-ink-2">{hint}</span>
      </span>
    </label>
  );
}

interface SectionProps {
  settings: CallSettings;
  onChange: (patch: Partial<CallSettings>) => void;
}

function CameraPreview({ settings, onChange }: SectionProps) {
  const preview = useCameraPreview(settings.camera);
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-3xl bg-paper-2">
      {settings.camera && !preview.failed ? (
        <video
          ref={(el) => {
            if (el && el.srcObject !== preview.stream) el.srcObject = preview.stream;
          }}
          autoPlay
          muted
          playsInline
          aria-label="Your camera preview"
          className="h-full w-full scale-x-[-1] object-cover"
        />
      ) : (
        <div className="text-center text-sm text-ink-2">
          <VideoOff aria-hidden="true" className="mx-auto mb-2 h-8 w-8" />
          {preview.failed ? "Camera not available. Check your browser’s permission." : "Camera is off. Others will see your initials."}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
        <Button
          tone={settings.mic ? "quiet" : "danger"}
          aria-pressed={settings.mic}
          onClick={() => onChange({ mic: !settings.mic })}
          className="rounded-full bg-card"
        >
          {settings.mic ? <Mic aria-hidden="true" className="h-5 w-5" /> : <MicOff aria-hidden="true" className="h-5 w-5" />}
          {settings.mic ? "Mic on" : "Mic off"}
        </Button>
        <Button tone="quiet" aria-pressed={settings.camera} onClick={() => onChange({ camera: !settings.camera })} className="rounded-full bg-card">
          {settings.camera ? <Video aria-hidden="true" className="h-5 w-5" /> : <VideoOff aria-hidden="true" className="h-5 w-5" />}
          {settings.camera ? "Camera on" : "Camera off"}
        </Button>
      </div>
    </div>
  );
}

function HelpOptions({ settings, onChange, captionsSupported, aiAvailable }: SectionProps & { captionsSupported: boolean; aiAvailable: boolean }) {
  return (
    <fieldset className="space-y-1">
      <legend className="mb-2 font-extrabold">Help during the call</legend>
      <Toggle
        checked={settings.captions && captionsSupported}
        disabled={!captionsSupported}
        onChange={(v) => onChange({ captions: v })}
        icon={<Captions className="h-5 w-5" />}
        label="Share live captions of my voice"
        hint={captionsSupported ? "Your browser turns what you say into text for everyone in the call (Chrome uses Google’s speech service for this). InTune doesn’t save it." : "This browser can’t make captions. Try Chrome, Edge or Safari."}
      />
      <Toggle
        checked={settings.interpreter && aiAvailable}
        disabled={!aiAvailable}
        onChange={(v) => onChange({ interpreter: v })}
        icon={<Sparkles className="h-5 w-5" />}
        label="AI interpreter"
        hint={aiAvailable ? "Shows what others say in plain words, what they’re asking, and if they want a reply. Only you see it." : "Add an AI key in Settings to use the interpreter."}
      />
      <Toggle
        checked={settings.readAloud}
        onChange={(v) => onChange({ readAloud: v })}
        icon={<Volume2 className="h-5 w-5" />}
        label="Read typed messages aloud"
        hint="When someone uses “Say it for me”, your device reads it to you."
      />
      <Toggle
        checked={settings.selfView}
        onChange={(v) => onChange({ selfView: v })}
        icon={<Video className="h-5 w-5" />}
        label="Show my own video to me"
        hint="Off by default so you can focus on others. Others still see you when your camera is on."
      />
    </fieldset>
  );
}

export function PreJoin({ circle, kind, interpreterByDefault, joining, error, initial, onJoin }: Props) {
  const aiAvailable = useAiAvailable();
  const captionsSupported = useCaptionsSupported();
  const [s, setS] = useState<CallSettings>(
    () =>
      initial ?? {
        mic: true,
        camera: kind === "video",
        selfView: false,
        captions: true,
        interpreter: interpreterByDefault,
        readAloud: true,
      },
  );
  const set = (patch: Partial<CallSettings>) => setS((prev) => ({ ...prev, ...patch }));
  const { data } = useSWR<{ call: ActiveCall | null }>(`/api/v1/circles/${circle.id}/calls`, fetcher, { refreshInterval: POLL_MS });
  const inCall = data?.call?.participants ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 overflow-y-auto p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Link href={`/circles/${circle.id}`} aria-label="Back to the chat" className="grid h-11 w-11 place-items-center rounded-full hover:bg-paper-2">
          <ArrowLeft aria-hidden="true" className="h-6 w-6" />
        </Link>
        <Avatar name={circle.name} seed={circle.avatarSeed} group={circle.kind === "group"} size="sm" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{kind === "video" ? "Video call" : "Voice call"} · {circle.name}</h1>
          <p className="text-sm text-ink-2" role="status">
            {inCall.length === 0 ? "Nobody is in the call yet. You can start it." : `In the call now: ${inCall.map((p) => p.name).join(", ")}`}
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CameraPreview settings={s} onChange={set} />
        <HelpOptions settings={s} onChange={set} captionsSupported={captionsSupported} aiAvailable={aiAvailable} />
      </div>

      {error && <Notice tone="warn">{error}</Notice>}
      <Button tone="primary" className="h-14 text-base" disabled={joining} onClick={() => onJoin({ ...s, captions: s.captions && captionsSupported, interpreter: s.interpreter && aiAvailable })}>
        {joining ? "Joining…" : inCall.length > 0 ? "Join the call" : "Start the call"}
      </Button>
      <p className="text-center text-xs text-ink-2">You can leave at any time. Nothing from the call is recorded or saved.</p>
    </div>
  );
}
