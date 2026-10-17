// Renders a draft two-voice narration for the hackathon video from documents/video/lines.json
// using macOS `say`, then joins it with ffmpeg and writes captions timed to the real audio.
//
// Outputs (documents/video/out/): narration.m4a, captions.srt, timeline.json.
// Requires macOS (`say`) and ffmpeg/ffprobe on PATH.
//
// Usage: node scripts/video/build-narration.mjs

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const VIDEO_DIR = path.resolve("documents/video");
const OUT_DIR = path.join(VIDEO_DIR, "out");
const WORK_DIR = path.join(OUT_DIR, "work");
const SAMPLE_RATE = "44100";

const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

function duration(file) {
  return Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]));
}

function toWav(input, output) {
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-ar", SAMPLE_RATE, "-ac", "1", "-c:a", "pcm_s16le", output]);
}

function silence(seconds, output) {
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`, "-t", seconds.toFixed(3), "-c:a", "pcm_s16le", output]);
}

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

async function main() {
  const script = JSON.parse(await readFile(path.join(VIDEO_DIR, "lines.json"), "utf8"));
  await rm(WORK_DIR, { recursive: true, force: true });
  await mkdir(WORK_DIR, { recursive: true });

  const parts = [];
  const timeline = [];
  let clock = 0.6; // short lead-in before the first line
  silence(clock, path.join(WORK_DIR, "lead.wav"));
  parts.push(path.join(WORK_DIR, "lead.wav"));

  for (const [index, line] of script.lines.entries()) {
    const voice = script.voices[line.voice];
    const stem = path.join(WORK_DIR, String(index).padStart(3, "0"));
    run("say", ["-v", voice.say_voice, "-r", String(voice.rate_wpm), "-o", `${stem}.aiff`, line.text]);
    toWav(`${stem}.aiff`, `${stem}.wav`);
    const spoken = duration(`${stem}.wav`);
    timeline.push({ index, section: line.section, voice: line.voice, start: clock, end: clock + spoken, text: line.text });
    parts.push(`${stem}.wav`);
    clock += spoken;

    const pause = (line.pause_ms ?? 500) / 1000;
    silence(pause, `${stem}-pause.wav`);
    parts.push(`${stem}-pause.wav`);
    clock += pause;
  }

  const list = path.join(WORK_DIR, "concat.txt");
  await writeFile(list, parts.map((part) => `file '${part}'`).join("\n"));
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "aac", "-b:a", "160k", path.join(OUT_DIR, "narration.m4a")]);

  const srt = timeline
    .map((entry, i) => `${i + 1}\n${srtTime(entry.start)} --> ${srtTime(entry.end)}\n${entry.voice === "agent" ? "AGENT: " : ""}${entry.text}\n`)
    .join("\n");
  await writeFile(path.join(OUT_DIR, "captions.srt"), srt);

  const sections = script.sections.map((section) => {
    const lines = timeline.filter((entry) => entry.section === section.id);
    return { ...section, start: lines[0]?.start ?? null, end: lines.at(-1)?.end ?? null };
  });
  await writeFile(path.join(OUT_DIR, "timeline.json"), `${JSON.stringify({ total_seconds: clock, sections, lines: timeline }, null, 2)}\n`);
  await rm(WORK_DIR, { recursive: true, force: true });

  for (const section of sections) {
    console.log(`${srtTime(section.start ?? 0).slice(3, 8)}–${srtTime(section.end ?? 0).slice(3, 8)}  ${section.name}`);
  }
  console.log(`total ${clock.toFixed(1)}s -> documents/video/out/narration.m4a, captions.srt, timeline.json`);
}

main().catch((error) => {
  console.error(error.stderr?.toString() || error.message);
  process.exit(1);
});
