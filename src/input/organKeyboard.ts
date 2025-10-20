import * as Tone from 'tone';

const GERMAN_WHITE = 'qwertzuiopasdfghjklöä'.split('');
const GERMAN_BLACK = '1234567890ß´ü+#'.split('');
const LOW_MIDI = 48; // C3
const NUM_NOTES = 36; // 3 octaves => 21 white + 15 black

const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

function buildCharToMidi(): Map<string, number> {
  const whiteMidi: number[] = [];
  const blackMidi: number[] = [];
  for (let m = LOW_MIDI; m < LOW_MIDI + NUM_NOTES; m++) {
    (isBlack(m) ? blackMidi : whiteMidi).push(m);
  }
  const map = new Map<string, number>();
  for (let i = 0; i < Math.min(whiteMidi.length, GERMAN_WHITE.length); i++) {
    map.set(GERMAN_WHITE[i], whiteMidi[i]);
  }
  for (let i = 0; i < Math.min(blackMidi.length, GERMAN_BLACK.length); i++) {
    map.set(GERMAN_BLACK[i], blackMidi[i]);
  }
  return map;
}

function normalizeKey(e: KeyboardEvent): string {
  const k = e.key || '';
  if (k === 'Dead') return '´';
  if (k === 'Add') return '+';
  return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
}

export function bindGermanKeyboard(organ: Tone.Sampler) {
  const charToMidi = buildCharToMidi();
  const down = new Set<string>();

  window.addEventListener('keydown', (e) => {
    const ch = normalizeKey(e);
    const midi = charToMidi.get(ch);
    if (midi === undefined) return;
    if (down.has(ch)) { e.preventDefault(); return; }
    down.add(ch);
    organ.triggerAttack(Tone.Frequency(midi, 'midi').toNote());
    e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    const ch = normalizeKey(e);
    const midi = charToMidi.get(ch);
    if (midi === undefined) return;
    if (down.has(ch)) {
      organ.triggerRelease(Tone.Frequency(midi, 'midi').toNote());
      down.delete(ch);
      e.preventDefault();
    }
  });

  window.addEventListener('blur', () => {
    for (const ch of down) {
      const midi = charToMidi.get(ch);
      if (midi !== undefined) organ.triggerRelease(Tone.Frequency(midi, 'midi').toNote());
    }
    down.clear();
  });
}
