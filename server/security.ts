import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "pg";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Identity = { id: string; email?: string };
export type AuthedRequest = Request & { identity?: Identity };
export function bearer(req: Request) {
  const value = req.headers.authorization;
  if (!value || !/^Bearer [^\s]+$/.test(value))
    throw new ApiError(401, "Sign in to access your cloud workspace.");
  return value.slice(7);
}
export function requireAuth(
  client: Pick<SupabaseClient, "auth"> | null,
): RequestHandler {
  return async (req, res, next) => {
    try {
      if (!client)
        throw new ApiError(503, "Cloud authentication is not configured.");
      const token = bearer(req);
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user)
        throw new ApiError(401, "Your session expired. Please sign in again.");
      (req as AuthedRequest).identity = {
        id: data.user.id,
        email: data.user.email,
      };
      next();
    } catch (e) {
      next(e);
    }
  };
}
export function requireAdmin(pool: Pick<Pool, "query">): RequestHandler {
  return async (req, _res, next) => {
    try {
      const user = (req as AuthedRequest).identity;
      if (!user) throw new ApiError(401, "Sign in to continue.");
      const result = await pool.query(
        "select role from public.users where id=$1 and disabled=false",
        [user.id],
      );
      if (result.rows[0]?.role !== "admin")
        throw new ApiError(
          403,
          "This account does not have administrator access.",
        );
      next();
    } catch (e) {
      next(e);
    }
  };
}
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ApiError)
    return res.status(error.status).json({ message: error.message });
  if (
    error instanceof Error &&
    ("issues" in error || error.name === "MulterError")
  )
    return res
      .status(400)
      .json({ message: "The request or uploaded file is not valid." });
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return res
    .status(500)
    .json({
      message: "The server could not complete this request. Try again.",
    });
}
export const createServiceClient = () =>
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
