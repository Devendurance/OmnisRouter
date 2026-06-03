function envFlag(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === null) return defaultValue;

  const trimmed = String(value).trim().toLowerCase();
  if (trimmed === "true" || trimmed === "1") return true;
  if (trimmed === "false" || trimmed === "0") return false;

  return defaultValue;
}

export const isDevelopment = process.env.NODE_ENV === "development";
export const isProduction = process.env.NODE_ENV === "production";

export const serverFundedExecutionEnabled = envFlag("ENABLE_SERVER_FUNDED_EXECUTION", isDevelopment);
export const cctpExecutionApiEnabled = envFlag("ENABLE_CCTP_EXECUTION_API", true);

export function appEnv(): "production" | "development" {
  const value = process.env.NEXT_PUBLIC_APP_ENV;
  if (value === "production") return "production";
  if (value === "development") return "development";
  return isDevelopment ? "development" : "production";
}

export function showDemoRoutes(): boolean {
  return envFlag("NEXT_PUBLIC_SHOW_DEMO_ROUTES", isDevelopment);
}

export function showCctpLab(): boolean {
  return envFlag("NEXT_PUBLIC_SHOW_CCTP_LAB", isDevelopment);
}

export function showDebugPanels(): boolean {
  return envFlag("NEXT_PUBLIC_SHOW_DEBUG_PANELS", isDevelopment);
}

export function showServerFundedRoutes(): boolean {
  return serverFundedExecutionEnabled;
}
