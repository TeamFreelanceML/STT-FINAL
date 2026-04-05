/**
 * Captures mono input, passes audio through, and sends copies to the main thread for PCM upload.
 * Loaded via audioWorklet.addModule (must stay plain JS).
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.[0] || !output?.[0]) {
      return true;
    }

    const channel = input[0];
    output[0].set(channel);

    const copy = new Float32Array(channel.length);
    copy.set(channel);
    this.port.postMessage(copy, [copy.buffer]);

    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
