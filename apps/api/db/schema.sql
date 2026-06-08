CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT    PRIMARY KEY,
  agent_id        TEXT    NOT NULL,
  conversation_id TEXT,
  visitor_id      TEXT,
  page_url        TEXT,
  query           TEXT    NOT NULL,

  state_snapshot  TEXT    NOT NULL DEFAULT '{}',
  patch_log       TEXT    NOT NULL DEFAULT '[]',

  status          TEXT    NOT NULL
                  CHECK (status IN ('streaming','complete','aborted','error')),
  error_message   TEXT,

  started_at      INTEGER NOT NULL,
  completed_at    INTEGER
);

CREATE INDEX IF NOT EXISTS agent_runs_agent_id_started_at
  ON agent_runs(agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_status_started_at
  ON agent_runs(status, started_at DESC);
