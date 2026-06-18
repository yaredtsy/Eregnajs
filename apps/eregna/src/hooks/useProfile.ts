import { useQuery } from "@tanstack/react-query";
import { useAuth } from "#/lib/auth";
import { supabase } from "#/lib/supabase";

export type UserProfile = {
	id: string;
	email: string;
	full_name: string | null;
	plan: string;
	created_at: string;
};

export function profileQueryKey(userId: string) {
	return ["profile", userId] as const;
}

export function useProfile() {
	const { user } = useAuth();

	return useQuery({
		queryKey: profileQueryKey(user?.id ?? ""),
		queryFn: async () => {
			if (!user) throw new Error("No user");
			const { data, error } = await supabase
				.from("profiles")
				.select("id, email, full_name, plan, created_at")
				.eq("id", user.id)
				.single();
			if (error) throw error;
			return data as UserProfile;
		},
		enabled: Boolean(user),
	});
}
