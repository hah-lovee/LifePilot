"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { VoiceTranscription } from "@/lib/types";

/** Current form values, so the review panel can tell what a recording would
 *  overwrite. Anything already filled stays unchecked until the user says so. */
export type VoiceCurrent = {
  text: string;
  tags: string[];
  mood: number | null;
  energy: number | null;
  body_condition: number | null;
  sleep_bedtime: string;
  sleep_wakeup: string;
};

/** Only the fields the user ticked. Undefined means "leave it alone". */
export type VoiceApply = {
  text?: string;
  tags?: string[];
  mood?: number;
  energy?: number;
  body_condition?: number;
  sleep_bedtime?: string;
  sleep_wakeup?: string;
};

type Phase = "idle" | "recording" | "uploading" | "review";

// Ordered as they read in the review panel, not as they sit in the schema.
const SCORE_FIELDS = [
  ["mood", "Настроение"],
  ["energy", "Энергия"],
  ["body_condition", "Самочувствие"],
] as const;

function pickMimeType(): string {
  // Chrome and Edge do webm/opus; Firefox prefers ogg/opus. Whisper reads both,
  // and an empty string lets the browser choose if neither is advertised.
  for (const type of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function VoiceCapture({
  current,
  onApply,
}: {
  current: VoiceCurrent;
  onApply: (fields: VoiceApply) => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceTranscription | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [textMode, setTextMode] = useState<"append" | "replace">("append");
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Release the microphone if the page is left mid-recording — without this the
  // browser keeps showing the recording indicator after navigating away.
  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  async function start() {
    setError(null);
    setResult(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // getUserMedia only exists in a secure context, so this is what an
      // http:// origin looks like — worth naming, it is not obvious.
      setError("Браузер не даёт доступ к микрофону. Нужен https (или localhost).");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Нет доступа к микрофону — разрешите его в настройках браузера.");
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void upload(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
    };

    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setPhase("recording");
  }

  function stop() {
    recorderRef.current?.stop();
    setPhase("uploading");
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (recorder) {
      // Drop the audio before onstop can fire, so cancelling never uploads.
      recorder.onstop = null;
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    }
    chunksRef.current = [];
    setPhase("idle");
  }

  async function upload(blob: Blob) {
    const extension = blob.type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("file", blob, `voice.${extension}`);
    try {
      const data = await api.upload<VoiceTranscription>("/api/diary/voice-transcribe", form);
      setResult(data);
      // Pre-tick only what wouldn't overwrite anything: a field the user has
      // already filled needs a deliberate second click.
      setChecked({
        text: data.text !== null,
        tags: data.tags.length > 0,
        mood: data.mood !== null && current.mood === null,
        energy: data.energy !== null && current.energy === null,
        body_condition: data.body_condition !== null && current.body_condition === null,
        sleep_bedtime: data.sleep_bedtime !== null && !current.sleep_bedtime,
        sleep_wakeup: data.sleep_wakeup !== null && !current.sleep_wakeup,
      });
      setTextMode(current.text.trim() ? "append" : "replace");
      setPhase("review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось обработать запись");
      setPhase("idle");
    }
  }

  async function apply() {
    if (!result) return;
    const fields: VoiceApply = {};
    if (checked.text && result.text) {
      fields.text =
        textMode === "append" && current.text.trim()
          ? `${current.text.trimEnd()}\n\n${result.text}`
          : result.text;
    }
    if (checked.tags && result.tags.length) {
      fields.tags = Array.from(new Set([...current.tags, ...result.tags]));
    }
    for (const [key] of SCORE_FIELDS) {
      const value = result[key];
      if (checked[key] && value !== null) fields[key] = value;
    }
    if (checked.sleep_bedtime && result.sleep_bedtime) fields.sleep_bedtime = result.sleep_bedtime;
    if (checked.sleep_wakeup && result.sleep_wakeup) fields.sleep_wakeup = result.sleep_wakeup;

    await onApply(fields);
    setPhase("idle");
    setResult(null);
  }

  function toggle(key: string) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="card p-4">
      {phase === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={start} className="btn-secondary flex items-center gap-2">
            🎤 Записать голосом
          </button>
          <span className="text-[12px] text-[var(--color-faint)]">
            Расскажите, как прошёл день — заполню поля сам
          </span>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="voice-pulse" aria-hidden />
          <span className="text-sm font-medium text-[var(--color-ink)]">Запись… {mmss}</span>
          <button type="button" onClick={stop} className="btn-primary py-1.5 text-[13px]">
            Стоп
          </button>
          <button type="button" onClick={cancel} className="btn-secondary py-1.5 text-[13px]">
            Отмена
          </button>
        </div>
      )}

      {phase === "uploading" && (
        <div className="flex items-center gap-3">
          <span className="voice-spinner" aria-hidden />
          <span className="text-sm text-[var(--color-ink)]">Обрабатываю…</span>
        </div>
      )}

      {phase === "review" && result && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
            Что я услышал
          </p>

          {result.used_raw_transcript && (
            <p className="text-[12px] text-[#8a6a1a]">
              Модель не сложила связный текст — ниже расшифровка как есть.
            </p>
          )}

          {result.text && (
            <label className="flex gap-2.5">
              <input
                type="checkbox"
                checked={!!checked.text}
                onChange={() => toggle("text")}
                className="mt-1 flex-shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="text-[13px] font-medium text-[var(--color-ink)]">Текст записи</span>
                <span className="mt-1 block whitespace-pre-wrap break-words text-[13px] text-[#5e7686]">
                  {result.text}
                </span>
                {current.text.trim() && (
                  <span className="mt-1.5 flex gap-3 text-[12px]">
                    {(["append", "replace"] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-1">
                        <input
                          type="radio"
                          checked={textMode === mode}
                          onChange={() => setTextMode(mode)}
                        />
                        {mode === "append" ? "дописать" : "заменить"}
                      </label>
                    ))}
                  </span>
                )}
              </span>
            </label>
          )}

          {result.tags.length > 0 && (
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={!!checked.tags} onChange={() => toggle("tags")} />
              <span className="text-[13px] text-[var(--color-ink)]">
                Теги: <span className="text-[#5e7686]">{result.tags.join(", ")}</span>
              </span>
            </label>
          )}

          {SCORE_FIELDS.map(([key, label]) =>
            result[key] === null ? null : (
              <label key={key} className="flex items-center gap-2.5">
                <input type="checkbox" checked={!!checked[key]} onChange={() => toggle(key)} />
                <span className="text-[13px] text-[var(--color-ink)]">
                  {label}: <span className="text-[#5e7686]">{result[key]}/10</span>
                  {current[key] !== null && (
                    <span className="ml-1.5 text-[12px] text-[#8a6a1a]">
                      (заменит {current[key]})
                    </span>
                  )}
                </span>
              </label>
            )
          )}

          {(["sleep_bedtime", "sleep_wakeup"] as const).map((key) =>
            result[key] === null ? null : (
              <label key={key} className="flex items-center gap-2.5">
                <input type="checkbox" checked={!!checked[key]} onChange={() => toggle(key)} />
                <span className="text-[13px] text-[var(--color-ink)]">
                  {key === "sleep_bedtime" ? "Лёг" : "Встал"}:{" "}
                  <span className="text-[#5e7686]">{result[key]}</span>
                  {current[key] && (
                    <span className="ml-1.5 text-[12px] text-[#8a6a1a]">(заменит {current[key]})</span>
                  )}
                </span>
              </label>
            )
          )}

          <details className="text-[12px] text-[var(--color-faint)]">
            <summary className="cursor-pointer">Исходная расшифровка</summary>
            <p className="mt-1 whitespace-pre-wrap break-words">{result.transcript}</p>
          </details>

          <div className="flex gap-2">
            <button type="button" onClick={apply} className="btn-primary py-1.5 text-[13px]">
              Применить
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setResult(null);
              }}
              className="btn-secondary py-1.5 text-[13px]"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-[#b5503e]">{error}</p>}
    </div>
  );
}
