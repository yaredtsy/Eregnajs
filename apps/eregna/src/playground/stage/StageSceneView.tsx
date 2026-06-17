import { useEffect } from "react";
import type { StageSceneId } from "./stageScenes";
import { useStage } from "./StageContext";

function SceneShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="eregna-pg-scene">
      <p className="eregna-pg-scene__eyebrow">Host component</p>
      <h3 className="eregna-pg-scene__title">{title}</h3>
      <div className="eregna-pg-scene__body">{children}</div>
    </div>
  );
}

function HeroScene() {
  return (
    <SceneShell title="Hero section">
      <section id="pg-hero" className="eregna-pg-card">
        <h4 className="text-base font-semibold text-white">Acme Dashboard</h4>
        <p className="mt-2 text-sm text-slate-400">
          Control scene — baseline scroll and highlight behavior.
        </p>
      </section>
    </SceneShell>
  );
}

function OrdersScene() {
  const { orders, selectedOrder, setSelectedOrder } = useStage();
  return (
    <SceneShell title="Orders table + export">
      <table id="pg-orders-table" className="eregna-pg-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              className={selectedOrder === o.id ? "eregna-pg-table__row--active" : ""}
              onClick={() => setSelectedOrder(o.id)}
            >
              <td>{o.id}</td>
              <td>${o.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        id="pg-export-btn"
        type="button"
        disabled={!selectedOrder}
        className="eregna-pg-btn eregna-pg-btn--primary mt-4"
      >
        Export selected
      </button>
      <p className="mt-3 text-xs text-slate-500">
        {selectedOrder ? `Selected: ${selectedOrder}` : "Click a row to enable export"}
      </p>
    </SceneShell>
  );
}

function DetailsScene() {
  return (
    <SceneShell title="Long-scroll target">
      <p className="text-sm text-slate-400 mb-4">
        The target block is placed below a tall spacer (~3 viewports).
      </p>
      <div className="eregna-pg-spacer" aria-hidden />
      <section id="pg-details" className="eregna-pg-card">
        <h4 className="font-medium text-white">Details section</h4>
        <p className="mt-1 text-sm text-slate-400">Scroll target for the walkthrough engine.</p>
      </section>
    </SceneShell>
  );
}

function TabsScene() {
  const { tab, setTab } = useStage();
  return (
    <SceneShell title="Tab panel B">
      <div className="flex gap-1 border-b border-slate-700 pb-1">
        {(["a", "b", "c"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`eregna-pg-tab ${tab === t ? "eregna-pg-tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            Tab {t.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="eregna-pg-card mt-4 min-h-[100px]">
        {tab === "a" && <p className="text-slate-400 text-sm">Tab A (default)</p>}
        {tab === "b" && (
          <div id="pg-tab-b">
            <p className="text-white text-sm">Tab B — target panel for the agent</p>
          </div>
        )}
        {tab === "c" && <p className="text-slate-400 text-sm">Tab C</p>}
      </div>
    </SceneShell>
  );
}

function DialogScene() {
  const { dialogOpen, setDialogOpen } = useStage();
  return (
    <SceneShell title="Pricing dialog">
      <p className="text-sm text-slate-400 mb-4">
        The upgrade CTA only mounts after <code className="text-slate-300">openPricingDialog</code>{" "}
        runs, or when you open it below.
      </p>
      <button
        type="button"
        className="eregna-pg-btn eregna-pg-btn--secondary"
        onClick={() => setDialogOpen(true)}
      >
        Open pricing dialog
      </button>
      {dialogOpen ? (
        <div className="eregna-pg-dialog-backdrop">
          <div className="eregna-pg-dialog">
            <h4 className="text-lg font-semibold text-white">Upgrade to Pro</h4>
            <p className="mt-2 text-sm text-slate-400">Dialog content for tool-reveal tests</p>
            <button
              id="pg-upgrade-cta"
              type="button"
              className="eregna-pg-btn eregna-pg-btn--success mt-4 w-full"
            >
              See pricing
            </button>
            <button
              type="button"
              className="mt-2 w-full text-xs text-slate-500"
              onClick={() => setDialogOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </SceneShell>
  );
}

function FormScene() {
  const { email, setEmail, formError, setFormError } = useStage();
  return (
    <SceneShell title="Contact form">
      <label className="block text-xs text-slate-400 mb-1" htmlFor="pg-email">
        Email
      </label>
      <input
        id="pg-email"
        className="eregna-pg-input"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setFormError(null);
        }}
      />
      {formError ? <p className="mt-2 text-xs text-red-400">{formError}</p> : null}
      <button
        id="pg-submit"
        type="button"
        className="eregna-pg-btn eregna-pg-btn--secondary mt-3"
        onClick={() => setFormError(email.includes("@") ? null : "Enter a valid email address")}
      >
        Submit
      </button>
    </SceneShell>
  );
}

function UsageScene() {
  const { usageRows, resetUsage } = useStage();
  useEffect(() => {
    resetUsage();
  }, [resetUsage]);

  return (
    <SceneShell title="Usage table (async)">
      <table id="pg-usage-table" className="eregna-pg-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>GB</th>
          </tr>
        </thead>
        <tbody>
          {usageRows ? (
            usageRows.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>{r.gb}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2} className="text-slate-500">
                Loading…
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </SceneShell>
  );
}

function PromoScene() {
  const { bannerVisible, resetBanner } = useStage();
  useEffect(() => {
    resetBanner();
  }, [resetBanner]);

  return (
    <SceneShell title="Promo banner">
      {bannerVisible ? (
        <div id="pg-promo-banner" className="eregna-pg-banner">
          Limited offer — disappears in 5s (not-found test)
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Banner removed from DOM. Re-select this scene in the sidebar to reset.
        </p>
      )}
    </SceneShell>
  );
}

function GhostScene() {
  return (
    <SceneShell title="Ghost button">
      <p className="text-sm text-slate-400 leading-relaxed">
        This scene intentionally renders <strong className="text-slate-300">nothing</strong> with key{" "}
        <code className="text-amber-200/90">ghost.button</code>. The element exists in the
        knowledge base only — use it to test not-found / skip behavior.
      </p>
    </SceneShell>
  );
}

function TwinsScene() {
  return (
    <SceneShell title="Twin buttons">
      <p className="text-sm text-slate-400 mb-4">
        Both buttons share class <code className="text-slate-300">.pg-twin-btn</code>.
      </p>
      <div className="flex gap-3">
        <button type="button" className="pg-twin-btn eregna-pg-btn eregna-pg-btn--secondary">
          Twin A
        </button>
        <button type="button" className="pg-twin-btn eregna-pg-btn eregna-pg-btn--secondary">
          Twin B
        </button>
      </div>
    </SceneShell>
  );
}

function CssCardScene() {
  return (
    <SceneShell title="CSS-only card">
      <div className="pg-css-card eregna-pg-card">
        <p className="text-sm text-slate-400">No dom id — matched via css selector only.</p>
      </div>
    </SceneShell>
  );
}

export function StageSceneView({ sceneId }: { sceneId: StageSceneId }) {
  switch (sceneId) {
    case "hero":
      return <HeroScene />;
    case "orders":
      return <OrdersScene />;
    case "details":
      return <DetailsScene />;
    case "tabs":
      return <TabsScene />;
    case "dialog":
      return <DialogScene />;
    case "form":
      return <FormScene />;
    case "usage":
      return <UsageScene />;
    case "promo":
      return <PromoScene />;
    case "ghost":
      return <GhostScene />;
    case "twins":
      return <TwinsScene />;
    case "css-card":
      return <CssCardScene />;
    default:
      return <HeroScene />;
  }
}
