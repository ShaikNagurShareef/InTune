"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import { DisconnectReason } from "livekit-client";
import { PhoneOff, RotateCcw } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "@/components/ui";
import { CallRoom } from "./call-room";
import { PreJoin } from "./pre-join";
import type { ActiveCall, CallCircle, CallKind, CallMe, CallSettings } from "./types";

interface Props {
  me: CallMe;
  circle: CallCircle;
  kind: CallKind;
  audioRate: number;
  interpreterByDefault: boolean;
}

interface Joined {
  callId: string;
  token: string;
  url: string;
  canEnd: boolean;
  /** Devices at join time; later changes are applied by CallRoom. */
  initial: { mic: boolean; camera: boolean };
}

type Phase = { name: "prejoin" } | { name: "in-call"; joined: Joined } | { name: "left"; reason: string };

/** Adaptive quality: only the video sizes people actually see are sent and received, which keeps calls smooth. */
const ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: { simulcast: true },
  audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

const DISCONNECT_MESSAGES: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.CLIENT_INITIATED]: "You left the call",
  [DisconnectReason.ROOM_DELETED]: "The call ended",
  [DisconnectReason.PARTICIPANT_REMOVED]: "You’re no longer in this call",
  [DisconnectReason.DUPLICATE_IDENTITY]: "You joined this call from another tab or device",
};
const LOST_CONNECTION = "The connection was lost. You can join again.";

export function CallClient({ me, circle, kind, audioRate, interpreterByDefault }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "prejoin" });
  const [settings, setSettings] = useState<CallSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const connectedOnce = useRef(false);
  /** Why this person is about to leave, so LiveKit's own disconnect event (which may arrive first) says the right thing. */
  const leavingBecause = useRef<string | null>(null);

  async function join(chosen: CallSettings) {
    setJoining(true);
    setError(null);
    try {
      const { call } = await api<{ call: ActiveCall }>(`/api/v1/circles/${circle.id}/calls`, { body: { kind } });
      const access = await api<{ token: string; url: string; canEnd: boolean }>(`/api/v1/calls/${call.id}/token`, { method: "POST" });
      connectedOnce.current = false;
      leavingBecause.current = null;
      setSettings(chosen);
      setNotice(null);
      setPhase({ name: "in-call", joined: { callId: call.id, ...access, initial: { mic: chosen.mic, camera: chosen.camera } } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t join the call. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  const leaveWith = (reason: string) => setPhase((p) => (p.name === "in-call" ? { name: "left", reason } : p));

  if (phase.name === "prejoin" || !settings) {
    return (
      <PreJoin
        circle={circle}
        kind={kind}
        interpreterByDefault={interpreterByDefault}
        joining={joining}
        error={error}
        initial={settings}
        onJoin={(s) => void join(s)}
      />
    );
  }

  if (phase.name === "left") return <LeftScreen circleId={circle.id} reason={phase.reason} onRejoin={() => setPhase({ name: "prejoin" })} />;

  const { joined } = phase;
  return (
    <LiveKitRoom
      serverUrl={joined.url}
      token={joined.token}
      connect
      audio={joined.initial.mic}
      video={joined.initial.camera}
      options={ROOM_OPTIONS}
      onConnected={() => {
        connectedOnce.current = true;
      }}
      onDisconnected={(reason) =>
        leaveWith(leavingBecause.current ?? ((reason !== undefined && DISCONNECT_MESSAGES[reason]) || LOST_CONNECTION))
      }
      onError={() => {
        // Before connecting, an error means we couldn't get in; afterwards it's usually a device problem.
        if (!connectedOnce.current) leaveWith("Couldn’t connect to the call. Check your connection and try again.");
        else setNotice("Something went wrong with your microphone or camera. The call is still going.");
      }}
      onMediaDeviceFailure={(_failure, device) => {
        const isCamera = device === "videoinput";
        setSettings((s) => (s ? { ...s, ...(isCamera ? { camera: false } : { mic: false }) } : s));
        setNotice(`Couldn’t use your ${isCamera ? "camera" : "microphone"}. Check the browser’s permission. You can still follow with captions and type.`);
      }}
      className="flex min-h-0 w-full flex-1 flex-col"
      data-lk-theme="none"
    >
      <CallRoom
        me={me}
        circle={circle}
        callId={joined.callId}
        canEnd={joined.canEnd}
        audioRate={audioRate}
        settings={settings}
        notice={notice}
        onNotice={setNotice}
        onSettings={setSettings}
        onLeaving={(reason) => {
          leavingBecause.current = reason;
        }}
        onEnded={leaveWith}
      />
    </LiveKitRoom>
  );
}

function LeftScreen({ circleId, reason, onRejoin }: { circleId: string; reason: string; onRejoin: () => void }) {
  return (
    <div className="m-auto w-full max-w-md space-y-4 p-6 text-center">
      <PhoneOff aria-hidden="true" className="mx-auto h-10 w-10 text-ink-2" />
      <h1 className="text-xl font-extrabold">{reason}</h1>
      <p className="text-sm text-ink-2">Captions and interpreter notes from the call were not saved.</p>
      <div className="flex justify-center gap-3">
        <Button tone="quiet" onClick={onRejoin}>
          <RotateCcw aria-hidden="true" className="h-4 w-4" /> Join again
        </Button>
        <Link href={`/circles/${circleId}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-on-brand">
          Back to the chat
        </Link>
      </div>
    </div>
  );
}
