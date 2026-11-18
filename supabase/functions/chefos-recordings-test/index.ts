import { handle } from "../chefos-recordings/index.ts";
Deno.serve((request) => handle(request, "test"));
