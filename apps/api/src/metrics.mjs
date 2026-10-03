export function createRuntimeMetrics({
  startedAt = Date.now()
} = {}) {
  let requestsTotal = 0;
  let activeRequests = 0;
  let responses2xx = 0;
  let responses4xx = 0;
  let responses5xx = 0;

  const beginRequest = () => {
    requestsTotal += 1;
    activeRequests += 1;
    let finished = false;

    return (statusCode) => {
      if (finished) return;
      finished = true;
      activeRequests = Math.max(
        0,
        activeRequests - 1
      );

      if (
        statusCode >= 200 &&
        statusCode < 300
      ) {
        responses2xx += 1;
      } else if (
        statusCode >= 400 &&
        statusCode < 500
      ) {
        responses4xx += 1;
      } else if (statusCode >= 500) {
        responses5xx += 1;
      }
    };
  };

  const snapshot = () => {
    const memory = process.memoryUsage();

    return {
      requestsTotal,
      activeRequests,
      responses2xx,
      responses4xx,
      responses5xx,
      uptimeSeconds:
        Math.max(
          0,
          (Date.now() - startedAt) / 1000
        ),
      memoryRssBytes: memory.rss,
      memoryHeapUsedBytes: memory.heapUsed
    };
  };

  const renderPrometheus = () => {
    const value = snapshot();

    return [
      "# HELP puente_deca_requests_total Total HTTP requests handled by this process.",
      "# TYPE puente_deca_requests_total counter",
      `puente_deca_requests_total ${value.requestsTotal}`,
      "# HELP puente_deca_active_requests Current in-flight HTTP requests.",
      "# TYPE puente_deca_active_requests gauge",
      `puente_deca_active_requests ${value.activeRequests}`,
      "# HELP puente_deca_responses_2xx_total Total successful HTTP responses.",
      "# TYPE puente_deca_responses_2xx_total counter",
      `puente_deca_responses_2xx_total ${value.responses2xx}`,
      "# HELP puente_deca_responses_4xx_total Total client-error HTTP responses.",
      "# TYPE puente_deca_responses_4xx_total counter",
      `puente_deca_responses_4xx_total ${value.responses4xx}`,
      "# HELP puente_deca_responses_5xx_total Total server-error HTTP responses.",
      "# TYPE puente_deca_responses_5xx_total counter",
      `puente_deca_responses_5xx_total ${value.responses5xx}`,
      "# HELP puente_deca_uptime_seconds Process uptime in seconds.",
      "# TYPE puente_deca_uptime_seconds gauge",
      `puente_deca_uptime_seconds ${value.uptimeSeconds.toFixed(3)}`,
      "# HELP puente_deca_memory_rss_bytes Resident set memory in bytes.",
      "# TYPE puente_deca_memory_rss_bytes gauge",
      `puente_deca_memory_rss_bytes ${value.memoryRssBytes}`,
      "# HELP puente_deca_memory_heap_used_bytes V8 heap used in bytes.",
      "# TYPE puente_deca_memory_heap_used_bytes gauge",
      `puente_deca_memory_heap_used_bytes ${value.memoryHeapUsedBytes}`,
      ""
    ].join("\n");
  };

  return {
    beginRequest,
    snapshot,
    renderPrometheus
  };
}
