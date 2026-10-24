/**
 * Offline fallback for `npx convex codegen`, using the templates shipped in the convex package.
 * `npx convex dev` regenerates the same files; this exists so typecheck, tests and builds work in
 * environments that cannot reach a Convex deployment (CI, sandboxes).
 */
const fs = require("node:fs");
const path = require("node:path");
const tpl = (name) => require(path.join(__dirname, "..", "node_modules", "convex", "dist", "cjs", "cli", "codegen_templates", `${name}.js`));
const { header } = tpl("common");
const { serverCodegen } = tpl("server");
const { apiCodegen } = tpl("api");

const root = path.join(__dirname, "..", "convex");
const out = path.join(root, "_generated");
fs.mkdirSync(out, { recursive: true });

const modules = fs
  .readdirSync(root)
  .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts") && !["schema.ts", "convex.config.ts"].includes(f) && !f.endsWith(".test.ts"))
  .map((f) => f)
  .sort();

const write = (file, contents) => fs.writeFileSync(path.join(out, file), contents.replace(/^\n+/, "").replace(/^ {2,4}/gm, (m) => m));

const server = serverCodegen({ useTypeScript: false });
write("server.js", server.JS);
write("server.d.ts", server.DTS);
const api = apiCodegen(modules, { useTypeScript: false });
write("api.js", api.JS);
write("api.d.ts", api.DTS);
write(
  "dataModel.d.ts",
  `${header("Generated data model types.")}
import type { DataModelFromSchemaDefinition, DocumentByName, TableNamesInDataModel, SystemTableNames } from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

/** The names of all of your Convex tables. */
export type TableNames = TableNamesInDataModel<DataModel>;

/** The type of a document stored in Convex. */
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;

/** An identifier for a document in Convex. */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;

/** A type describing your Convex data model. */
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
`,
);
console.log(`convex codegen (offline): ${modules.length} modules -> convex/_generated`);
