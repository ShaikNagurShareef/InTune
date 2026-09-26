"use client";

import { useEffect, useState } from "react";
import { RoomAudioRenderer, StartAudio, useConnectionState, useLocalParticipant, useParticipants, useRoomContext } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { WifiOff } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useMediaQuery } from "@/lib/client/media-query";
import { Avatar } from "@/components/avatar";
import { CallControls } from "./controls";
import { ConversationPanel, type PanelTab } from "./conversation-panel";
import { signalInfo, type TranscriptEntry } from "./protocol";
import { Stage } from "./stage";
import { useSpeechCaptions } from "./use-captions";
import { useCallFeed } from "./use-call-feed";
import type { CallCircle, CallMe, CallSettings } from "./types";

interface Props {
  me: CallMe;
  circle: CallCircle;
  callId: string;
  canEnd: boolean;
  audioRate: number;
  settings: CallSettings;
  notice: string | null;
  onNotice: (notice: string | null) => void;
  onSettings: (s: CallSettings) => void;
  /** Records why we're about to disconnect (null to cancel), before LiveKit reports it. */
  onLeaving: (reason: string | null) => void;
  onEnded: (reason: string) => void;
}

/** Keeps the microphone and camera in step with the buttons for the whole call (not just at connect). */
function useDeviceSync(connected: boolean, mic: boolean, camera: boolean, onFail: (msg: string) => void) {
  const { localParticipant } = useLocalParticipant();
  useEffect(() => {
    if (!connected) return;
    localParticipant.setMicrophoneEnabled(mic).catch(() => onFail("Couldn’t change your microphone. Check the browser’s permission."));
  }, [connected, mic, localParticipant, onFail]);
  useEffect(() => {
    if (!connected) return;
    localParticipant.setCameraEnabled(camera).catch(() => onFail("Couldn’t change your camera. Check the browser’s permission."));
  }, [connected, camera, localParticipant, onFail]);
}

/** What a screen reader announces: finished lines and signals from others, never interim words. */
function announcement(entries: TranscriptEntry[]): string {
  const last = [...entries].reverse().find((e) => !e.mine);
  if (!last) return "";
  const text = last.kind === "signal" ? (signalInfo(last.text)?.label ?? last.text) : last.text;
  return `${last.from.name}: ${text}`;
}

export function CallRoom({ circle, callId, canEnd, audioRate, settings, notice, onNotice, onSettings, onLeaving, onEnded }: Props) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const count = useParticipants().length;
  const isWide = useMediaQuery("(min-width: 1024px)");
  // null = default for the screen size (open on wide screens); "hidden" = closed on purpose.
  const [panel, setPanel] = useState<PanelTab | "hidden" | null>(null);
  const panelOpen: PanelTab | null = panel === "hidden" ? null : (panel ?? (isWide ? "conversation" : null));
  const feed = useCallFeed({ callId, interpreter: settings.interpreter, readAloud: settings.readAloud, audioRate });
  const connected = connection === ConnectionState.Connected;
  useDeviceSync(connected, settings.mic, settings.camera, onNotice);
  useSpeechCaptions(connected && settings.mic && settings.captions, feed.sendCaption, onNotice);

  const update = (patch: Partial<CallSettings>) => onSettings({ ...settings, ...patch });

  async function endForEveryone() {
    const reason = "You ended the call for everyone";
    onLeaving(reason);
    try {
      await api(`/api/v1/calls/${callId}/end`, { method: "POST" });
      onEnded(reason);
      await room.disconnect();
    } catch (err) {
      onLeaving(null);
      onNotice(err instanceof ApiError ? err.message : "Couldn’t end the call. Please try again.");
    }
  }

  async function leave() {
    onLeaving("You left the call");
    onEnded("You left the call");
    await room.disconnect();
  }

  const reconnecting = connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting;
  const problem = notice ?? feed.sendProblem;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <Avatar name={circle.name} seed={circle.avatarSeed} group={circle.kind === "group"} size="xs" />
        <h1 className="min-w-0 flex-1 truncate font-extrabold">{circle.name}</h1>
        <span className="text-sm text-ink-2">{count === 1 ? "Just you" : `${count} people`}</span>
      </header>
      {reconnecting && (
        <p role="status" className="flex shrink-0 items-center gap-2 bg-amber-soft px-4 py-2 text-sm text-amber-ink">
          <WifiOff aria-hidden="true" className="h-4 w-4" /> The connection is unsteady. Reconnecting — you’re still in the call.
        </p>
      )}
      {connection === ConnectionState.Connecting && <p role="status" className="shrink-0 bg-paper-2 px-4 py-2 text-sm">Connecting…</p>}
      {problem && (
        <p role="status" className="flex shrink-0 items-center gap-2 bg-clay-soft px-4 py-2 text-sm">
          <span className="flex-1">{problem}</span>
          {notice && (
            <button type="button" onClick={() => onNotice(null)} className="min-h-9 rounded-lg px-2 font-bold underline">
              OK
            </button>
          )}
        </p>
      )}
      <p className="sr-only" aria-live="polite">{announcement(feed.entries)}</p>
      <div className="relative flex min-h-0 flex-1">
        <Stage selfView={settings.selfView} live={feed.live} signals={feed.signals} />
        {panelOpen && (
          <ConversationPanel
            tab={panelOpen}
            onTab={setPanel}
            onClose={() => setPanel("hidden")}
            feed={feed}
            callId={callId}
            interpreterOn={settings.interpreter}
            overlay={!isWide}
          />
        )}
      </div>
      <CallControls
        settings={settings}
        onChange={update}
        panel={panelOpen}
        onPanel={(tab) => setPanel(panelOpen === tab ? "hidden" : tab)}
        onSignal={feed.sendSignal}
        onLeave={() => void leave()}
        onEndForEveryone={canEnd ? () => void endForEveryone() : null}
      />
      <RoomAudioRenderer />
      <StartAudio label="Tap to hear the call" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-brand px-5 py-3 font-bold text-on-brand" />
    </div>
  );
}
