"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type TraceRun = {
  traceId: string;
  question: string;
  status: string;
  routeType: string;
  complexity: string;
  retrievalPlan: string;
  vectorSearch: string;
  keywordSearch: string;
  fusionResult: string;
  rerankResult: string;
  llmRequest: string;
  llmResponse: string;
  finalResponse: string;
  timingInfo: string;
  error: string;
  createdAt: string;
  updatedAt: string;
};

type TraceEvent = {
  id: number;
  traceId: string;
  step: string;
  payload: string;
  createdAt: string;
};

type TraceListResponse = {
  runs: TraceRun[];
};

type TraceDetailResponse = {
  run: TraceRun;
  events: TraceEvent[];
};

function normalizeTraceField(input: string) {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '""' || trimmed === "null") {
    return "";
  }
  return trimmed;
}

function safePrettyJson(input: string) {
  const normalized = normalizeTraceField(input);
  if (!normalized) return "Not used in this route";

  try {
    return JSON.stringify(JSON.parse(normalized), null, 2);
  } catch {
    return normalized;
  }
}

function hasTraceField(input: string) {
  return Boolean(normalizeTraceField(input));
}

function formatTime(value: string) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getPreferredTraceId() {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get("traceId") || "";
}

function updateTraceUrl(traceId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (traceId) {
    url.searchParams.set("traceId", traceId);
  } else {
    url.searchParams.delete("traceId");
  }
  window.history.replaceState({}, "", url.toString());
}

export function RagTraceDebugger() {
  const [runs, setRuns] = useState<TraceRun[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const [detail, setDetail] = useState<TraceDetailResponse | null>(null);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [complexityFilter, setComplexityFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [selectedSectionLabel, setSelectedSectionLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  async function loadTraceDetail(traceId: string) {
    setDetailError("");
    const response = await fetch(`/api/chat/logs?traceId=${traceId}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("trace_detail_failed");
    }

    const payload = (await response.json()) as TraceDetailResponse;
    setDetail(payload);
  }

  async function loadRuns(preferredTraceId?: string) {
    setListError("");
    const response = await fetch("/api/chat/logs?limit=50", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("trace_list_failed");
    }

    const payload = (await response.json()) as TraceListResponse;
    setRuns(payload.runs);

    const initialTraceId =
      preferredTraceId || selectedTraceId || payload.runs[0]?.traceId || "";

    if (initialTraceId) {
      setSelectedTraceId(initialTraceId);
      updateTraceUrl(initialTraceId);
      await loadTraceDetail(initialTraceId);
    } else {
      setDetail(null);
    }
  }

  useEffect(() => {
    startTransition(() => {
      void loadRuns(getPreferredTraceId()).catch(() => {
        setListError("Failed to load trace list");
      });
    });
  }, []);

  const filteredRuns = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return runs.filter((run) => {
      const statusOk = statusFilter === "all" || run.status === statusFilter;
      const complexityOk =
        complexityFilter === "all" || run.complexity === complexityFilter;
      const routeOk = routeFilter === "all" || run.routeType === routeFilter;
      const keywordOk =
        !normalizedKeyword ||
        [
          run.question,
          run.traceId,
          run.routeType,
          run.status,
          run.complexity,
          run.finalResponse,
          run.error,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);

      return statusOk && complexityOk && routeOk && keywordOk;
    });
  }, [runs, statusFilter, complexityFilter, routeFilter, keyword]);

  function handleRefresh() {
    startTransition(() => {
      void loadRuns(selectedTraceId).catch(() => {
        setListError("Failed to refresh trace list");
      });
    });
  }

  function handleSelectTrace(traceId: string) {
    setSelectedTraceId(traceId);
    updateTraceUrl(traceId);
    startTransition(() => {
      void loadTraceDetail(traceId).catch(() => {
        setDetailError("Failed to load trace detail");
      });
    });
  }

  const sections = detail
    ? [
        { label: "Timing", value: detail.run.timingInfo },
        { label: "Retrieval Plan", value: detail.run.retrievalPlan },
        { label: "Vector Search", value: detail.run.vectorSearch },
        { label: "Keyword Search", value: detail.run.keywordSearch },
        { label: "Score Fusion", value: detail.run.fusionResult },
        { label: "Rerank", value: detail.run.rerankResult },
        { label: "LLM Prompt", value: detail.run.llmRequest },
        { label: "LLM Response", value: detail.run.llmResponse },
        { label: "Final Response", value: detail.run.finalResponse },
        { label: "Error", value: detail.run.error },
      ].filter((section) => hasTraceField(section.value))
    : [];

  useEffect(() => {
    if (!sections.length) {
      setSelectedSectionLabel("");
      return;
    }

    if (!selectedSectionLabel || !sections.some((section) => section.label === selectedSectionLabel)) {
      setSelectedSectionLabel(sections[0].label);
    }
  }, [detail?.run.traceId, sections.length]);

  const isDomainRule = detail?.run.routeType === "domain_rule";
  const selectedSection =
    sections.find((section) => section.label === selectedSectionLabel) || sections[0];

  return (
    <main className="trace-page">
      <header className="trace-hero">
        <div>
          <div className="trace-eyebrow">RAG Debug Console</div>
          <h1>Full Trace Inspector</h1>
          <p>
            Inspect each request end to end: input, recall, score fusion, rerank,
            prompt, model output, and final payload.
          </p>
        </div>
        <div className="trace-hero-actions">
          <a className="trace-back-link" href="/debug/rag-settings">
            Reranker Settings
          </a>
          <button type="button" className="trace-refresh-button" onClick={handleRefresh}>
            {isPending ? "Refreshing..." : "Refresh"}
          </button>
          <a className="trace-back-link" href="/">
            Back To Chat
          </a>
        </div>
      </header>

      <section className="trace-layout">
        <aside className="trace-sidebar">
          <div className="trace-panel-header">
            <h2>Recent Runs</h2>
            <span>{filteredRuns.length} shown</span>
          </div>

          <section className="trace-filters">
            <input
              className="trace-filter-input"
              placeholder="Search question / traceId / response"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <div className="trace-filter-grid">
              <label className="trace-filter-field">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="completed">completed</option>
                  <option value="running">running</option>
                  <option value="failed">failed</option>
                </select>
              </label>
              <label className="trace-filter-field">
                <span>Complexity</span>
                <select
                  value={complexityFilter}
                  onChange={(event) => setComplexityFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="simple">simple</option>
                  <option value="complex">complex</option>
                </select>
              </label>
              <label className="trace-filter-field">
                <span>Route</span>
                <select
                  value={routeFilter}
                  onChange={(event) => setRouteFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="retrieval_pipeline">retrieval_pipeline</option>
                  <option value="domain_rule">domain_rule</option>
                </select>
              </label>
            </div>
          </section>

          {listError ? <div className="trace-empty">{listError}</div> : null}

          <div className="trace-run-list">
            {filteredRuns.map((run) => (
              <button
                key={run.traceId}
                type="button"
                className={`trace-run-card ${
                  selectedTraceId === run.traceId ? "trace-run-card-active" : ""
                }`}
                onClick={() => handleSelectTrace(run.traceId)}
              >
                <div className="trace-run-topline">
                  <span className={`trace-status trace-status-${run.status}`}>{run.status}</span>
                  <span className="trace-run-time">{formatTime(run.createdAt)}</span>
                </div>
                <div className="trace-run-question">{run.question}</div>
                <div className="trace-run-meta">
                  <span>{run.routeType || "unknown_route"}</span>
                  <span>{run.complexity || "-"}</span>
                </div>
                <div className="trace-run-id">{run.traceId}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="trace-main">
          {!detail && !detailError ? (
            <div className="trace-empty">Select a trace to inspect details</div>
          ) : null}
          {detailError ? <div className="trace-empty">{detailError}</div> : null}

          {detail ? (
            <>
              <section className="trace-summary-grid">
                <article className="trace-summary-card">
                  <div className="trace-summary-label">Question</div>
                  <div className="trace-summary-value">{detail.run.question}</div>
                </article>
                <article className="trace-summary-card">
                  <div className="trace-summary-label">Trace ID</div>
                  <div className="trace-summary-mono">{detail.run.traceId}</div>
                </article>
                <article className="trace-summary-card">
                  <div className="trace-summary-label">Route</div>
                  <div className="trace-summary-value">
                    {detail.run.routeType || "-"} / {detail.run.complexity || "-"}
                  </div>
                </article>
                <article className="trace-summary-card">
                  <div className="trace-summary-label">Updated At</div>
                  <div className="trace-summary-value">{formatTime(detail.run.updatedAt)}</div>
                </article>
              </section>

              {isDomainRule ? (
                <section className="trace-detail-card">
                  <div className="trace-panel-header">
                    <h3>Route Note</h3>
                  </div>
                  <div className="trace-route-note">
                    This request used the `domain_rule` fast path. Retrieval, score
                    fusion, rerank, and generic LLM generation were skipped, so those
                    sections are intentionally hidden.
                  </div>
                </section>
              ) : null}

              {sections.length > 0 ? (
                <section className="trace-detail-card">
                  <div className="trace-panel-header">
                    <h3>Section Switch</h3>
                  </div>
                  <div className="trace-tab-row">
                    {sections.map((section) => (
                      <button
                        key={section.label}
                        type="button"
                        className={`trace-tab-button ${
                          selectedSection?.label === section.label ? "trace-tab-button-active" : ""
                        }`}
                        onClick={() => setSelectedSectionLabel(section.label)}
                      >
                        {section.label}
                        {section.label === "Timing"
                          ? ""
                          : (() => {
                              try {
                                const parsed = JSON.parse(detail.run.timingInfo || "{}") as Record<string, number>;
                                const keyMap: Record<string, string> = {
                                  "Retrieval Plan": "total_ms",
                                  "Vector Search": "vector_search_ms",
                                  "Keyword Search": "keyword_search_ms",
                                  "Score Fusion": "fusion_ms",
                                  "Rerank": "rerank_ms",
                                  "LLM Prompt": "llm_ms",
                                  "LLM Response": "llm_ms",
                                  "Final Response": "total_ms",
                                };
                                const timingValue = parsed[keyMap[section.label]];
                                return typeof timingValue === "number" ? ` · ${timingValue}ms` : "";
                              } catch {
                                return "";
                              }
                            })()}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="trace-detail-stack">
                {selectedSection ? (
                  <article key={selectedSection.label} className="trace-detail-card">
                    <div className="trace-panel-header">
                      <h3>{selectedSection.label}</h3>
                    </div>
                    <pre className="trace-code-block">{safePrettyJson(selectedSection.value)}</pre>
                  </article>
                ) : null}
              </section>

              <section className="trace-detail-card">
                <div className="trace-panel-header">
                  <h3>Event Timeline</h3>
                  <span>{detail.events.length} steps</span>
                </div>
                <div className="trace-event-list">
                  {detail.events.map((event) => (
                    <details key={event.id} className="trace-event-card">
                      <summary>
                        <span className="trace-event-step">{event.step}</span>
                        <span className="trace-event-time">{formatTime(event.createdAt)}</span>
                      </summary>
                      <pre className="trace-code-block">{safePrettyJson(event.payload)}</pre>
                    </details>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
