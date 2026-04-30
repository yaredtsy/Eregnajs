import { supabase } from "#/lib/supabase";

function apiBase(): string {
	const base = import.meta.env.VITE_EREGNA_API_URL ?? "http://localhost:4000";
	return base.replace(/\/$/, "");
}

async function authHeader(): Promise<Record<string, string>> {
	const { data, error } = await supabase.auth.getSession();
	if (error) throw error;
	const token = data.session?.access_token;
	if (!token) throw new Error("Not authenticated");
	return { Authorization: `Bearer ${token}` };
}

type ErrorBody = { error?: string };

async function parseJson<T>(res: Response): Promise<T> {
	if (res.status === 204) return undefined as T;
	const text = await res.text();
	if (!text) return undefined as T;
	return JSON.parse(text) as T;
}

export async function apiRequest<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
	const headers: Record<string, string> = {
		...(await authHeader()),
	};
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}

	const res = await fetch(url, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	const json = await parseJson<{ data: T } & ErrorBody>(res);

	if (!res.ok) {
		const message = (json as ErrorBody)?.error ?? `HTTP ${res.status}`;
		throw new Error(message);
	}

	return (json as { data: T }).data;
}

export const api = {
	get: <T>(path: string) => apiRequest<T>("GET", path),
	post: <T>(path: string, body: unknown) => apiRequest<T>("POST", path, body),
	patch: <T>(path: string, body: unknown) => apiRequest<T>("PATCH", path, body),
	delete: (path: string) => apiRequest<void>("DELETE", path),
};
