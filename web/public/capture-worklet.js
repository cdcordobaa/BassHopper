// Captures input, box-filter decimates to ~12 kHz and posts fixed-size chunks with timestamps.
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.decimate = options.processorOptions.decimate
    this.chunk = options.processorOptions.chunk
    this.buf = new Float32Array(this.chunk)
    this.i = 0
    this.acc = 0
    this.n = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let k = 0; k < ch.length; k++) {
      this.acc += ch[k]
      if (++this.n === this.decimate) {
        this.buf[this.i++] = this.acc / this.decimate
        this.acc = 0
        this.n = 0
        if (this.i === this.chunk) {
          this.port.postMessage({ samples: this.buf.slice(), time: currentTime + k / sampleRate })
          this.i = 0
        }
      }
    }
    return true
  }
}

registerProcessor('bh-capture', Capture)
