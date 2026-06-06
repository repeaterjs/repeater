import { jsx } from "@b9g/crank/standalone";
import { Root } from "../components/root.js";
import { Sidebar } from "../components/sidebar.js";
import { collectDocuments } from "../models/document.js";

interface ViewProps {
  url: string;
  params: Record<string, string>;
}

export default async function Home({ url }: ViewProps) {
  const docsDir = await self.directories.open("docs");
  const guidesDir = await docsDir.getDirectoryHandle("guides");
  const docs = await collectDocuments(guidesDir, "guides");

  return jsx`
    <${Root}
      title="Repeater.js — safe async iterators"
      description="The missing constructor for creating safe async iterators."
      url=${url}
    >
      <div class="layout">
        <${Sidebar} docs=${docs} url=${url} />
        <main class="content">
          <h1>Repeater.js</h1>
          <p class="tagline">The missing constructor for creating safe async iterators.</p>
          <pre><code>npm install @repeaterjs/repeater</code></pre>
          <p><a href="/guides/quickstart/">Get started →</a></p>
        </main>
      </div>
    </${Root}>
  `;
}
