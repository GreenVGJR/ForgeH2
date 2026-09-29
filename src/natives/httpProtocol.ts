import { ArgType, NativeFunction } from "@tryforge/forgescript";

export default new NativeFunction({
  name: "$httpProtocol",
  version: "1.0.0",
  description: "Returns the http protocol",
  unwrap: false,
  output: ArgType.String,
  execute(this: any, ctx: any) {
    const proto =
      (ctx.http.response as unknown as { protocol?: string } | undefined)?.protocol ?? "";
    return this.success(proto);
  },
});
