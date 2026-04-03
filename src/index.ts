import path from "node:path";
import moduleAlias = require("module-alias");

moduleAlias.addAlias("@", __dirname);
import { main } from "@/cli/program";

if (require.main === module) {
  void main();
}

export { main };
