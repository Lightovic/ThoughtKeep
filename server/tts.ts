import textToSpeech from '@google-cloud/text-to-speech';

const client = new textToSpeech.TextToSpeechClient();

export type VoiceStyle = 'boy' | 'girl';

const VOICES = {
  en: {
    girl: 'en-IN-Chirp3-HD-Achernar',
    boy: 'en-IN-Chirp3-HD-Achird',
  },
  hi: {
    girl: 'hi-IN-Chirp3-HD-Achernar',
    boy: 'hi-IN-Chirp3-HD-Achird',
  },
} as const;

export function prepareSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|\*|_)/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

export function resolveVoice(
  style: VoiceStyle,
  text: string,
): { languageCode: 'en-IN' | 'hi-IN'; name: string } {
  const isHindiScript = /[\u0900-\u097F]/.test(text);
  const language = isHindiScript ? 'hi' : 'en';

  return {
    languageCode: language === 'hi' ? 'hi-IN' : 'en-IN',
    name: VOICES[language][style],
  };
}

export async function synthesizeSpeech(
  text: string,
  style: VoiceStyle,
): Promise<Buffer> {
  const prepared = prepareSpeechText(text);

  if (!prepared) {
    throw new Error('Empty speech text');
  }

  const voice = resolveVoice(style, prepared);

  const [response] = await client.synthesizeSpeech({
    input: {
      text: prepared,
    },
    voice: {
      languageCode: voice.languageCode,
      name: voice.name,
    },
    audioConfig: {
      audioEncoding: 'MP3',
    },
  });

  if (!response.audioContent) {
    throw new Error('Text-to-Speech returned no audio');
  }

  return Buffer.from(response.audioContent as Uint8Array);
}
