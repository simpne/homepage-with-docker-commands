import Docker from "dockerode";

import getDockerArguments from "utils/config/docker";
import { controllableDockerContainersFromConfig } from "utils/config/service-helpers";

export async function controlDockerContainer(server, name, action) {
  if (!["start", "stop", "unpause"].includes(action)) {
    return { statusCode: 400, error: "Invalid Docker control action" };
  }

  const dockerArgs = getDockerArguments(server);
  if (!dockerArgs) return { statusCode: 404, error: "Docker server not found" };
  if (dockerArgs.swarm) {
    return { statusCode: 400, error: "Docker container controls are not available for Swarm services" };
  }

  const controllableContainers = await controllableDockerContainersFromConfig(server);
  if (!controllableContainers.has(name)) {
    return { statusCode: 403, error: "Container controls are not enabled for Homepage" };
  }

  const docker = new Docker(dockerArgs.conn);
  const containers = await docker.listContainers({ all: true });
  if (!Array.isArray(containers)) throw new Error("Docker container query failed");

  const target = containers.find((container) =>
    container.Names?.some((containerName) => containerName.replace(/^\//, "") === name),
  );
  if (!target) return { statusCode: 404, error: "Container not found" };

  const container = docker.getContainer(target.Id);
  if (action === "start") {
    await container.start();
  } else if (action === "stop") {
    await container.stop();
  } else {
    await container.unpause();
  }

  return { statusCode: 200, result: { action } };
}
