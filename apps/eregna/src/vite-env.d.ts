/// <reference types="vite/client" />

declare global {
	interface Window {
		eregna?: {
			setState(partial: Record<string, unknown>): void;
		};
	}
}

declare module "@repo/ui/vite-tailwind" {
	import type { Plugin } from "vite";
	const tailwindPlugin: () => Plugin;
	export default tailwindPlugin;
}

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
	readonly VITE_EREGNA_SUPABASE_URL?: string;
	readonly VITE_EREGNA_SUPABASE_PUBLISHABLE_KEY?: string;
	/** @deprecated Use VITE_EREGNA_SUPABASE_PUBLISHABLE_KEY */
	readonly VITE_SUPABASE_ANON_KEY?: string;
	/** @deprecated Use VITE_EREGNA_SUPABASE_PUBLISHABLE_KEY */
	readonly VITE_EREGNA_SUPABASE_ANON_KEY?: string;
	readonly VITE_EREGNA_API_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
