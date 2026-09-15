class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.chunkSize = 12000; // 250ms @48k per ROADMAP (was 4096 ~85ms; now 250ms = 12000 samples)
  }
  process(inputs) {
    const input = inputs[0][0];
    if (input) {
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.buffer.push(copy);
      let total = this.buffer.reduce((s, a) => s + a.length, 0);
      if (total >= this.chunkSize) {
        const merged = new Float32Array(total);
        let off = 0;
        for (const a of this.buffer) { merged.set(a, off); off += a.length; }
        this.port.postMessage(merged.slice(0, this.chunkSize));
        const rem = merged.slice(this.chunkSize);
        this.buffer = rem.length ? [rem] : [];
      }
    }
    return true;
  }
}
registerProcessor("pcm-worklet", PCMWorklet);
