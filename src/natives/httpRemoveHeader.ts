import { ArgType, NativeFunction } from "@tryforge/forgescript";

export default new NativeFunction({
  name: "$httpRemoveHeader",
  version: "1.0.0",
  description: "Removes an HTTP header",
  unwrap: true,
  args: [
    {
      name: "name",
      description: "The header name",
      rest: false,
      type: ArgType.String,
      required: true,
    },
  ],
  brackets: true,
  execute(this: any, ctx: any, [name]: any) {
    if (ctx.http.headers) delete ctx.http.headers[name];
    // Remember the removal so our fetch-mimicking defaults stay removed too.
    // Discarded by clearHttpOptions() along with the headers themselves.
    const removed: Set<string> = (ctx.http.removedHeaders ??= new Set());
    removed.add(String(name).toLowerCase());
    return this.success();
  },
});
