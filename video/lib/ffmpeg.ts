import { spawn } from "node:child_process";

/** Runs a command, rejecting with the tail of stderr on failure. */
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`))));
  });
}

export const ffmpeg = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export async function probeDuration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Number(out.trim());
}

export async function probe(file: string): Promise<string> {
  return run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate:format=duration", "-of", "compact", file]);
}

/** Escapes a path for ffmpeg filter arguments (subtitles=...). */
export const filterPath = (p: string) => p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
