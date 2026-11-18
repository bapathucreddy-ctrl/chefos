const { spawn } = require("node:child_process")

const [variant = "user", ...args] = process.argv.slice(2)
const testIndex = args.indexOf("--test-env")
const test = testIndex >= 0
if (test) args.splice(testIndex, 1)
const child = spawn(
  process.execPath,
  [require.resolve("expo/bin/cli"), ...args],
  {
    stdio: "inherit",
    env: { ...process.env, APP_VARIANT: variant === "chef" ? "chef" : "user", ...(test ? { EXPO_PUBLIC_CHEFOS_ENVIRONMENT: "test" } : {}) }
  }
)
child.on("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
