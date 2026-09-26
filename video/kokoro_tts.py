"""Batch narration with Kokoro (open-source neural TTS, Apache-2.0), run locally.

Reads a JSON list of jobs from stdin: [{"text", "voice", "speed", "wav", "json"}], loads the model once,
and for each job writes a 24 kHz WAV plus word timings: {"words": [{"text", "start", "end"}], "duration"}.
Used by video/lib/tts.ts; run it through the project's venv (video/.venv).
"""

import json
import sys
import warnings

warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KPipeline  # noqa: E402

SAMPLE_RATE = 24_000


def main() -> None:
    jobs = json.load(sys.stdin)
    pipelines: dict[str, KPipeline] = {}
    for job in jobs:
        lang = job["voice"][0]  # "a" = American English, "b" = British English
        if lang not in pipelines:
            pipelines[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
        pipeline = pipelines[lang]
        chunks: list[np.ndarray] = []
        words: list[dict] = []
        offset = 0.0
        for result in pipeline(job["text"], voice=job["voice"], speed=job.get("speed", 1.0)):
            audio = result.audio.numpy() if hasattr(result.audio, "numpy") else np.asarray(result.audio)
            for token in result.tokens or []:
                if token.start_ts is None or token.end_ts is None or not token.text.strip():
                    continue
                words.append({"text": token.text, "start": offset + float(token.start_ts), "end": offset + float(token.end_ts)})
            chunks.append(audio)
            offset += len(audio) / SAMPLE_RATE
        audio = np.concatenate(chunks) if chunks else np.zeros(SAMPLE_RATE // 2, dtype=np.float32)
        sf.write(job["wav"], audio, SAMPLE_RATE)
        with open(job["json"], "w") as f:
            json.dump({"text": job["text"], "duration": len(audio) / SAMPLE_RATE, "words": words}, f)
        print(f"ok {job['voice']} {len(audio) / SAMPLE_RATE:.1f}s", flush=True)


if __name__ == "__main__":
    main()
