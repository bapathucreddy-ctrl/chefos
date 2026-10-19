module.exports = ({ config }) => {
  const appVariant = process.env.APP_VARIANT === "chef" ? "chef" : "user";
  return {
    ...config,
    name: appVariant === "chef" ? "Chefos Partner" : "Chefos",
    // Both installable variants belong to the same EAS project.
    slug: "chefos-user",
    icon: "./src/assets/chefos-app-icon.png",
    orientation: "portrait",
    ios: {
      ...config.ios,
      bundleIdentifier:
        appVariant === "chef"
          ? "com.chiketan.chefospartner"
          : "com.chiketan.chefosuser",
      supportsTablet: true,
    },
    userInterfaceStyle: "light",
    scheme: appVariant === "chef" ? "chefos-chef" : "chefos-user",
    splash: { resizeMode: "contain", backgroundColor: "#14213D" },
    android: {
      ...config.android,
      package:
        appVariant === "chef"
          ? "com.chiketan.chefospartner"
          : config.android.package,
    },
    extra: {
      ...config.extra,
      appVariant,
    },
  };
};
