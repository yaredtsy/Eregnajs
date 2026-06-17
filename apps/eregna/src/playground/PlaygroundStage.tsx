import { useEffect, useState } from "react";

const ORDERS = [
  { id: "ORD-101", total: 42.5 },
  { id: "ORD-102", total: 128.0 },
  { id: "ORD-103", total: 19.99 },
];

export function PlaygroundStage({
  onSelectOrder,
}: {
  onSelectOrder: (id: string | null) => void;
}) {
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [usageRows, setUsageRows] = useState<Array<{ month: string; gb: number }> | null>(null);
  const [bannerVisible, setBannerVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setUsageRows([
        { month: "Apr", gb: 12 },
        { month: "May", gb: 18 },
        { month: "Jun", gb: 9 },
      ]);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBannerVisible(false), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    onSelectOrder(selectedOrder);
  }, [selectedOrder, onSelectOrder]);

  // Expose stage controls for playground tools (same page, not backdoor).
  useEffect(() => {
    const w = window as Window & {
      __eregnaPlayground?: {
        openPricingDialog: () => void;
        switchTab: (tab: string) => void;
        prefillForm: (args: { email?: string }) => void;
        getTableSummary: () => unknown;
        sumColumn: (args: { column: string }) => number;
      };
    };
    w.__eregnaPlayground = {
      openPricingDialog: () => setDialogOpen(true),
      switchTab: (t) => {
        if (t === "a" || t === "b" || t === "c") setTab(t);
      },
      prefillForm: ({ email: e }) => {
        const v = e ?? "bad";
        setEmail(v);
        setFormError(v.includes("@") ? null : "Enter a valid email address");
      },
      getTableSummary: () => ({
        rowCount: ORDERS.length,
        selected: selectedOrder,
        totalRevenue: ORDERS.reduce((s, o) => s + o.total, 0),
      }),
      sumColumn: ({ column }) => {
        if (column === "total") return ORDERS.reduce((s, o) => s + o.total, 0);
        return 0;
      },
    };
    return () => {
      delete w.__eregnaPlayground;
    };
  }, [selectedOrder]);

  return (
    <div className="eregna-playground-stage text-sm text-slate-200">
      <section id="pg-hero" className="rounded-lg border border-slate-700 bg-slate-900/80 p-6">
        <h2 className="text-lg font-semibold text-white">Acme Dashboard</h2>
        <p className="mt-1 text-slate-400">Fake host page — the widget embeds over this DOM.</p>
      </section>

      {bannerVisible ? (
        <div
          id="pg-promo-banner"
          className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-200"
        >
          Limited offer — disappears in 5s (not-found test)
        </div>
      ) : null}

      <section className="mt-6">
        <h3 className="mb-2 font-medium text-white">Orders</h3>
        <table
          id="pg-orders-table"
          className="w-full border-collapse text-left text-xs"
        >
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((o) => (
              <tr
                key={o.id}
                className={`cursor-pointer border-b border-slate-800 ${selectedOrder === o.id ? "bg-blue-500/20" : "hover:bg-slate-800/50"}`}
                onClick={() => setSelectedOrder(o.id)}
              >
                <td className="py-2 pr-4">{o.id}</td>
                <td className="py-2">${o.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          id="pg-export-btn"
          type="button"
          disabled={!selectedOrder}
          className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export selected
        </button>
      </section>

      <section className="mt-6">
        <div className="flex gap-2 border-b border-slate-700">
          {(["a", "b", "c"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`px-3 py-1.5 text-xs uppercase ${tab === t ? "border-b-2 border-blue-400 text-white" : "text-slate-500"}`}
              onClick={() => setTab(t)}
            >
              Tab {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-slate-700 bg-slate-900/50 p-4">
          {tab === "a" && <p className="text-slate-400">Tab A content (default visible)</p>}
          {tab === "b" && (
            <div id="pg-tab-b">
              <p className="text-white">Tab B panel — hidden until tab B is active</p>
            </div>
          )}
          {tab === "c" && <p className="text-slate-400">Tab C content</p>}
        </div>
      </section>

      <section className="mt-6 rounded-md border border-slate-700 p-4">
        <h3 className="mb-2 font-medium text-white">Contact</h3>
        <input
          id="pg-email"
          className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFormError(null);
          }}
        />
        {formError ? <p className="mt-1 text-xs text-red-400">{formError}</p> : null}
        <button
          id="pg-submit"
          type="button"
          className="mt-2 rounded-md bg-slate-700 px-3 py-1.5 text-xs text-white"
          onClick={() => {
            setFormError(email.includes("@") ? null : "Enter a valid email address");
          }}
        >
          Submit
        </button>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 font-medium text-white">Usage (async)</h3>
        <table id="pg-usage-table" className="w-full text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="py-1 text-left">Month</th>
              <th className="py-1 text-left">GB</th>
            </tr>
          </thead>
          <tbody>
            {usageRows ? (
              usageRows.map((r) => (
                <tr key={r.month} className="border-t border-slate-800">
                  <td className="py-1">{r.month}</td>
                  <td className="py-1">{r.gb}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="py-2 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="mt-6 flex gap-2">
        <button type="button" className="pg-twin-btn rounded bg-slate-700 px-2 py-1 text-xs">
          Twin A
        </button>
        <button type="button" className="pg-twin-btn rounded bg-slate-700 px-2 py-1 text-xs">
          Twin B
        </button>
      </div>

      <div className="pg-css-card mt-4 rounded border border-dashed border-slate-600 p-3 text-xs text-slate-400">
        CSS-only card (no dom id)
      </div>

      <div id="pg-details" className="mt-[120vh] rounded-md border border-slate-700 p-4">
        <h3 className="font-medium text-white">Long-scroll target</h3>
        <p className="text-slate-400">~3 viewports down — scroll-into-view test</p>
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-lg border border-slate-600 bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">Upgrade to Pro</h3>
            <p className="mt-2 text-sm text-slate-400">Dialog opened via openPricingDialog tool</p>
            <button
              id="pg-upgrade-cta"
              type="button"
              className="mt-4 w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white"
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
    </div>
  );
}
