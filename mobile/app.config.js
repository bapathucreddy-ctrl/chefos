module.exports = ({ config }) => {
  const appVariant = process.env.APP_VARIANT === "chef" ? "chef" : "user";
  const test = process.env.EXPO_PUBLIC_CHEFOS_ENVIRONMENT === "test";
  const scheme = (appVariant === "chef" ? "chefos-chef" : "chefos-user") + (test ? "-test" : "");
  return {
    ...config,
    name: (appVariant === "chef" ? "Chefos Partner" : "Chefos") + (test ? " Test" : ""),
    version: "1.3.0",
    // Both installable variants belong to the same EAS project.
    slug: "chefos-user",
    icon: "./src/assets/chefos-app-icon.png",
    orientation: "portrait",
    ios: {
      ...config.ios,
      bundleIdentifier: (appVariant === "chef" ? "com.chiketan.chefospartner" : "com.chiketan.chefosuser") + (test ? ".test" : ""),
      supportsTablet: true,
      buildNumber: "4",
    },
    userInterfaceStyle: "light",
    plugins: [
      ...(config.plugins || []),
      ...(appVariant === "chef" ? [["expo-camera", { cameraPermission: "Allow Chefos to record kitchen video during your cooking visit.", recordAudioAndroid: false }]] : []),
      "expo-video",
      ["expo-location", {
        locationWhenInUsePermission: appVariant === "chef" ? "Share your location with customers while online and during cooking journeys." : "Find chefs near your location.",
        locationAlwaysAndWhenInUsePermission: "Keep your chef journey visible when using navigation or locking your phone.",
        isIosBackgroundLocationEnabled: appVariant === "chef",
        isAndroidBackgroundLocationEnabled: appVariant === "chef",
        isAndroidForegroundServiceEnabled: appVariant === "chef",
      }],
    ],
    scheme,
    splash: { resizeMode: "contain", backgroundColor: "#14213D" },
    android: {
      ...config.android,
      versionCode: 4,
      blockedPermissions: [...(config.android.blockedPermissions || []), "android.permission.RECORD_AUDIO"],
      package: (appVariant === "chef" ? "com.chiketan.chefospartner" : config.android.package) + (test ? ".test" : ""),
    },
    extra: {
      ...config.extra,
      appVariant,
      environment: test ? "test" : "production",
    },
  };
};
