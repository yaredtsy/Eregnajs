import { useMemo } from "react";
import { StageProvider } from "./stage/StageContext";
import { StageSceneView } from "./stage/StageSceneView";
import { STAGE_SCENES, sceneById, type StageSceneId } from "./stage/stageScenes";

export function PlaygroundStage({
  sceneId,
  onSceneChange,
}: {
  sceneId: StageSceneId;
  onSceneChange: (id: StageSceneId) => void;
}) {
  const scene = useMemo(() => sceneById(sceneId), [sceneId]);

  return (
    <StageProvider>
      <div className="eregna-playground-stage">
        <nav className="eregna-playground-stage__nav" aria-label="Host components">
          <p className="eregna-playground-stage__nav-title">Host page</p>
          {STAGE_SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`eregna-playground-stage__nav-btn ${
                s.id === sceneId ? "eregna-playground-stage__nav-btn--active" : ""
              }`}
              onClick={() => onSceneChange(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="eregna-playground-stage__main">
          <header className="eregna-playground-stage__header">
            <div>
              <p className="eregna-playground-stage__keys">
                {scene.keys.map((k) => (
                  <code key={k}>{k}</code>
                ))}
              </p>
              <p className="eregna-playground-stage__exercise">{scene.exercise}</p>
              {scene.hint ? (
                <p className="eregna-playground-stage__hint">{scene.hint}</p>
              ) : null}
            </div>
          </header>

          <div className="eregna-playground-stage__canvas" key={sceneId}>
            <StageSceneView sceneId={sceneId} />
          </div>
        </div>
      </div>
    </StageProvider>
  );
}
