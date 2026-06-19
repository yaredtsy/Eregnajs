import { getState } from "../../embed/hostState.js";
import { getKnowledgeEntries } from "../../embed/hostKnowledge.js";
import { listTools } from "../../embed/hostTools.js";
import { listClientTools } from "../../chat/tools/registry.js";
import {
  clearDebugEvents,
  setEventTailPaused,
  useEventTail,
} from "../../chat/debug/eventTail.js";

interface InspectorTool {
  key: string;
  name: string;
  description: string;
  runsIn: "client" | "server" | "legacy";
  parameters?: Record<string, unknown>;
  icon?: string;
  label?: string;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function collectTools(): InspectorTool[] {
  const client = listClientTools().map((tool) => ({
    key: `client:${tool.name}`,
    name: tool.name,
    description: tool.description,
    runsIn: "client" as const,
    parameters: tool.parameters,
    icon: tool.display?.icon,
    label: tool.display?.label,
  }));

  const clientNames = new Set(client.map((t) => t.name));
  const legacy = listTools()
    .filter((tool) => !clientNames.has(tool.name))
    .map((tool) => ({
      key: `legacy:${tool.name}`,
      name: tool.name,
      description: tool.description,
      runsIn: "legacy" as const,
      parameters: tool.parameters,
    }));

  return [...client, ...legacy];
}

function ParametersPreview({ schema }: { schema?: Record<string, unknown> }) {
  if (!schema) return <span className="eregna-inspector__muted">—</span>;

  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props || Object.keys(props).length === 0) {
    return <pre className="eregna-inspector__code">{JSON.stringify(schema, null, 2)}</pre>;
  }

  return (
    <ul className="eregna-inspector__param-list">
      {Object.entries(props).map(([name, field]) => (
        <li key={name}>
          <code>{name}</code>
          {field.type ? <span className="eregna-inspector__muted"> {String(field.type)}</span> : null}
          {field.description ? (
            <span className="eregna-inspector__param-desc"> — {String(field.description)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Inspector() {
  const { entries, paused } = useEventTail();
  const tools = collectTools();
  const hostState = getState();
  const knowledge = getKnowledgeEntries();

  let stateJson = "{}";
  if (Object.keys(hostState).length > 0) {
    try {
      stateJson = JSON.stringify(hostState, null, 2);
    } catch {
      stateJson = String(hostState);
    }
  }

  return (
    <div className="eregna-inspector">
      <section className="eregna-inspector__section">
        <h3 className="eregna-inspector__heading">
          Registered tools ({tools.length})
        </h3>
        {tools.length === 0 ? (
          <p className="eregna-inspector__empty">No tools registered</p>
        ) : (
          <ul className="eregna-inspector__tool-list">
            {tools.map((tool) => (
              <li key={tool.key} className="eregna-inspector__tool">
                <div className="eregna-inspector__tool-head">
                  {tool.icon ? <span aria-hidden>{tool.icon} </span> : null}
                  <strong>{tool.label ?? tool.name}</strong>
                  <span className="eregna-inspector__badge">runsIn={tool.runsIn}</span>
                </div>
                <p className="eregna-inspector__tool-desc">{tool.description}</p>
                <ParametersPreview schema={tool.parameters} />
                {tool.runsIn === "client" && (
                  <p className="eregna-inspector__muted">handler: [page-provided]</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="eregna-inspector__section">
        <h3 className="eregna-inspector__heading">State (injected by page)</h3>
        <pre className="eregna-inspector__code">{stateJson}</pre>
      </section>

      <section className="eregna-inspector__section">
        <h3 className="eregna-inspector__heading">
          Knowledge ({knowledge.length} entries)
        </h3>
        {knowledge.length === 0 ? (
          <p className="eregna-inspector__empty">No knowledge entries</p>
        ) : (
          <ul className="eregna-inspector__knowledge-list">
            {knowledge.map((entry, i) => (
              <li key={`${entry.title}-${i}`}>
                <strong>{entry.title}</strong>
                <p>{entry.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="eregna-inspector__section">
        <div className="eregna-inspector__events-head">
          <h3 className="eregna-inspector__heading">Recent events</h3>
          <div className="eregna-inspector__events-actions">
            <button
              type="button"
              className="eregna-inspector__btn"
              onClick={() => setEventTailPaused(!paused)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="eregna-inspector__btn"
              onClick={() => clearDebugEvents()}
            >
              Clear
            </button>
          </div>
        </div>
        {entries.length === 0 ? (
          <p className="eregna-inspector__empty">No events yet</p>
        ) : (
          <ol className="eregna-inspector__event-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <span className="eregna-inspector__event-time">{formatSeconds(entry.atMs)}</span>
                <span className="eregna-inspector__event-label">{entry.label}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
