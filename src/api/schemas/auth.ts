import { z } from 'zod';

export const LoginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

export type LoginBody = z.infer<typeof LoginSchema>['body'];
