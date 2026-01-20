import { Request, Response, NextFunction } from 'express';
import { createNewCodingSession, updateCode, executeCode } from '../../services/codeSession.service';
import { SessionIdParams, PatchSessionBody } from '../types/requests/codeSession';

export const createCodingSession = async (_request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await createNewCodingSession();
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateCodingSession = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const { session_id } = request.params as unknown as SessionIdParams;
    const { language, source_code } = request.body as unknown as PatchSessionBody;

    const result = await updateCode(
      session_id,
      language,
      source_code
    );

    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const executeCodeInSession = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const { session_id } = request.params as unknown as SessionIdParams;

    const result = await executeCode(session_id);

    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
};