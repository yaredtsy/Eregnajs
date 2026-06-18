import { useEffect } from "react";
import { useAuth } from "#/lib/auth";
import {
	buildDashboardHostUserState,
	syncDashboardHostUserState,
} from "#/lib/dashboard-host-state";
import { useProfile } from "#/hooks/useProfile";

/** Injects signed-in user context into the dashboard guide widget via `eregna.setState`. */
export function useDashboardWidgetState(enabled: boolean) {
	const { user } = useAuth();
	const { data: profile } = useProfile();

	useEffect(() => {
		if (!enabled || !user) return;
		syncDashboardHostUserState(buildDashboardHostUserState(user, profile));
	}, [enabled, user, profile]);
}
