const env = process.env;

export const config = {
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 4000),
  webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
  sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 8),
  sessionCookie: 'uemp_session',
};

/** Academic rules that the brief leaves to the implementer. */
export const rules = {
  maxUnitsPerSemester: 24,
  caMax: 40,
  examMax: 60,
};
