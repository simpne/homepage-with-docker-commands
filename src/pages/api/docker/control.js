import { getServerSession } from "next-auth/next";

import { authOptions } from "pages/api/auth/[...nextauth]";
import { controlDockerContainer } from "utils/docker/control";
import { isAuthEnabled } from "utils/env";
import createLogger from "utils/logger";

const logger = createLogger("dockerControl");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    if (isAuthEnabled() && !(await getServerSession(req, res, authOptions))) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const { server, container, action } = req.body ?? {};
    if (
      (server !== undefined && typeof server !== "string") ||
      typeof container !== "string" ||
      !container.trim() ||
      !["start", "stop", "unpause"].includes(action)
    ) {
      return res.status(400).json({ error: { message: "Invalid Docker control request" } });
    }

    const result = await controlDockerContainer(server, container, action);
    if (result.error) {
      return res.status(result.statusCode).json({ error: { message: result.error } });
    }

    return res.status(200).json(result.result);
  } catch (e) {
    logger.error(e);
    return res.status(500).json({ error: { message: e?.message ?? "Unknown error" } });
  }
}
