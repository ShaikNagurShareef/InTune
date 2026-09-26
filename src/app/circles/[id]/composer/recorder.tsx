"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Notice } from "@/components/ui";

export type CaptureKind = "audio" | "video";

export interface Capture {
  blob: Blob;
  kind: CaptureKind;
  durationSec: number;
  url: string;
}

const LIMITS: Record<CaptureKind, { sec: number; bytes: number }> = {
  audio: { sec: 30, bytes: 10 * 1024 * 1024 },
  video: { sec: 15, bytes: 20 * 1024 * 1024 },
};

function pickMime(kind: CaptureKind): string | undefined {
  const options =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
      : ["video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
}

function probeDuration(url: string, kind: CaptureKind): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => resolve(0);
    el.src = url;
  });
}

interface Props {
  kind: CaptureKind;
  onCapture: (capture: Capture | null) => void;
  onPermissionDenied: () => void;
}

/** Explicit start / stop / cancel; auto-stops at the limit; backgrounding the tab stops capture (FR13, FR14). */
export function Recorder({ kind, onCapture, onPermissionDenied }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const limit = LIMITS[kind];

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      if (recorderRef.current?.state === "recording") {
        cancelledRef.current = true;
        recorderRef.current.stop();
      }
      stopTracks();
    };
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= limit.sec && recorderRef.current?.state === "recording") recorderRef.current.stop();
        return s + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state, limit.sec]);

  const finish = async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const durationSec = await probeDuration(url, kind);
    if (blob.size < 1000) {
      setError("That recording was empty. Please try again, or type instead.");
      setState("idle");
      return;
    }
    const next = { blob, kind, durationSec: durationSec || seconds, url };
    setCapture(next);
    setState("done");
    onCapture(next);
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record here. You can upload a file, type, or use phrases.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === "audio" ? { audio: true } : { audio: true, video: { width: 640 } });
      streamRef.current = stream;
      if (kind === "video" && previewRef.current) {
        previewRef.current.srcObject = stream;
        void previewRef.current.play().catch(() => undefined);
      }
      const mimeType = pickMime(kind);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stopTracks();
        if (previewRef.current) previewRef.current.srcObject = null;
        if (cancelledRef.current) {
          setState("idle");
          return;
        }
        void finish(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || `${kind}/webm` }));
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setSeconds(0);
      setState("recording");
    } catch {
      setError(`${kind === "audio" ? "Microphone" : "Camera"} access was not allowed. You can type or tap phrases instead.`);
      onPermissionDenied();
    }
  };

  const stop = () => recorderRef.current?.state === "recording" && recorderRef.current.stop();
  const cancel = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopTracks();
    reset();
  };
  const reset = () => {
    if (capture) URL.revokeObjectURL(capture.url);
    setCapture(null);
    setState("idle");
    setSeconds(0);
    onCapture(null);
  };

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > limit.bytes) {
      setError(`That file is larger than ${limit.bytes / 1024 / 1024} MB.`);
      return;
    }
    const url = URL.createObjectURL(file);
    const durationSec = await probeDuration(url, kind);
    URL.revokeObjectURL(url);
    if (durationSec > limit.sec + 1) {
      setError(`Please choose a clip of ${limit.sec} seconds or less.`);
      return;
    }
    await finish(file);
  };

  return (
    <div className="space-y-3">
      {error && <Notice tone="warn">{error}</Notice>}
      {kind === "video" && (
        <div className={`relative overflow-hidden rounded-xl bg-ink ${state === "recording" ? "" : "hidden"}`}>
          <video ref={previewRef} muted playsInline className="aspect-video w-full object-cover" aria-label="Camera preview" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-clay px-3 py-1 text-sm font-bold text-white">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white" /> Camera on
          </span>
        </div>
      )}
      {state === "recording" && (
        <p role="status" className="flex items-center gap-2 font-bold text-clay">
          <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-clay" />
          Recording {kind === "audio" ? "audio" : "video"} — {seconds}s of {limit.sec}s
        </p>
      )}
      {state === "done" && capture && (
        <div className="space-y-2">
          {kind === "audio" ? (
            <audio controls src={capture.url} className="w-full" aria-label="Your recording" />
          ) : (
            <video controls src={capture.url} className="aspect-video w-full rounded-xl bg-ink" aria-label="Your video" />
          )}
          <p className="text-sm text-ink-2">Only you can play this. It is never shared with the circle.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "idle" && (
          <>
            <Button tone="primary" onClick={start}>● Start {kind === "audio" ? "recording" : "video"}</Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-card px-4 font-bold hover:border-ink-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal">
              Upload a file
              <input
                type="file"
                accept={kind === "audio" ? "audio/*" : "video/mp4,video/webm,video/quicktime"}
                className="sr-only"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </label>
          </>
        )}
        {state === "recording" && (
          <>
            <Button tone="primary" onClick={stop}>■ Stop</Button>
            <Button tone="ghost" onClick={cancel}>Cancel</Button>
          </>
        )}
        {state === "done" && <Button tone="ghost" onClick={reset}>Record again</Button>}
      </div>
    </div>
  );
}
