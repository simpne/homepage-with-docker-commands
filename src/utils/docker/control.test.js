import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, DockerCtor, getDockerArguments, controllableDockerContainersFromConfig } = vi.hoisted(() => {
  const state = { docker: null, dockerArgs: { conn: { socketPath: "/var/run/docker.sock" }, swarm: false } };

  function DockerCtor() {
    return state.docker;
  }

  return {
    state,
    DockerCtor,
    getDockerArguments: vi.fn(() => state.dockerArgs),
    controllableDockerContainersFromConfig: vi.fn(async () => new Set(["app"])),
  };
});

vi.mock("dockerode", () => ({ default: DockerCtor }));
vi.mock("utils/config/docker", () => ({ default: getDockerArguments }));
vi.mock("utils/config/service-helpers", () => ({ controllableDockerContainersFromConfig }));

import { controlDockerContainer } from "./control";

describe("utils/docker/control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.dockerArgs = { conn: { socketPath: "/var/run/docker.sock" }, swarm: false };
    const container = { start: vi.fn(), stop: vi.fn(), unpause: vi.fn() };
    state.docker = {
      listContainers: vi.fn(async () => [{ Id: "container-id", Names: ["/app"] }]),
      getContainer: vi.fn(() => container),
    };
    state.container = container;
    controllableDockerContainersFromConfig.mockResolvedValue(new Set(["app"]));
  });

  it.each([
    ["start", "start"],
    ["stop", "stop"],
    ["unpause", "unpause"],
  ])("runs Docker %s for the configured container", async (action, method) => {
    await controlDockerContainer("local", "app", action);

    expect(controllableDockerContainersFromConfig).toHaveBeenCalledWith("local");
    expect(state.docker.getContainer).toHaveBeenCalledWith("container-id");
    expect(state.container[method]).toHaveBeenCalled();
  });

  it("rejects containers not configured for Homepage", async () => {
    controllableDockerContainersFromConfig.mockResolvedValue(new Set());

    await expect(controlDockerContainer("local", "other", "start")).resolves.toEqual({
      statusCode: 403,
      error: "Container controls are not enabled for Homepage",
    });
    expect(state.docker.listContainers).not.toHaveBeenCalled();
  });

  it("does not expose control actions for Swarm services", async () => {
    state.dockerArgs.swarm = true;

    await expect(controlDockerContainer("local", "app", "stop")).resolves.toEqual({
      statusCode: 400,
      error: "Docker container controls are not available for Swarm services",
    });
    expect(state.docker.listContainers).not.toHaveBeenCalled();
  });

  it("reports when the configured container does not exist", async () => {
    state.docker.listContainers.mockResolvedValue([]);

    await expect(controlDockerContainer("local", "app", "start")).resolves.toEqual({
      statusCode: 404,
      error: "Container not found",
    });
  });

  it("rejects unsupported actions", async () => {
    await expect(controlDockerContainer("local", "app", "remove")).resolves.toEqual({
      statusCode: 400,
      error: "Invalid Docker control action",
    });
    expect(state.docker.listContainers).not.toHaveBeenCalled();
  });
});
