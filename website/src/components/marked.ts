// Set globalThis.Prism before loading language grammars (side-effect modules).
import Prism from "../utils/prism.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-bash.js";

import { jsx, Raw } from "@b9g/crank/standalone";
import { marked } from "marked";

const LANGS: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  json: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
};

marked.setOptions({
  headerIds: true,
  mangle: false,
  highlight(code: string, lang: string): string {
    const name = LANGS[lang] || "javascript";
    const grammar = Prism.languages[name] || Prism.languages.javascript;
    return Prism.highlight(code, grammar, name);
  },
} as any);

export function Marked({ body }: { body: string }) {
  const html = marked.parse(body) as string;
  return jsx`<${Raw} value=${html} />`;
}
