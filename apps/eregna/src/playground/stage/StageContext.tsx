import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const ORDERS = [
  { id: "ORD-101", total: 42.5 },
  { id: "ORD-102", total: 128.0 },
  { id: "ORD-103", total: 19.99 },
];

export type StageApi = {
  openPricingDialog: () => void;
  switchTab: (tab: string) => void;
  prefillForm: (args: { email?: string }) => void;
  getTableSummary: () => unknown;
  sumColumn: (args: { column: string }) => number;
};

type StageContextValue = {
  orders: typeof ORDERS;
  tab: "a" | "b" | "c";
  setTab: (t: "a" | "b" | "c") => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  selectedOrder: string | null;
  setSelectedOrder: (id: string | null) => void;
  email: string;
  setEmail: (v: string) => void;
  formError: string | null;
  setFormError: (v: string | null) => void;
  usageRows: Array<{ month: string; gb: number }> | null;
  bannerVisible: boolean;
  resetBanner: () => void;
  resetUsage: () => void;
};

const StageContext = createContext<StageContextValue | null>(null);

export function StageProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [usageRows, setUsageRows] = useState<Array<{ month: string; gb: number }> | null>(null);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [usageToken, setUsageToken] = useState(0);
  const [bannerToken, setBannerToken] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setUsageRows([
        { month: "Apr", gb: 12 },
        { month: "May", gb: 18 },
        { month: "Jun", gb: 9 },
      ]);
    }, 2000);
    return () => clearTimeout(t);
  }, [usageToken]);

  useEffect(() => {
    setBannerVisible(true);
    const t = setTimeout(() => setBannerVisible(false), 5000);
    return () => clearTimeout(t);
  }, [bannerToken]);

  const resetBanner = useCallback(() => setBannerToken((n) => n + 1), []);
  const resetUsage = useCallback(() => {
    setUsageRows(null);
    setUsageToken((n) => n + 1);
  }, []);

  const value = useMemo<StageContextValue>(
    () => ({
      orders: ORDERS,
      tab,
      setTab,
      dialogOpen,
      setDialogOpen,
      selectedOrder,
      setSelectedOrder,
      email,
      setEmail,
      formError,
      setFormError,
      usageRows,
      bannerVisible,
      resetBanner,
      resetUsage,
    }),
    [
      tab,
      dialogOpen,
      selectedOrder,
      email,
      formError,
      usageRows,
      bannerVisible,
      resetBanner,
      resetUsage,
    ],
  );

  useEffect(() => {
    const w = window as Window & { __eregnaPlayground?: StageApi };
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

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage() {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStage must be used within StageProvider");
  return ctx;
}
