import db from '../config/database';
import { getTemplateByLanguage } from '../utils/template.util';

export const createCodeSession = async (session_id: string, language: string) => {
  await db('code_sessions').insert({
    id: session_id,
    user_id: "demo-user",
    language: language,
    // status: "ACTIVE", // => Default status is ACTIVE in DB
    source_code: getTemplateByLanguage(language),
  });
}

export const getCodeSessionById = async (session_id: string): Promise<{ status: string }> => {
  const session = await db('code_sessions').where({ id: session_id }).first();
  return session;
}

export const updateCodeSession = async (session_id: string, language: string, newCode: string) => {
  await db('code_sessions').update({
    language: language,
    source_code: newCode,
  }).where({ id: session_id });
}