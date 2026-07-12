// Converts an AudioBuffer to a 16kHz mono, 16-bit PCM WAV Blob.
// Done client-side so we never need ffmpeg in the serverless function.

function downsampleAndMono(buffer: AudioBuffer, targetRate: number): Float32Array {
  const numChannels = buffer.numberOfChannels;
  const srcRate = buffer.sampleRate;
  const length = buffer.length;

  // Mixdown to mono
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / numChannels;
    }
  }

  if (srcRate === targetRate) return mono;

  const ratio = srcRate / targetRate;
  const newLength = Math.round(mono.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = mono[Math.round(i * ratio)] || 0;
  }
  return result;
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export async function fileToWav16kMono(file: File): Promise<{ blob: Blob; durationSec: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const durationSec = decoded.duration;

  const targetRate = 16000;
  const samples = downsampleAndMono(decoded, targetRate);

  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = targetRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  floatTo16BitPCM(view, 44, samples);

  await ctx.close();

  return { blob: new Blob([buffer], { type: "audio/wav" }), durationSec };
}
