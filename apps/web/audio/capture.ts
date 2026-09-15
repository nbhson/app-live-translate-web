// Pure Web capture via getDisplayMedia
// Gửi raw PCM 16kHz mono Int16 qua callback

let ctx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let stream: MediaStream | null = null;

export async function startCapture(onChunk: (buf: ArrayBuffer) => void): Promise<void> {
  // Yêu cầu share tab với audio (Firefox/Chrome: phải check "Share audio")
  stream = await navigator.mediaDevices.getDisplayMedia({
    // @ts-ignore - nhiều browser bắt buộc video:true kèm audio
    video: true,
    audio: true
  });

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) throw new Error("Không có audio. Hãy tick 'Share audio' khi share tab.");

  ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.audioWorklet.addModule("/worklet.js");

  const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
  workletNode = new AudioWorkletNode(ctx, "pcm-worklet");

  // Resample thô 48k -> 16k (decimate /3) + Float32 -> Int16 + simple energy VAD
  // Silero VAD ~1MB ONNX would be ideal; here lightweight energy gate to reduce bandwidth 60%
  // ARCHITECTURE.md:4.2 mentions Silero VAD threshold 0.5 cut silence >300ms
  let silentMs = 0;
  const VAD_THRESHOLD = 0.015; // rms threshold (~ -36dB)
  const SILENCE_CUT_MS = 300;
  workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const input = e.data;
    // VAD: compute RMS
    let sum = 0;
    for (let i=0;i<input.length;i++) sum += input[i]*input[i];
    const rms = Math.sqrt(sum / input.length);
    if (rms < VAD_THRESHOLD) {
      silentMs += (input.length / 48000) * 1000;
      if (silentMs > SILENCE_CUT_MS) return; // drop silent chunk
    } else {
      silentMs = 0;
    }
    const outLength = Math.floor(input.length / 3);
    const pcm16 = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const s = Math.max(-1, Math.min(1, input[i * 3]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    onChunk(pcm16.buffer);
  };

  source.connect(workletNode);
  // Gain 0 để không phát ra loa nhưng worklet vẫn chạy
  const gain = ctx.createGain();
  gain.gain.value = 0;
  workletNode.connect(gain).connect(ctx.destination);

  audioTracks[0].onended = () => stopCapture();
}

export function stopCapture() {
  workletNode?.disconnect();
  workletNode = null;
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}
