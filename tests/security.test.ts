import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requireAuth, requireAdmin, errorHandler } from "../server/security";
function appFor(user: unknown, role = "user") {
  const app = express();
  const auth = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({
          data: { user },
          error: user ? null : new Error("Invalid signature"),
        }),
    },
  };
  const pool = { query: vi.fn().mockResolvedValue({ rows: [{ role }] }) };
  app.get("/private", requireAuth(auth as never), (_req, res) =>
    res.json({ ok: true }),
  );
  app.get(
    "/admin",
    requireAuth(auth as never),
    requireAdmin(pool as never),
    (_req, res) => res.json({ ok: true }),
  );
  app.use(errorHandler);
  return { app, auth, pool };
}
describe("Server authorization", () => {
  it("blocks an absent bearer token before calling auth", async () => {
    const { app, auth } = appFor({ id: "test" });
    expect((await request(app).get("/private")).status).toBe(401);
    expect(auth.auth.getUser).not.toHaveBeenCalled();
  });
  it("blocks an invalid signed token", async () => {
    const { app } = appFor(null);
    expect(
      (
        await request(app)
          .get("/private")
          .set("Authorization", "Bearer not-a-valid-token")
      ).status,
    ).toBe(401);
  });
  it("uses the verified server identity", async () => {
    const { app, auth } = appFor({ id: "verified-id" });
    expect(
      (
        await request(app)
          .get("/private")
          .set("Authorization", "Bearer test-token")
      ).status,
    ).toBe(200);
    expect(auth.auth.getUser).toHaveBeenCalledWith("test-token");
  });
  it("rejects normal accounts from admin routes", async () => {
    const { app } = appFor({ id: "verified-id" });
    expect(
      (
        await request(app)
          .get("/admin")
          .set("Authorization", "Bearer test-token")
      ).status,
    ).toBe(403);
  });
  it("allows admin only after database role verification", async () => {
    const { app, pool } = appFor({ id: "verified-id" }, "admin");
    expect(
      (
        await request(app)
          .get("/admin")
          .set("Authorization", "Bearer test-token")
      ).status,
    ).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("disabled=false"),
      ["verified-id"],
    );
  });
  it("does not expose raw backend errors", async () => {
    const app = express();
    app.get("/error", () => {
      throw new Error("secret database password");
    });
    app.use(errorHandler);
    const result = await request(app).get("/error");
    expect(result.status).toBe(500);
    expect(result.text).not.toContain("secret");
  });
});
