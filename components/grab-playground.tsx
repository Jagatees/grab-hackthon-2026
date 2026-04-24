"use client";

import { FormEvent, useState } from "react";

type ProxyResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  targetUrl?: string;
  data?: unknown;
  error?: string;
};

type GrabPlaygroundProps = {
  defaultPath: string;
};

const PRESET_BODY = `{
  "sample": true
}`;

export function GrabPlayground({ defaultPath }: GrabPlaygroundProps) {
  const [path, setPath] = useState(defaultPath || "/");
  const [method, setMethod] = useState("GET");
  const [body, setBody] = useState(PRESET_BODY);
  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const parsedBody =
        method === "GET" ? undefined : body.trim() ? JSON.parse(body) : {};

      const result = await fetch("/api/grab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path,
          method,
          body: parsedBody
        })
      });

      const data = (await result.json()) as ProxyResponse;
      setResponse(data);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit the request.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="playground-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Server route tester</p>
          <h2>Send a request through `/api/grab`</h2>
        </div>
        <p className="hint">
          Enter a relative Grab path like <code>/v1/anything</code>. The browser
          only talks to this app, and the app adds the bearer token on the
          server.
        </p>
      </div>

      <form className="playground-form" onSubmit={handleSubmit}>
        <label>
          <span>Method</span>
          <select value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </label>

        <label>
          <span>Grab path</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/v1/your-endpoint"
            spellCheck={false}
          />
        </label>

        <label>
          <span>JSON body</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            spellCheck={false}
            disabled={method === "GET"}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send via backend"}
        </button>
      </form>

      <div className="response-panel">
        <div className="response-header">
          <h3>Response</h3>
          <span>{response?.status ? `HTTP ${response.status}` : "Waiting"}</span>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <pre>
          {JSON.stringify(
            response ?? {
              message:
                "Your response will appear here once the request finishes."
            },
            null,
            2
          )}
        </pre>
      </div>
    </section>
  );
}

