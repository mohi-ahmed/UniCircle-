import 'dotenv/config';
import { z } from 'zod';

const developmentCsrfSecret = 'development-only-csrf-secret-change-me';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default('UniCircle'),
  UNIVERSITY_NAME: z.string().trim().min(2).max(200),
  INITIAL_APPROVED_DOMAIN: z.literal('seu.edu.bd').default('seu.edu.bd'),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('uc_session'),
  CSRF_SECRET: z.string().min(32).default(developmentCsrfSecret),
  EMAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_LISTING_BUCKET: z.string().min(1).default('unicircle-listings'),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && value.CSRF_SECRET === developmentCsrfSecret) {
    context.addIssue({ code: 'custom', path: ['CSRF_SECRET'], message: 'A unique production CSRF secret is required.' });
  }
  if (value.NODE_ENV === 'production') {
    for (const key of ['EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const) {
      if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required in production.` });
    }
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
      if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required in production.` });
    }
  }
});

export type Environment = z.infer<typeof schema>;

let cached: Environment | undefined;

export function getEnvironment(): Environment {
  cached ??= schema.parse(process.env);
  return cached;
}

export function resetEnvironmentForTests(): void {
  cached = undefined;
}
