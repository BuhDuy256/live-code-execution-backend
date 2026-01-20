import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../config/constants';

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
