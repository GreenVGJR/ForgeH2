// Compile-time only shim: the published @tryforge/forgescript npm package
// At runtime the real package is used; this file is erased on emit.
declare module "@tryforge/forgescript" {
  export enum ArgType {
    String = 0,
    Number = 1,
    Boolean = 2,
    User = 3,
    Channel = 4,
    Guild = 5,
    Role = 6,
    Enum = 7,
    Json = 8,
    Unknown = 9,
  }

  export enum HTTPContentType {
    Json = 0,
    Text = 1,
  }

  export class NativeFunction {
    constructor(data: any);
  }

  export class ForgeExtension {
    name: string;
    description: string;
    version: string;
    init(client: any): void;
  }

  export class ForgeClient {}

  export class FunctionManager {
    static addMany(...fns: any[]): void;
    static add(fn: any): void;
  }
}
