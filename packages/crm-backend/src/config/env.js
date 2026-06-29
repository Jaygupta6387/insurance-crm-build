const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url(),

  CRM_MODE: z.enum(['cloud', 'desktop']).default('cloud'),
  DESKTOP_DATABASE_URL: z.string().optional(),
  DESKTOP_LICENSE_TOKEN: z.string().optional(),
  DESKTOP_MACHINE_HASH: z.string().optional(),
  DESKTOP_COMPANY_SLUG: z.string().default('local'),
  LICENSE_CLOUD_API_URL: z.string().url().optional(),

  // Super Admin DB (optional in desktop mode)
  SUPER_ADMIN_DATABASE_URL: z.string().optional(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Bcrypt
  BCRYPT_ROUNDS: z.string().default('12'),

  // SMTP
  MAIL_FROM_NAME: z.string().default('CRM Platform'),
  MAIL_FROM_ADDRESS: z.string().email(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string().default('587'),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),

  // Frontend links in emails
  FRONTEND_RESET_PASSWORD_URL: z.string().url(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX: z.string().default('100'),
  AUTH_RATE_LIMIT_MAX: z.string().default('5'),

  // DB credential encryption
  ENCRYPT_DB_CREDENTIALS: z.string().default('false'),
  DB_ENCRYPTION_KEY: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.CRM_MODE !== 'desktop' && !data.SUPER_ADMIN_DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SUPER_ADMIN_DATABASE_URL is required in cloud mode',
      path: ['SUPER_ADMIN_DATABASE_URL'],
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  const formatted = parsed.error.format();
  Object.entries(formatted).forEach(([key, val]) => {
    if (key !== '_errors') {
      console.error(`   ${key}: ${val._errors.join(', ')}`);
    }
  });
  process.exit(1);
}

const env = parsed.data;

module.exports = {
  port: parseInt(env.PORT, 10),
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  frontendUrl: env.FRONTEND_URL,

  superAdminDatabaseUrl: env.SUPER_ADMIN_DATABASE_URL,

  crmMode: env.CRM_MODE,
  desktop: {
    databaseUrl: env.DESKTOP_DATABASE_URL || process.env.DATABASE_URL,
    licenseToken: env.DESKTOP_LICENSE_TOKEN,
    machineHash: env.DESKTOP_MACHINE_HASH,
    companySlug: env.DESKTOP_COMPANY_SLUG,
    licenseCloudApiUrl: env.LICENSE_CLOUD_API_URL,
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  bcryptRounds: parseInt(env.BCRYPT_ROUNDS, 10),

  mail: {
    fromName: env.MAIL_FROM_NAME,
    fromAddress: env.MAIL_FROM_ADDRESS,
    smtpHost: env.SMTP_HOST,
    smtpPort: parseInt(env.SMTP_PORT, 10),
    smtpSecure: env.SMTP_SECURE === 'true',
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    resetPasswordUrl: env.FRONTEND_RESET_PASSWORD_URL,
  },

  rateLimit: {
    windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS, 10),
    max: parseInt(env.RATE_LIMIT_MAX, 10),
    authMax: parseInt(env.AUTH_RATE_LIMIT_MAX, 10),
  },

  dbEncryption: {
    enabled: env.ENCRYPT_DB_CREDENTIALS === 'true',
    key: env.DB_ENCRYPTION_KEY,
  },

  swagger: {
    title: env.SWAGGER_TITLE || 'CRM API',
    version: env.SWAGGER_VERSION || '1.0.0',
    description: env.SWAGGER_DESCRIPTION || 'CRM Backend API',
  },
};
