import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGES, SupportedLanguage } from '../config/constants';

export function isSupportedLanguage(language: string): language is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(language);
}

export function validateLanguage(language: string): asserts language is SupportedLanguage {
  if (!isSupportedLanguage(language)) {
    throw new Error(
      `Unsupported language: ${language}. Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`
    );
  }
}

export const getLanguageConfig = (language: string) => {
  const config = LANGUAGE_CONFIG[language as keyof typeof LANGUAGE_CONFIG];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }
  return config;
};
