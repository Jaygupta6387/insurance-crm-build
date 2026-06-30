/** Undefined env values can make Node's spawn throw EINVAL on Windows. */
export const sanitizeProcessEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== null) clean[key] = String(value);
  }
  return clean;
};
