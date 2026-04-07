"use client";

import { FormEvent, useState } from "react";
import { saveSceneIntent, sendChatMessage } from "../lib/api";
import { Message } from "../lib/types";

const starterQuestions = [
  "这个订单能申请退货吗？",
  "发票能补开吗？",
  "为什么物流一直没更新？",
];

const initialMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "我是电商客服 RAG 助手。现在会基于本地知识库检索相关片段，再生成回答和引用。",
};

function buildTraceHref(traceId: string) {
  return `/debug/rag-traces?traceId=${encodeURIComponent(traceId)}`;
}

export function ChatShell() {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savedSceneTraceIds, setSavedSceneTraceIds] = useState<string[]>([]);

  async function submitMessage(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const reply = await sendChatMessage(trimmed);
      setMessages((current) => [...current, reply]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: "当前知识库服务暂时不可用，请稍后再试。",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage(input);
  }

  async function handleSaveScene(traceId: string) {
    if (!traceId || savedSceneTraceIds.includes(traceId)) {
      return;
    }

    try {
      await saveSceneIntent(traceId);
      setSavedSceneTraceIds((current) => [...current, traceId]);
    } catch {
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-title">电商客服 RAG</span>
          <span className="brand-tag">售前售后问答</span>
        </div>
        <div className="topbar-actions">
          <a className="topbar-link" href="/debug/rag-settings">
            Reranker Settings
          </a>
          <a className="topbar-link" href="/debug/rag-traces">
            Trace Debugger
          </a>
          <div className="status-chip">Live Retrieval</div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-icon" aria-hidden="true">
          [ ]
        </div>
        <h1>电商客服对话助手</h1>
        <p>基于客服知识库的智能问答原型</p>
      </section>

      <section className="starter-strip" aria-label="示例问题">
        {starterQuestions.map((question) => (
          <button
            key={question}
            className="starter-chip"
            type="button"
            onClick={() => void submitMessage(question)}
            disabled={isLoading}
          >
            {question}
          </button>
        ))}
      </section>

      <section className="chat-panel">
        <div className="message-list">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message-card message-card-${message.role}`}
            >
              <div className="message-header">
                <div className="message-meta">
                  {message.role === "assistant" ? "RAG 助手" : "你"}
                </div>
                {message.role === "assistant" && message.traceId ? (
                  <div className="message-actions">
                    <button
                      type="button"
                      className="trace-action-button"
                      onClick={() => void handleSaveScene(message.traceId!)}
                      disabled={savedSceneTraceIds.includes(message.traceId)}
                    >
                      {savedSceneTraceIds.includes(message.traceId) ? "Saved Scene" : "Save Scene"}
                    </button>
                    <a
                      className="trace-inline-link"
                      href={buildTraceHref(message.traceId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Trace
                    </a>
                  </div>
                ) : null}
              </div>
              <div className="message-content">{message.content}</div>

              {message.sources && message.sources.length > 0 ? (
                <div className="source-grid">
                  {message.sources.map((source) => (
                    <section key={source.id} className="source-card">
                      <div className="source-title">{source.title}</div>
                      <div className="source-section">{source.section}</div>
                      <p>{source.excerpt}</p>
                    </section>
                  ))}
                </div>
              ) : null}
            </article>
          ))}

          {isLoading ? (
            <article className="message-card message-card-assistant">
              <div className="message-header">
                <div className="message-meta">RAG 助手</div>
              </div>
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </article>
          ) : null}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer-frame">
            <textarea
              className="composer-input"
              placeholder="输入你的问题..."
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitMessage(input);
                }
              }}
            />
            <button className="send-button" type="submit" disabled={isLoading}>
              发送
            </button>
          </div>
          <div className="composer-hint">按 Enter 发送，Shift + Enter 换行</div>
        </form>
      </section>
    </main>
  );
}
