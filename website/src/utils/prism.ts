// Prism's language component modules reference a global `Prism`, so it must be
// set before they're imported. Importing this module first guarantees that.
import Prism from "prismjs";

(globalThis as any).Prism = Prism;

export default Prism;
