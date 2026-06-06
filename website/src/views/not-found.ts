import { jsx } from "@b9g/crank/standalone";
import { Root } from "../components/root.js";

interface ViewProps {
  url: string;
  params: Record<string, string>;
}

export default function NotFound({ url }: ViewProps) {
  return jsx`
    <${Root} title="Not found · Repeater.js" url=${url}>
      <main class="content">
        <h1>404</h1>
        <p>That page doesn't exist. <a href="/">Back home</a>.</p>
      </main>
    </${Root}>
  `;
}
