import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { requireSupabase, tableName } from "../api/supabase";

export function useLiveLocations(sessionId = null, coords = null) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const latitude = coords?.latitude,
    longitude = coords?.longitude;
  useFocusEffect(
    useCallback(() => {
      let active = true,
        busy = false,
        subscribed = false,
        timer = null;
      const client = requireSupabase();
      const refresh = async () => {
        if (busy || !active) return;
        busy = true;
        try {
          const result = sessionId
            ? await api.get(`sessions/${sessionId}/tracking/`)
            : await api.get("discovery/map/", {
                params:
                  latitude != null && longitude != null
                    ? { lat: latitude, lng: longitude }
                    : {},
              });
          if (active) {
            setData(result.data);
            setError("");
          }
        } catch (failure) {
          if (active) setError(failure.message);
        } finally {
          busy = false;
        }
      };
      const channel = client
        .channel(
          `chefos-locations-${sessionId || "nearby"}-${Math.random().toString(36).slice(2)}`,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: tableName("chefos_live_locations"),
          },
          () => {
            refresh();
          },
        )
        .subscribe((status) => {
          subscribed = status === "SUBSCRIBED";
          if (subscribed) refresh();
        });
      async function poll() {
        await refresh();
        if (active) timer = setTimeout(poll, subscribed ? 15000 : 5000);
      }
      setData(null);
      poll();
      return () => {
        active = false;
        clearTimeout(timer);
        client.removeChannel(channel);
      };
    }, [sessionId, latitude, longitude]),
  );
  return { data, error };
}
