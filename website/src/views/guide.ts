import { jsx } from "@b9g/crank/standalone";
import { Root } from "../components/root.js";
import { Sidebar } from "../components/sidebar.js";
import { Marked } from "../components/marked.js";
import { collectDocuments } from "../models/document.js";

interface ViewProps {
  url: string;
  params: Record<string, string>;
}

export default async function Guide({ url }: ViewProps) {
  const docsDir = await self.directories.open("docs");
  const guidesDir = await docsDir.getDirectoryHandle("guides");
  const docs = await collectDocuments(guidesDir);

  const norm = (u: string) => u.replace(/\/$/, "");
  const doc = docs.find((d) => norm(d.url) === norm(url));
  if (!doc) {
    return jsx`
      <${Root} title="Not found · Repeater.js" url=${url}>
        <div class="layout">
          <${Sidebar} docs=${docs} url=${url} />
          <main class="content"><h1>Not found</h1></main>
        </div>
      </${Root}>
    `;
  }

  return jsx`
    <${Root}
      title=${`${doc.attributes.title} · Repeater.js`}
      description=${doc.attributes.description || ""}
      url=${url}
    >
      <div class="layout">
        <${Sidebar} docs=${docs} url=${url} />
        <main class="content" data-pagefind-body>
          <${Marked} body=${doc.body} />
        </main>
      </div>
    </${Root}>
  `;
}
