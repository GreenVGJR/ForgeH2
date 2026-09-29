import { ForgeClient, ForgeExtension, FunctionManager } from "@tryforge/forgescript";
import httpProtocol from "./natives/httpProtocol.js";
import httpRemoveHeader from "./natives/httpRemoveHeader.js";
import httpRequest from "./natives/httpRequest.js";

export class ForgeH2 extends ForgeExtension {
  name = "ForgeH2";
  description = "HTTP/2 transport for $httpRequest";
  version = "1.0.0";

  init(_client: ForgeClient): void {
    FunctionManager.addMany(httpRequest, httpProtocol, httpRemoveHeader);
  }
}

export default ForgeH2;
