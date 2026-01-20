import { CODE_TEMPLATES } from '../config/constants';

export const getTemplateByLanguage = (language: string): string => {
  return CODE_TEMPLATES[language.toLowerCase()] || '';
};
