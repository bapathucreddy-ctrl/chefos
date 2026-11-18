import { handle } from "../chefos-payments-webhook/handler.ts";
Deno.serve((request) => handle(request, "test"));
