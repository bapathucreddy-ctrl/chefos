import { createClient } from "npm:@supabase/supabase-js@2.118.0";

export type Environment = "production" | "test";
export function environmentClient(
  url: string,
  key: string,
  options: Parameters<typeof createClient>[2],
  environment: Environment,
) {
  const client = createClient(url, key, options);
  if (environment !== "test") return client;
  const rpc = client.rpc.bind(client);
  client.rpc = ((
    name: string,
    args?: Record<string, unknown>,
    settings?: Parameters<typeof rpc>[2],
  ) =>
    rpc(
      name.endsWith("_test") ? name : name + "_test",
      args,
      settings,
    )) as typeof client.rpc;
  const from = client.from.bind(client);
  client.from = ((name: string) =>
    from(name.endsWith("_test") ? name : name + "_test")) as typeof client.from;
  const bucket = client.storage.from.bind(client.storage);
  client.storage.from = (name: string) =>
    bucket(name.endsWith("-test") ? name : name + "-test");
  return client;
}
