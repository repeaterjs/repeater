import { jsx, Raw } from "@b9g/crank/standalone";
import { marked } from "marked";

marked.setOptions({ headerIds: true, mangle: false } as any);

export function Marked({ body }: { body: string }) {
  const html = marked.parse(body) as string;
  return jsx`<${Raw} value=${html} />`;
}
