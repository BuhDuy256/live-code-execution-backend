import { CODE_TEMPLATES, type SupportedLanguage } from '../config/constants';

export const getTemplateByLanguage = (language: string): string => {
  const normalizedLanguage = language.toLowerCase() as SupportedLanguage;
  return CODE_TEMPLATES[normalizedLanguage] || '';
};
