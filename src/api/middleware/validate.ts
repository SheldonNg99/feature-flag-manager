import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validate(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      throw result.error;
    }
    req.body = result.data.body;
    req.query = result.data.query;
    req.params = result.data.params;
    next();
  };
}
