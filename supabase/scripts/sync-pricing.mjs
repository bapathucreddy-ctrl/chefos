import { readFile, writeFile } from "node:fs/promises"
const source = new URL("../../chefos_pricing_config.json", import.meta.url)
const config = JSON.parse(await readFile(source, "utf8"))
const encoded = JSON.stringify(config).replaceAll("'", "''")
await writeFile(new URL("../migrations/202610190002_pricing_definition.sql", import.meta.url),
  `-- Generated from chefos_pricing_config.json by sync-pricing.mjs; do not edit.\ninsert into chefos_private.app_config(key,value) values ('pricing','${encoded}'::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now();\n`)
console.log(`Prepared pricing definition ${config.meta.version}`)
