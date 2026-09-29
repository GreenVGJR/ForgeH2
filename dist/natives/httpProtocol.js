"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
exports.default = new forgescript_1.NativeFunction({
    name: "$httpProtocol",
    version: "1.0.0",
    description: "Returns the http protocol",
    unwrap: false,
    output: forgescript_1.ArgType.String,
    execute(ctx) {
        const proto = ctx.http.response?.protocol ?? "";
        return this.success(proto);
    },
});
//# sourceMappingURL=httpProtocol.js.map