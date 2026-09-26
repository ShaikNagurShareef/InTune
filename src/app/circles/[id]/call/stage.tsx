"use client";

import { useIsSpeaking, useParticipants, useParticipantTracks, VideoTrack } from "@livekit/components-react";
import { Track, type Participant } from "livekit-client";
import { EyeOff, MicOff } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { signalInfo } from "./protocol";
import type { ActiveSignal, LiveCaption } from "./use-call-feed";

interface StageProps {
  selfView: boolean;
  live: Record<string, LiveCaption>;
  signals: Record<string, ActiveSignal>;
}

/** Column count by number of people; tiles never reorder when someone speaks, so the screen stays still. */
function columns(n: number): string {
  if (n <= 1) return "grid-cols-1";
  if (n <= 4) return "grid-cols-1 sm:grid-cols-2";
  if (n <= 9) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
}

const byJoinTime = (a: Participant, b: Participant) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0) || a.identity.localeCompare(b.identity);

export function Stage({ selfView, live, signals }: StageProps) {
  const people = [...useParticipants()].sort(byJoinTime);
  const captions = Object.entries(live);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
      <ul aria-label="People in the call" className={`mx-auto grid min-h-0 w-full max-w-6xl flex-1 content-center gap-3 overflow-y-auto p-1 ${columns(people.length)}`}>
        {people.map((p) => (
          <Tile key={p.identity} participant={p} selfView={selfView} signal={signals[p.identity]} />
        ))}
      </ul>
      {people.length === 1 && <p className="text-center text-sm text-ink-2" role="status">Waiting for others to join…</p>}
      {captions.length > 0 && (
        <div className="mx-auto w-full max-w-3xl space-y-1 rounded-2xl bg-ink/85 px-4 py-2 text-paper">
          {captions.map(([id, c]) => (
            <p key={id} className="text-base leading-snug">
              <strong>{c.mine ? "You" : c.name}:</strong> {c.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ participant, selfView, signal }: { participant: Participant; selfView: boolean; signal?: ActiveSignal }) {
  const speaking = useIsSpeaking(participant);
  const [camera] = useParticipantTracks([Track.Source.Camera], participant.identity);
  const cameraOn = Boolean(camera && !camera.publication.isMuted);
  const hiddenSelf = participant.isLocal && !selfView;
  const name = participant.isLocal ? "You" : participant.name || "Someone";
  const info = signal ? signalInfo(signal.kind) : undefined;
  return (
    <li
      aria-label={`${name}${speaking ? ", speaking" : ""}${participant.isMicrophoneEnabled ? "" : ", muted"}`}
      className={`relative grid aspect-video place-items-center overflow-hidden rounded-3xl bg-paper-2 transition-shadow duration-300 ${speaking ? "ring-4 ring-sage" : "ring-1 ring-line"}`}
    >
      {cameraOn && camera && !hiddenSelf ? (
        <VideoTrack trackRef={camera} className={`h-full w-full object-cover ${participant.isLocal ? "scale-x-[-1]" : ""}`} />
      ) : (
        <div className="flex flex-col items-center gap-2 p-3 text-center">
          <Avatar name={participant.name || "?"} seed={participant.identity} size="lg" />
          {hiddenSelf && cameraOn && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-2">
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> Your camera is on (hidden from you)
            </span>
          )}
        </div>
      )}
      <span className="absolute bottom-2 left-2 inline-flex max-w-[80%] items-center gap-1.5 truncate rounded-full bg-card/90 px-3 py-1 text-sm font-bold">
        {!participant.isMicrophoneEnabled && <MicOff aria-hidden="true" className="h-4 w-4 text-clay" />}
        {name}
      </span>
      {info && (
        <span role="status" className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 text-sm font-bold text-amber-ink">
          <info.icon aria-hidden="true" className="h-4 w-4" /> {info.label}
        </span>
      )}
    </li>
  );
}
