"use client";

import { useRef, useState, useEffect } from "react";
import { fileToWav16kMono } from "@/lib/encodeWav";
import styles from "./page.module.css";

type WordResult = { word: string; accuracyScore: number | null; errorType: string };
type AssessResult = {
  transcript: string;
  overall: {
    pronScore: number | null;
    accuracyScore: number | null;
    fluencyScore: number | null;
    completenessScore: number | null;
  };
  words: WordResult[];
};

const MIN_SEC = 30;
const MAX_SEC = 45;

function errorLabel(errorType: string): string {
  switch (errorType) {
    case "Mispronunciation":
      return "mispronounced";
    case "Omission":
      return "omitted / missing word";
    case "Insertion":
      return "extra word inserted";
    case "UnexpectedBreak":
      return "unnatural pause";
    case "MissingBreak":
      return "missing pause between words";
    case "Monotone":
      return "monotone / lacks emphasis";
    default:
      return "";
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return "#8a8a8a";
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#facc15";
  return "#f87171";
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "processing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [duration, setDuration] = useState<number | null>(null);
  const [result, setResult] = useState<AssessResult | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string>("");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setErrorMsg("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!consent) {
      setErrorMsg("Please accept the consent notice before uploading.");
      e.target.value = "";
      return;
    }

    setFileName(file.name);
    setStatus("checking");

    try {
      const { blob, durationSec } = await fileToWav16kMono(file);
      setDuration(durationSec);

      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudioUrl(url);

      if (durationSec < MIN_SEC || durationSec > MAX_SEC) {
        setStatus("error");
        setErrorMsg(
          `Recording is ${durationSec.toFixed(1)}s. Please upload audio between ${MIN_SEC} and ${MAX_SEC} seconds.`
        );
        return;
      }

      setStatus("processing");
      const res = await fetch("/api/assess", { method: "POST", body: blob });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong while scoring your audio.");
        return;
      }

      setResult(data);
      setStatus("done");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "Could not process this audio file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  function skip(seconds: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0,
      Math.min(audioRef.current.currentTime + seconds, audioRef.current.duration)
    );
    setAudioCurrentTime(audioRef.current.currentTime);
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Number(e.target.value);
    setAudioCurrentTime(audioRef.current.currentTime);
  }

  function formatTime(s: number): string {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Pronunciation Assessor</h1>
      <p style={{ color: "#a3a3a8", marginBottom: 24 }}>
        Upload 30–45 seconds of spoken English to get a pronunciation score and word-level feedback.
      </p>

      <div
        style={{
          background: "#181a20",
          border: "1px solid #2a2d36",
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            I consent to my voice recording being processed solely to generate a pronunciation score.
            The audio is analyzed in memory and is <strong>not stored</strong> on any server or
            database, and is discarded immediately after scoring.
          </span>
        </label>
      </div>

      <div
        style={{
          border: "2px dashed #34384a",
          borderRadius: 12,
          padding: 28,
          textAlign: "center",
          opacity: consent ? 1 : 0.5,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          disabled={!consent || status === "checking" || status === "processing"}
          onChange={handleFile}
          style={{ display: "none" }}
          id="audio-upload"
        />
        <label
          htmlFor="audio-upload"
          style={{
            cursor: consent ? "pointer" : "not-allowed",
            display: "inline-block",
            background: "#5b6cff",
            color: "white",
            padding: "10px 20px",
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          Choose audio file
        </label>
        <p style={{ color: "#8a8d99", fontSize: 13, marginTop: 12 }}>
          English speech, 30–45 seconds. WAV/MP3/M4A/WebM accepted — converted to WAV in your browser.
        </p>
        {fileName && <p style={{ fontSize: 13, marginTop: 8 }}>Selected: {fileName}</p>}
      </div>

      {audioUrl && (
        <div className={styles["audio-player"]}>
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={() => {
              if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) setAudioDuration(audioRef.current.duration);
            }}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          <div className={styles.controls}>
            <button onClick={() => skip(-10)} title="Back 10s">⟐</button>
            <button className={styles["play-btn"]} onClick={togglePlay}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button onClick={() => skip(10)} title="Forward 10s">⟐</button>
          </div>
          <div className={styles["slider-row"]}>
            <span className={styles.time}>{formatTime(audioCurrentTime)}</span>
            <input
              type="range"
              min={0}
              max={audioDuration || 0}
              step={0.1}
              value={audioCurrentTime}
              onChange={seek}
            />
            <span className={styles.time}>{formatTime(audioDuration)}</span>
          </div>
        </div>
      )}

      {status === "checking" && <p style={{ marginTop: 20 }}>Checking audio duration…</p>}
      {status === "processing" && <p style={{ marginTop: 20 }}>Scoring pronunciation…</p>}
      {status === "error" && (
        <p style={{ marginTop: 20, color: "#f87171" }}>{errorMsg}</p>
      )}

      {result && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Results</h2>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              ["Overall", result.overall.pronScore],
              ["Accuracy", result.overall.accuracyScore],
              ["Fluency", result.overall.fluencyScore],
              ["Completeness", result.overall.completenessScore],
            ].map(([label, score]) => (
              <div
                key={label as string}
                style={{
                  background: "#181a20",
                  border: `1px solid ${scoreColor(score as number | null)}`,
                  borderRadius: 10,
                  padding: "12px 16px",
                  minWidth: 110,
                }}
              >
                <div style={{ fontSize: 12, color: "#a3a3a8" }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(score as number | null) }}>
                  {score === null ? "—" : Math.round(score as number)}
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 15, marginBottom: 8, color: "#a3a3a8" }}>Word-level breakdown</h3>
          <div className={styles["word-wrap-container"]}
            style={{
              background: "#181a20",
              border: "1px solid #2a2d36",
              borderRadius: 10,
              padding: 16,
              fontSize: 16,
            }}
          >
            {result.words.map((w, i) => (
              <span
                key={i}
                className={styles["word-tip"]}
                data-tip={errorLabel(w.errorType) ? `${errorLabel(w.errorType)} (score: ${w.accuracyScore ?? "n/a"})` : `score: ${w.accuracyScore ?? "n/a"}`}
                style={{
                  color: scoreColor(w.accuracyScore),
                  borderBottom: w.errorType !== "None" ? `2px solid ${scoreColor(w.accuracyScore)}` : "none",
                }}
              >
                {w.word}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#8a8d99", marginTop: 8 }}>
            Hover a word to see its issue. Green = strong, yellow = noticeable issue, red = likely
            mispronunciation, dropped word, or unnatural break.
          </p>
        </div>
      )}
      <footer style={{ marginTop: 60, padding: "20px 0", borderTop: "1px solid #2a2d36", textAlign: "center", fontSize: 13, color: "#8a8d99" }}>
        Created by{" "}
        <a href="https://www.linkedin.com/in/purva-chopdekar-631905308" target="_blank" rel="noopener noreferrer" style={{ color: "#5b6cff", textDecoration: "none" }}>
          Purva Chopdekar
        </a>
      </footer>
    </main>
  );
}
