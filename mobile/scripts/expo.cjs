const { spawn } = require("node:child_process")

const [variant = "user", ...args] = process.argv.slice(2)
const child = spawn(
  process.execPath,
  [require.resolve("expo/bin/cli"), ...args],
  {
    stdio: "inherit",
    env: { ...process.env, APP_VARIANT: variant === "chef" ? "chef" : "user" }
  }
)
child.on("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
