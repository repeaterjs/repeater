import path from "path";
import typescript from "rollup-plugin-typescript2";

const root = process.cwd();
const pkg = require(path.join(root, "package.json"));

export default {
  input: path.join(root, "src", pkg.name.split("/")[1] + ".ts"),
  output: [
    {
      file: pkg.main,
      format: "cjs",
      sourcemap: true,
    },
    {
      file: pkg.module,
      format: "esm",
      sourcemap: true,
    },
  ],
  plugins: [typescript()],
  external: [
    "@repeaterjs/repeater",
    "@repeaterjs/timers",
    "@repeaterjs/pubsub",
    "@repeaterjs/limiters",
  ],
};
