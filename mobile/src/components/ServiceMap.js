import { useEffect, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { mapDocument } from "./mapDocument";

export function ServiceMap({ points = [], center, selectedId, onSelect, height = 300, follow = false, onFollowChange }) {
  const ref = useRef(null);
  const source = useMemo(() => ({ html: mapDocument(), baseUrl: "https://chefos.app" }), []);
  const payload = { type: "update", points, center, selectedId, follow };
  const latest = useRef(payload); latest.current = payload;
  const pointKey = JSON.stringify(payload);
  useEffect(() => { ref.current?.postMessage(pointKey); }, [pointKey]);
  function select(event) {
    try {
      const input = JSON.parse(event.nativeEvent.data);
      if (input.type === "ready") ref.current?.postMessage(JSON.stringify(latest.current));
      if (input.type === "follow") onFollowChange?.(false);
      if (input.type === "select" && points.some((point) => point.id === input.id)) onSelect?.(input.id);
    } catch {}
  }
  return <View style={{ height, borderRadius: 26, overflow: "hidden", backgroundColor: "#e9eee6" }}>
    <WebView ref={ref} source={source} onMessage={select} scrollEnabled={false}
      originWhitelist={["https://*", "about:blank"]} userAgent="Chefos/1.2 (mobile service map)"
      onShouldStartLoadWithRequest={(request) => request.url === "about:blank" || request.url.startsWith("https://chefos.app")} />
    <Pressable accessibilityRole="button" accessibilityLabel="Recenter map" onPress={() => { onFollowChange?.(true); ref.current?.postMessage(JSON.stringify({ ...latest.current, recenter: true })); }}
      style={{ position: "absolute", bottom: 32, right: 12, padding: 12, backgroundColor: "white", borderRadius: 22 }}><Ionicons name="locate-outline" size={21} color="#14213D" /></Pressable>
  </View>;
}
