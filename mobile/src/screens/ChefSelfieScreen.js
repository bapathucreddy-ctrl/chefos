import { useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button, Screen } from "../components/ui";
import { Header, Notice, PAPER, GOLD, s } from "../components/reference";

export function ChefSelfieScreen({ route, navigation, enrolment = false, onComplete }) {
  const { logout } = useAuth();
  const sessionId = route?.params?.sessionId;
  const camera = useRef(null);
  const localPhoto = useRef(null);
  const mounted = useRef(true);
  const [permission, requestPermission] = useCameraPermissions();
  const [consent, setConsent] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (localPhoto.current) FileSystem.deleteAsync(localPhoto.current, { idempotent: true }).catch(() => {});
    };
  }, []);

  async function openCamera() {
    setError("");
    try {
      if (Platform.OS === "web") throw new Error("Use the Chefos Partner Android or iOS app to take your selfie.");
      const granted = permission?.granted || (await requestPermission()).granted;
      if (!granted) throw new Error("Camera permission is required for your chef selfie.");
      if (localPhoto.current) await FileSystem.deleteAsync(localPhoto.current, { idempotent: true });
      localPhoto.current = null;
      setPhoto(null);
      setAttempt(null);
      setReady(false);
      setCameraVisible(true);
    } catch (failure) {
      setError(failure.message);
    }
  }

  async function cameraReady() {
    try {
      if (!pictureSize) {
        const sizes = await camera.current.getAvailablePictureSizesAsync();
        const ranked = sizes.map((value) => {
          const [width, height] = value.split("x").map(Number);
          return { value, area: width * height };
        }).filter((item) => Number.isFinite(item.area)).sort((a, b) => a.area - b.area);
        const suitable = ranked.filter((item) => item.area <= 2000000);
        if (ranked.length) setPictureSize((suitable.at(-1) || ranked[0]).value);
      }
      setReady(true);
    } catch {
      setReady(true);
    }
  }

  async function finishVerification(attemptId) {
    setStage("Checking liveness and identity…");
    const { data } = await api.post("identity/selfie/verify/", { attempt_id: attemptId });
    if (data.state !== "passed") {
      throw new Error("Your selfie could not be verified. Face the camera in good light and take a fresh selfie.");
    }
    if (localPhoto.current) await FileSystem.deleteAsync(localPhoto.current, { idempotent: true });
    localPhoto.current = null;
    if (!mounted.current) return;
    if (onComplete) await onComplete();
    else navigation.goBack();
  }

  async function capture() {
    if (!ready || !camera.current || busy) return;
    setBusy(true);
    setError("");
    try {
      setStage("Preparing secure capture…");
      const { data: challenge } = await api.post("identity/selfie/challenge/", { session_id: sessionId, consent });
      if (!mounted.current || !camera.current) return;
      const captured = await camera.current.takePictureAsync({ quality: 0.7, exif: false });
      if (!captured?.uri) throw new Error("The camera could not save your selfie. Please try again.");
      if (!mounted.current) {
        await FileSystem.deleteAsync(captured.uri, { idempotent: true });
        return;
      }
      localPhoto.current = captured.uri;
      setPhoto(captured.uri);
      setCameraVisible(false);
      const info = await FileSystem.getInfoAsync(captured.uri);
      if (!info.exists || info.size > 5242880) throw new Error("Your selfie is too large. Please retake it.");
      setStage("Uploading your selfie…");
      const uploaded = await FileSystem.uploadAsync(challenge.upload_url, captured.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
      });
      if (![200, 201].includes(uploaded.status)) throw new Error("Your selfie upload could not finish. Please take a fresh selfie and retry.");
      if (!mounted.current) return;
      setAttempt(challenge.id);
      await finishVerification(challenge.id);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      if (!mounted.current && localPhoto.current) await FileSystem.deleteAsync(localPhoto.current, { idempotent: true }).catch(() => {});
      if (mounted.current) { setBusy(false); setStage(""); }
    }
  }

  async function retry() {
    setBusy(true);
    setError("");
    try { await finishVerification(attempt); }
    catch (failure) { setError(failure.message); }
    finally { if (mounted.current) { setBusy(false); setStage(""); } }
  }

  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 20 }}>
    <Header title={enrolment ? "Register your selfie" : "Verify your selfie"} onBack={enrolment || busy ? undefined : () => navigation.goBack()} />
    <Text style={s.title}>{enrolment ? "Let customers recognise you." : "Confirm it’s you."}</Text>
    <Text style={s.muted}>{enrolment
      ? "Take your registration selfie to complete your chef profile. We’ll compare future visit selfies with this reference."
      : "Take a fresh selfie at this home. We’ll check liveness and compare it with your registration selfie before cooking starts."}</Text>
    <Notice>Face the camera alone in good light. Remove your mask and sunglasses, and keep your face fully visible.</Notice>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} disabled={busy}
      onPress={() => setConsent(!consent)} style={styles.consent}>
      <Text style={{ color: GOLD, fontSize: 22 }}>{consent ? "☑" : "☐"}</Text>
      <Text style={[s.small, { flex: 1 }]}>I consent to Didit processing my selfie for liveness and face matching, and to Chefos privately storing my registration selfie for future visit verification.</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {cameraVisible ? <View style={styles.camera}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} mode="picture" facing="front" pictureSize={pictureSize || undefined}
        onCameraReady={cameraReady} onMountError={(failure) => { setError(failure.message); setCameraVisible(false); }} />
      <View pointerEvents="none" style={styles.oval} />
    </View> : photo ? <Image source={{ uri: photo }} style={styles.camera} resizeMode="contain" /> : null}
    {stage ? <Text style={s.subtitle}>{stage}</Text> : null}
    {cameraVisible ? <Button label="Take selfie & verify" disabled={!ready || !consent} loading={busy} onPress={capture} />
      : <Button label={photo ? "Take a fresh selfie" : "Open selfie camera"} disabled={!consent || busy} onPress={openCamera} />}
    {attempt && error ? <Button label="Retry verification" variant="outline" loading={busy} disabled={!consent} onPress={retry} /> : null}
    {enrolment ? <Button label="Sign out" variant="outline" disabled={busy} onPress={logout} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  camera: { width: "100%", height: 330, borderRadius: 20, overflow: "hidden", backgroundColor: "#14213D", alignItems: "center", justifyContent: "center" },
  oval: { width: 205, height: 270, borderRadius: 140, borderWidth: 3, borderColor: GOLD },
  consent: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
});
