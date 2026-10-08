import { beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { controlDockerContainer, getServerSession, isAuthEnabled, logger } = vi.hoisted(() => ({
  controlDockerContainer: vi.fn(),
  getServerSession: vi.fn(),
  isAuthEnabled: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("utils/docker/control", () => ({ controlDockerContainer }));
vi.mock("utils/env", () => ({ isAuthEnabled }));
vi.mock("next-auth/next", () => ({ getServerSession }));
vi.mock("pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("utils/logger", () => ({ default: () => logger }));

import handler from "pages/api/docker/control";

describe("pages/api/docker/control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabled.mockReturnValue(false);
    controlDockerContainer.mockResolvedValue({ statusCode: 200, result: { action: "start" } });
  });

  it("accepts only POST requests", async () => {
    const res = createMockRes();

    await handler({ method: "GET" }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
    expect(controlDockerContainer).not.toHaveBeenCalled();
  });

  it("validates the container control request", async () => {
    const res = createMockRes();

    await handler({ method: "POST", body: { container: "app", action: "delete" } }, res);

    expect(res.statusCode).toBe(400);
    expect(controlDockerContainer).not.toHaveBeenCalled();
  });

  it("requires a Homepage session when authentication is enabled", async () => {
    isAuthEnabled.mockReturnValue(true);
    getServerSession.mockResolvedValue(null);
    const res = createMockRes();

    await handler({ method: "POST", body: { container: "app", action: "start" } }, res);

    expect(res.statusCode).toBe(401);
    expect(controlDockerContainer).not.toHaveBeenCalled();
  });

  it("starts the requested container and returns the result", async () => {
    const res = createMockRes();

    await handler({ method: "POST", body: { server: "local", container: "app", action: "start" } }, res);

    expect(controlDockerContainer).toHaveBeenCalledWith("local", "app", "start");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ action: "start" });
  });

  it("returns control errors with their status code", async () => {
    controlDockerContainer.mockResolvedValue({
      statusCode: 403,
      error: "Container controls are not enabled for Homepage",
    });
    const res = createMockRes();

    await handler({ method: "POST", body: { container: "other", action: "stop" } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.message).toBe("Container controls are not enabled for Homepage");
  });

  it("logs and surfaces Docker API failures", async () => {
    controlDockerContainer.mockRejectedValue(new Error("Docker unavailable"));
    const res = createMockRes();

    await handler({ method: "POST", body: { container: "app", action: "start" } }, res);

    expect(logger.error).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe("Docker unavailable");
  });
});
