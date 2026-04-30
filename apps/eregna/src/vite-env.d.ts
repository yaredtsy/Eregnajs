/// <reference types="vite/client" />

declare module "@repo/ui/vite-tailwind" {
	import type { Plugin } from "vite";
	const tailwindPlugin: () => Plugin;
	export default tailwindPlugin;
}

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_EREGNA_SUPABASE_URL?: string;
	readonly VITE_EREGNA_SUPABASE_ANON_KEY?: string;
	readonly VITE_EREGNA_API_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
