import { useTranslation } from "next-i18next/pages";
import { useState } from "react";
import useSWR from "swr";

import Block from "components/services/widget/block";
import Container from "components/services/widget/container";

export default function Component({ service }) {
  const { t } = useTranslation();
  const [controlError, setControlError] = useState(null);
  const [controlPending, setControlPending] = useState(false);

  const { widget } = service;
  const server = encodeURIComponent(widget.server || "");

  const {
    data: statusResponse,
    error: statusError,
    mutate: mutateStatuses,
  } = useSWR(`/api/docker/statuses?server=${server}`);
  const { statuses } = statusResponse ?? {};
  const statusData = statuses ? (statuses[widget.container] ?? { status: "not found" }) : undefined;

  const { data: statsResponse, error: statsError, mutate: mutateStats } = useSWR(`/api/docker/stats?server=${server}`);
  const { stats } = statsResponse ?? {};
  const statsData = stats?.[widget.container];

  if (statsError || statsResponse?.error || statsData?.error || statusError || statusResponse?.error) {
    const finalError = statsError ?? statsResponse?.error ?? statsData?.error ?? statusError ?? statusResponse?.error;
    return <Container service={service} error={finalError} />;
  }

  const isRunning =
    statusData?.status.includes("running") ||
    statusData?.status.includes("partial") ||
    statusData?.status === "restarting";
  const action = statusData?.status === "paused" ? "unpause" : isRunning ? "stop" : "start";
  const controls = widget.controls &&
    statusData &&
    statusData.status !== "not found" &&
    statusData.controlSupported !== false && (
      <div className="m-1 flex flex-col justify-center">
        <button
          type="button"
          className="rounded bg-theme-200/50 px-3 py-2 text-sm font-semibold hover:bg-theme-300/60 disabled:cursor-wait disabled:opacity-50 dark:bg-theme-900/40 dark:hover:bg-theme-800/60"
          disabled={controlPending}
          onClick={async () => {
            setControlPending(true);
            setControlError(null);
            try {
              const response = await fetch("/api/docker/control", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ server: widget.server, container: widget.container, action }),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result?.error?.message ?? t("docker.control_error"));
              await Promise.all([mutateStatuses(), mutateStats()]);
            } catch (error) {
              setControlError(error?.message ?? t("docker.control_error"));
            } finally {
              setControlPending(false);
            }
          }}
        >
          {t(`docker.${action}`)}
        </button>
        {controlError && (
          <p className="mt-1 text-center text-xs text-red-600 dark:text-red-400" role="alert">
            {controlError}
          </p>
        )}
      </div>
    );

  if (statusData && !(statusData.status.includes("running") || statusData.status.includes("partial"))) {
    return (
      <>
        <Container service={service}>
          <Block label={t("widget.status")} value={t("docker.offline")} />
        </Container>
        {controls}
      </>
    );
  }

  // running, but reporting no stats: a swarm service whose container is on another node
  if (statusData && stats && !statsData) {
    return <Container service={service} error="not found" />;
  }

  if (!statsData || !statusData) {
    return (
      <>
        <Container service={service}>
          <Block label="docker.cpu" />
          <Block label="docker.mem" />
          <Block label="docker.rx" />
          <Block label="docker.tx" />
        </Container>
        {controls}
      </>
    );
  }

  const { cpu, mem, rx, tx } = statsData;

  return (
    <>
      <Container service={service}>
        <Block label="docker.cpu" value={t("common.percent", { value: cpu })} highlightValue={cpu} />
        {mem !== undefined && (
          <Block label="docker.mem" value={t("common.bytes", { value: mem })} highlightValue={mem} />
        )}
        {rx !== undefined && (
          <>
            <Block label="docker.rx" value={t("common.bytes", { value: rx })} highlightValue={rx} />
            <Block label="docker.tx" value={t("common.bytes", { value: tx })} highlightValue={tx} />
          </>
        )}
      </Container>
      {controls}
    </>
  );
}
