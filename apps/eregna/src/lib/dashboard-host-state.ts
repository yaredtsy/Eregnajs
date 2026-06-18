import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "#/hooks/useProfile";

export type DashboardHostUserState = {
	name: string | null;
	email: string;
	createdAt: string;
	plan: string;
};

export function buildDashboardHostUserState(
	user: User,
	profile?: UserProfile | null,
): DashboardHostUserState {
	const metaName =
		typeof user.user_metadata?.full_name === "string"
			? user.user_metadata.full_name
			: null;

	return {
		name: profile?.full_name ?? metaName,
		email: profile?.email ?? user.email ?? "",
		createdAt: profile?.created_at ?? user.created_at,
		plan: profile?.plan ?? "free",
	};
}

export function syncDashboardHostUserState(userState: DashboardHostUserState): void {
	window.eregna?.setState({ user: userState });
}
