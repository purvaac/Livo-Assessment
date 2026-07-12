import { NextRequest, NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_SEC = 28;
const MAX_SEC = 47;

function wavDurationSeconds(buf: Buffer): number {
  const byteRate = buf.readUInt32LE(28);
  const dataSize = buf.readUInt32LE(40);
  if (!byteRate) return 0;
  return dataSize / byteRate;
}

export async function POST(req: NextRequest) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return NextResponse.json(
      { error: "Server is missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION env vars." },
      { status: 500 }
    );
  }

  const arrayBuffer = await req.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  if (audioBuffer.length < 44) {
    return NextResponse.json({ error: "Invalid audio payload." }, { status: 400 });
  }

  const duration = wavDurationSeconds(audioBuffer);
  if (duration < MIN_SEC || duration > MAX_SEC) {
    return NextResponse.json(
      { error: `Audio must be 30-45 seconds. Received ~${duration.toFixed(1)}s.` },
      { status: 400 }
    );
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;

  const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);

  const assessmentConfig = new sdk.PronunciationAssessmentConfig(
    "",
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Word,
    true
  );

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  assessmentConfig.applyTo(recognizer);

  return await new Promise<NextResponse>((resolve) => {
    recognizer.recognizeOnceAsync((result) => {
      recognizer.close();

      if (result.reason === sdk.ResultReason.NoMatch) {
        resolve(
          NextResponse.json(
            { error: "Could not recognize speech in the audio. Try a clearer recording." },
            { status: 400 }
          )
        );
        return;
      }

      if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
        const errMsg = `Speech recognition failed (reason: ${result.reason}).`;
        resolve(NextResponse.json({ error: errMsg }, { status: 502 }));
        return;
      }

      let pronResult: any = null;
      try {
        pronResult = sdk.PronunciationAssessmentResult.fromResult(result);
      } catch {}

      const words: Array<{ word: string; accuracyScore: number | null; errorType: string }> = [];
      let debugRaw = "";

      try {
        const props = result.properties as any;

        let jsonStr: string | null = null;

        if (typeof props.getProperty === "function") {
          try { jsonStr = props.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult); } catch {}
        }

        if (!jsonStr) {
          try { jsonStr = props[sdk.PropertyId.SpeechServiceResponse_JsonResult]; } catch {}
        }

        if (!jsonStr) {
          try { jsonStr = props.toString ? props.toString() : JSON.stringify(props); } catch {}
        }

        if (!jsonStr) {
          try { jsonStr = (result as any).json; } catch {}
        }

        if (!jsonStr) {
          try { jsonStr = JSON.stringify(result); } catch {}
        }

        debugRaw = jsonStr || "";

        if (jsonStr) {
          const parsed = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
          const nBest = parsed.NBest?.[0] || parsed.nBest?.[0];
          if (nBest) {
            const azureWords = nBest.Words || nBest.words || [];
            for (const w of azureWords) {
              const pa = w.PronunciationAssessment || w.pronunciationAssessment || {};
              const accScore = pa.AccuracyScore ?? pa.accuracyScore ?? w.AccuracyScore ?? w.accuracyScore;
              words.push({
                word: w.Word || w.word || "",
                accuracyScore: typeof accScore === "number" ? accScore : null,
                errorType: pa.ErrorType || pa.errorType || w.ErrorType || w.errorType || "None",
              });
            }
          }
        }
      } catch (e: any) {
        debugRaw = `EXTRACT_ERROR: ${e?.message || e}`;
      }

      resolve(
        NextResponse.json({
          transcript: result.text || "",
          overall: {
            pronScore: pronResult?.pronunciationScore ?? null,
            accuracyScore: pronResult?.accuracyScore ?? null,
            fluencyScore: pronResult?.fluencyScore ?? null,
            completenessScore: pronResult?.completenessScore ?? null,
          },
          words,
          _debug: debugRaw.slice(0, 2000),
        })
      );
    });
  });
}
