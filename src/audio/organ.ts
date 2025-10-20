import * as Tone from 'tone';

// Subset mapping for organ samples. Add/remove entries to match your local files.
// Tone will pitch-shift missing notes between anchors.
const ORGAN_SAMPLES: Record<string, string> = {
  C1: 'C1.mp3',
  C2: 'C2.mp3',
  C3: 'C3.mp3',
  C4: 'C4.mp3',
  C5: 'C5.mp3',
  C6: 'C6.mp3',
  'D#1': 'Ds1.mp3',
  'D#2': 'Ds2.mp3',
  'D#3': 'Ds3.mp3',
  'D#4': 'Ds4.mp3',
  'D#5': 'Ds5.mp3',
  'F#1': 'Fs1.mp3',
  'F#2': 'Fs2.mp3',
  'F#3': 'Fs3.mp3',
  'F#4': 'Fs4.mp3',
  'F#5': 'Fs5.mp3',
  A1: 'A1.mp3',
  A2: 'A2.mp3',
  A3: 'A3.mp3',
  A4: 'A4.mp3',
  A5: 'A5.mp3'
};

export async function createOrgan(baseUrl: string = './assets/'): Promise<Tone.Sampler> {
  const organ = new Tone.Sampler({
    urls: ORGAN_SAMPLES,
    release: 0.5,
    baseUrl
  }).toDestination();

  // one-time audio unlock
  const startOnce = async () => {
    try { await Tone.start(); } catch {}
    window.removeEventListener('pointerdown', startOnce);
    window.removeEventListener('keydown', startOnce);
    const hint = document.getElementById('hint');
    if (hint) hint.style.display = 'none';
  };
  window.addEventListener('pointerdown', startOnce);
  window.addEventListener('keydown', startOnce);

  await Tone.loaded();
  return organ;
}

export function midiToNote(midi: number): string {
  return Tone.Frequency(midi, 'midi').toNote();
}
