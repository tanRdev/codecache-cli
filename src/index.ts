import { main } from "./cli/program";

if (require.main === module) {
  void main();
}

export { main };
export { runCli } from "./cli/program";
