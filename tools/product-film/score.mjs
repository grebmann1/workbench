import { writeFile } from 'node:fs/promises';

// Original ambient score: soft extended chords, a repeating pluck, and a quiet pulse.
// Synthesized locally; no recordings, samples, external services, or music licenses.
export async function writeScore(destination, duration) {
    const rate = 48000;
    const count = Math.ceil(duration * rate);
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
    const chords = [
        [50, 57, 61, 66, 69],
        [47, 54, 57, 62, 66],
        [43, 50, 54, 59, 62],
        [45, 52, 59, 61, 64],
    ];

    function note(start, length, midi, amplitude, pan, pluck = false) {
        const hz = frequency(midi);
        const first = Math.floor(start * rate);
        const last = Math.min(count, Math.floor((start + length) * rate));
        const leftGain = Math.sqrt((1 - pan) / 2);
        const rightGain = Math.sqrt((1 + pan) / 2);
        for (let i = first; i < last; i++) {
            const t = (i - first) / rate;
            const attack = Math.min(1, t / (pluck ? 0.009 : 0.85));
            const release = Math.min(1, (length - t) / (pluck ? 0.2 : 1.5));
            const envelope = attack * release * (pluck ? Math.exp(-t * 3.4) : 1);
            const phase = 2 * Math.PI * hz * t;
            const tone = Math.sin(phase) + 0.15 * Math.sin(phase * 2) + 0.04 * Math.sin(phase * 3);
            const value = tone * envelope * amplitude;
            left[i] += value * leftGain;
            right[i] += value * rightGain;
        }
    }

    for (let bar = 0; bar * 6 < duration; bar++) {
        const start = bar * 6;
        const chord = chords[bar % chords.length];
        chord.forEach((pitch, index) => note(start, 7.5, pitch + 12, 0.023, (index - 2) / 3));
        note(start, 5.8, chord[0] - 12, 0.055, 0);
        for (let beat = 0; beat < 8; beat++) {
            const pitch = chord[[1, 3, 2, 4, 2, 3, 1, 4][beat]] + 24;
            note(start + beat * 0.75, 1.8, pitch, 0.034, beat % 2 ? 0.45 : -0.45, true);
            note(start + beat * 0.75 + 0.24, 1.4, pitch, 0.007, beat % 2 ? -0.6 : 0.6, true);
            if (start >= 6 && start < 66) note(start + beat * 0.75, 0.16, 33, 0.04, 0, true);
        }
    }

    const wav = Buffer.alloc(44 + count * 4);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 4, 28);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(count * 4, 40);
    for (let i = 0; i < count; i++) {
        const t = i / rate;
        const fade = Math.min(1, t / 2, (duration - t) / 4);
        wav.writeInt16LE(Math.round(Math.tanh(left[i] * 2) * fade * 24000), 44 + i * 4);
        wav.writeInt16LE(Math.round(Math.tanh(right[i] * 2) * fade * 24000), 46 + i * 4);
    }
    await writeFile(destination, wav);
}
