"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";

type RerankerSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  endpoint: string;
  updatedAt?: string;
};

type SettingsResponse = {
  reranker: RerankerSettings;
};

const EMPTY_SETTINGS: RerankerSettings = {
  enabled: false,
  baseUrl: "https://api.cohere.com/v2",
  apiKey: "",
  model: "rerank-v3.5",
  endpoint: "rerank",
};

function formatTime(value?: string) {
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

export function RagSettingsPanel() {
  const [settings, setSettings] = useState<RerankerSettings>(EMPTY_SETTINGS);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isPending, startTransition] = useTransition();

  async function loadSettings() {
    setErrorText("");
    const response = await fetch("/api/chat/settings", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("settings_load_failed");
    }

    const payload = (await response.json()) as SettingsResponse;
    setSettings(payload.reranker);
  }

  useEffect(() => {
    startTransition(() => {
      void loadSettings().catch(() => {
        setErrorText("Failed to load reranker settings");
      });
    });
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusText("");
    setErrorText("");

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/chat/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reranker: settings,
          }),
        });

        if (!response.ok) {
          throw new Error("settings_save_failed");
        }

        const payload = (await response.json()) as SettingsResponse;
        setSettings(payload.reranker);
        setStatusText("Reranker settings saved");
      })().catch(() => {
        setErrorText("Failed to save reranker settings");
      });
    });
  }

  return (
    <main className="trace-page">
      <header className="trace-hero">
        <div>
          <div className="trace-eyebrow">RAG Settings</div>
          <h1>Reranker Config</h1>
          <p>
            Configure the external rerank interface used by complex questions after
            hybrid recall.
          </p>
        </div>
        <div className="trace-hero-actions">
          <a className="trace-back-link" href="/debug/rag-traces">
            Back To Traces
          </a>
          <a className="trace-back-link" href="/">
            Back To Chat
          </a>
        </div>
      </header>

      <section className="settings-shell">
        <form className="settings-card" onSubmit={handleSubmit}>
          <div className="trace-panel-header">
            <h2>External Reranker</h2>
            <span>Updated: {formatTime(settings.updatedAt)}</span>
          </div>

          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            <span>Enable external reranker</span>
          </label>

          <div className="settings-grid">
            <label className="trace-filter-field">
              <span>Base URL</span>
              <input
                className="trace-filter-input"
                value={settings.baseUrl}
                placeholder="https://api.cohere.com/v2"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
              />
            </label>

            <label className="trace-filter-field">
              <span>Endpoint</span>
              <input
                className="trace-filter-input"
                value={settings.endpoint}
                placeholder="rerank"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    endpoint: event.target.value,
                  }))
                }
              />
            </label>

            <label className="trace-filter-field">
              <span>Model</span>
              <input
                className="trace-filter-input"
                value={settings.model}
                placeholder="rerank-v3.5"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
              />
            </label>

            <label className="trace-filter-field">
              <span>API Key</span>
              <input
                className="trace-filter-input"
                value={settings.apiKey}
                placeholder="Bearer token or provider key"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="settings-notes">
            <div>Simple questions: vector + keyword hybrid recall.</div>
            <div>Complex questions: hybrid recall, rerank only the top 8 candidates.</div>
            <div>Recommended provider: Cohere Rerank (`https://api.cohere.com/v2`, model `rerank-v3.5`).</div>
            <div>
              If the external reranker is unavailable, the backend currently falls back
              to local rerank scoring and marks the provider in trace logs.
            </div>
          </div>

          {statusText ? <div className="settings-status">{statusText}</div> : null}
          {errorText ? <div className="settings-error">{errorText}</div> : null}

          <div className="settings-actions">
            <button className="trace-refresh-button" type="submit">
              {isPending ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
