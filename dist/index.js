"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeH2 = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const httpProtocol_js_1 = __importDefault(require("./natives/httpProtocol.js"));
const httpRemoveHeader_js_1 = __importDefault(require("./natives/httpRemoveHeader.js"));
const httpRequest_js_1 = __importDefault(require("./natives/httpRequest.js"));
class ForgeH2 extends forgescript_1.ForgeExtension {
    name = "ForgeH2";
    description = "HTTP/2 transport for $httpRequest";
    version = "1.0.0";
    init(_client) {
        forgescript_1.FunctionManager.addMany(httpRequest_js_1.default, httpProtocol_js_1.default, httpRemoveHeader_js_1.default);
    }
}
exports.ForgeH2 = ForgeH2;
exports.default = ForgeH2;
//# sourceMappingURL=index.js.map