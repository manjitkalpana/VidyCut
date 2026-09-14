import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const cloudConfigured = Boolean(url && anon);
export const supabase = cloudConfigured
  ? createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export const apiConfigured = Boolean(import.meta.env.VITE_API_URL);
export async function api(path: string, options: RequestInit = {}) {
  if (!apiConfigured)
    throw new Error(
      "Cloud services are not configured for this installation. Local editing remains available.",
    );
  const session = (await supabase?.auth.getSession())?.data.session;
  const headers = new Headers(options.headers);
  if (session) headers.set("Authorization", "Bearer " + session.access_token);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(import.meta.env.VITE_API_URL + path, {
    ...options,
    headers,
  });
  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error("The server could not complete this request.");
  }
  if (!response.ok)
    throw new Error(json.message || "The request could not be completed.");
  return json;
}
