/* eslint-disable */
  /**
   * Generated `api` utility.
   *
   * THIS CODE IS AUTOMATICALLY GENERATED.
   *
   * To regenerate, run `npx convex dev`.
   * @module
   */
  
  import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
  import type * as agent from "../agent.js";
import type * as ask from "../ask.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as data from "../data.js";
import type * as engine from "../engine.js";
import type * as field from "../field.js";
import type * as findings from "../findings.js";
import type * as investigations from "../investigations.js";
import type * as model from "../model.js";
import type * as recommendations from "../recommendations.js";
import type * as system from "../system.js";
import type * as watch from "../watch.js";

  /**
   * A utility for referencing Convex functions in your app's API.
   *
   * Usage:
   * ```js
   * const myFunctionReference = api.myModule.myFunction;
   * ```
   */
  declare const fullApi: ApiFromModules<{
    "agent": typeof agent,
"ask": typeof ask,
"crons": typeof crons,
"dashboard": typeof dashboard,
"data": typeof data,
"engine": typeof engine,
"field": typeof field,
"findings": typeof findings,
"investigations": typeof investigations,
"model": typeof model,
"recommendations": typeof recommendations,
"system": typeof system,
"watch": typeof watch,
  }>;
  export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
  export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
  