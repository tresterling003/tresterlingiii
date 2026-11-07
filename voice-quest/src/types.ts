// Shared types for Voice Quest.

/** Practice level is the *communication* demand. It is independent of gameplay challenge. */
export type PracticeLevel = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * How the game uses the microphone.
 *  - recognition: mic level detection + browser speech recognition (may use an online service; requires consent)
 *  - activity:    mic level detection only, processed locally. No transcript. Any voice attempt counts as practice.
 *  - pictures:    no microphone at all. Every voice moment becomes a picture choice.
 */
export type VoiceMode = 'recognition' | 'activity' | 'pictures';

/** How much spoken modelling the character gives before the child answers. */
export type PromptingStyle = 'model-first' | 'model-after-try' | 'picture-cue';

export type GameplayChallenge = 'gentle' | 'normal' | 'zippy';

export interface CustomWord {
  id: string;
  word: string;
  picture: string; // emoji or short label
  accept: string[];
}

export interface HeroLook {
  coat: string;
  hat: string;
  scarf: string;
  skin: string;
  hair: string;
  hatStyle: 'beanie' | 'elf' | 'antlers' | 'crown' | 'earmuffs';
}

export interface ReindeerLook {
  blanket: string;
  redNose: boolean;
  bellCollar: boolean;
  antlerLights: boolean;
}

export interface Volumes {
  master: number;
  music: number;
  voice: number;
  sfx: number;
}

export interface Settings {
  setupDone: boolean;
  voiceMode: VoiceMode;
  /** Parent acknowledged that browser recognition may send audio to an online service. */
  consentExternal: boolean;
  lang: string;
  practiceLevel: PracticeLevel;
  /** Optional parent/SLP-provided target sounds, e.g. ["b","m","s"]. Used to prefer words that contain them. */
  targetSounds: string[];
  customWords: CustomWord[];
  /** Extra accepted answers keyed by target word (lowercase). */
  acceptedExtra: Record<string, string[]>;
  prompting: PromptingStyle;
  /** Seconds the microphone stays open waiting for a response (extended while the child is speaking). */
  listenSeconds: number;
  /** Accept near matches like "had" for "hat" (recognizers often mishear children). */
  generousMatching: boolean;
  /** Voice tries before "continue with help" is highlighted. */
  maxTries: number;
  /** 0 = no break reminder */
  sessionMinutes: number;
  gameplay: GameplayChallenge;
  volumes: Volumes;
  reducedMotion: boolean;
  reducedEffects: boolean;
  captions: boolean;
  devPanel: boolean;
  hero: HeroLook;
  reindeer: ReindeerLook;
}

/** Child-facing interaction states (Section 6 of the brief). */
export type VoiceState =
  | 'recognized' // A: target (or accepted equivalent) recognized in the transcript
  | 'heard' // B: voice activity detected but target not confidently recognized
  | 'silent' // C: no speech detected
  | 'unavailable'; // D: recognition / mic unavailable -> picture interaction

/** Parent-facing labels. Deliberately non-clinical. */
export type AttemptLabel = 'Recognized' | 'Practiced' | 'Tried again' | 'Completed with help' | 'Picture choice';

export interface AttemptRecord {
  t: number; // epoch ms
  activity: string;
  target: string;
  level: PracticeLevel;
  mode: VoiceMode;
  /** Raw technical state of the final try. */
  state: VoiceState;
  label: AttemptLabel;
  tries: number;
  /** Transcripts only if recognition mode is on. Never audio. */
  transcripts: string[];
  matchedText?: string;
}

export interface Progress {
  stars: number;
  coins: number;
  bells: number;
  /** ids of hidden stars/coins already collected */
  found: string[];
  /** unlock ids (decorations, outfits, accessories, toys) */
  unlocks: string[];
  /** activity completion counters */
  completions: Record<string, number>;
  medals: { dash: ('bronze' | 'silver' | 'gold')[] };
  bestDashTime?: number;
  /** cabin slot -> decoration id */
  cabin: Record<string, string>;
  sessions: { start: number; minutes: number }[];
  /** colours of the robot built in the Toy Factory */
  robotDesign?: Record<string, number>;
}

export interface ParentNote {
  t: number;
  text: string;
}

export interface Unlock {
  id: string;
  kind: 'decoration' | 'outfit' | 'reindeer' | 'toy';
  name: string;
  icon: string; // emoji for parent/child UI
  how: string; // short description for parent view
}
