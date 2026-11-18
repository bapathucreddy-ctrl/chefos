const { spawn } = require("node:child_process");
const [variant = "user", platform = "android", profile = "preview"] =
  process.argv.slice(2);
if (
  !["user", "chef"].includes(variant) ||
  !["android", "ios"].includes(platform) ||
  !["preview", "production", "test"].includes(profile)
)
  throw new Error("Invalid build target");
const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["eas-cli", "build", "--platform", platform, "--profile", {
    preview: { user: "preview", chef: "preview-chef" },
    production: { user: "production", chef: "production-chef" },
    test: { user: "preview-test", chef: "preview-chef-test" },
  }[profile][variant]],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, APP_VARIANT: variant },
  },
);
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
