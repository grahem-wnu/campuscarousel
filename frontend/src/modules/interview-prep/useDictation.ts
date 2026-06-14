// Speech-to-text dictation for answering mock-interview questions out loud (spec Module 12 —
// "Keira types OR voice-records her answer"). Uses the browser-native Web Speech API: nothing is
// uploaded, no audio is stored, and unsupported browsers simply report `supported: false` so the
// caller can hide the mic and fall back to typing.

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal Web Speech API shape — not part of the standard lib.dom typings. Chromium/Safari expose it
// as `webkitSpeechRecognition`; some builds also expose the unprefixed `SpeechRecognition`.
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  0: SpeechAlternative;
  isFinal: boolean;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}
interface SpeechEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface Dictation {
  /** Whether this browser exposes the Web Speech API at all. */
  supported: boolean;
  /** Currently capturing speech. */
  listening: boolean;
  /** Live, not-yet-finalized words (for a subtle preview); cleared when listening stops. */
  interim: string;
  /** Start if idle, stop if listening. */
  toggle(): void;
  /** Stop capturing (e.g. before submitting the answer). */
  stop(): void;
}

/**
 * Dictation hook. Finalized phrases are handed to `onText` (append them to the answer); interim words
 * are exposed live via `interim`. The latest `onText` is captured in a ref so the recognizer's
 * handlers never close over a stale setter.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const [supported] = useState(() => Boolean(recognitionCtor()));
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const t = r[0]?.transcript ?? '';
        if (r.isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText) onTextRef.current(finalText);
      setInterim(interimText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.onerror = () => {
      setListening(false);
      setInterim('');
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, stop]);

  // Stop the recognizer if the component unmounts mid-capture.
  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, interim, toggle, stop };
}
