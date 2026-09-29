"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
exports.default = new forgescript_1.NativeFunction({
    name: "$httpRemoveHeader",
    version: "1.0.0",
    description: "Removes an HTTP header",
    unwrap: true,
    args: [
        {
            name: "name",
            description: "The header name",
            rest: false,
            type: forgescript_1.ArgType.String,
            required: true,
        },
    ],
    brackets: true,
    execute(ctx, [name]) {
        if (ctx.http.headers)
            delete ctx.http.headers[name];
        // Remember the removal so our fetch-mimicking defaults stay removed too.
        // Discarded by clearHttpOptions() along with the headers themselves.
        const removed = (ctx.http.removedHeaders ??= new Set());
        removed.add(String(name).toLowerCase());
        return this.success();
    },
});
//# sourceMappingURL=httpRemoveHeader.js.map