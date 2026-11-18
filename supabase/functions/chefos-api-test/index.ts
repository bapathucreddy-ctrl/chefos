import { handle } from "../chefos-api/handler.ts";
Deno.serve((request) => handle(request, "test"));
