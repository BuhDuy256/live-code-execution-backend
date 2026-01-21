import { Request, Response, NextFunction } from 'express';
import * as CodeSessionService from '../../services/codeSession.service';
import { CreateSessionBody, SessionIdParams, PatchSessionBody } from '../types/requests/codeSession';

export const createCodingSession = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const { language } = request.body as unknown as CreateSessionBody;
    const result = await CodeSessionService.createNewCodingSession(language);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateCodingSession = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const { session_id } = request.params as unknown as SessionIdParams;
    const { language, source_code } = request.body as unknown as PatchSessionBody;

    const result = await CodeSessionService.updateCode(
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

    const result = await CodeSessionService.executeCode(session_id);

    response.status(202).json(result);
  } catch (error) {
    next(error);
  }
};

export const closeCodingSession = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const { session_id } = request.params as unknown as SessionIdParams;

    const result = await CodeSessionService.closeSession(session_id);

    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
};