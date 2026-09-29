// Compile-time only: the published @tryforge/forgescript package ships no
// .d.ts files. Erased on emit; the real package is used at runtime.
declare module "@tryforge/forgescript" {
  export enum ArgType {
    String = 1,
    Number = 6,
    Boolean = 19,
    Json = 13,
    Enum = 15,
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
