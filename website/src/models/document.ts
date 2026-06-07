import frontmatter from "front-matter";

interface WalkInfo {
  filename: string;
}

async function* walk(
  dir: FileSystemDirectoryHandle,
  basePath: string = "",
): AsyncGenerator<WalkInfo> {
  const entries: Array<[string, FileSystemHandle]> = [];
  for await (const entry of (dir as any).entries()) {
    entries.push(entry);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  for (const [name, handle] of entries) {
    const path = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === "directory") {
      yield* walk(handle as FileSystemDirectoryHandle, path);
    } else if (handle.kind === "file") {
      yield { filename: path };
    }
  }
}

export interface DocInfo {
  attributes: {
    id?: string;
    title: string;
    description?: string;
    publish?: boolean;
  };
  id: string;
  url: string;
  filename: string;
  body: string;
}

// The canonical URL is /docs/<id>/, where <id> is the document's frontmatter
// `id` — preserving the existing Docusaurus URLs (cool URIs don't change),
// including ids that keep underscores like `error_handling`. The numeric
// filename prefix only orders the files; it never appears in the URL.
export async function collectDocuments(
  dir: FileSystemDirectoryHandle,
): Promise<Array<DocInfo>> {
  const docs: Array<DocInfo> = [];
  for await (const { filename } of walk(dir)) {
    if (!filename.endsWith(".md")) {
      continue;
    }

    const fileHandle = await navigatePath(dir, filename);
    const file = await fileHandle.getFile();
    const md = await file.text();
    const { attributes, body } = frontmatter(md) as unknown as DocInfo;
    if (attributes.publish == null) {
      attributes.publish = true;
    }

    const id =
      attributes.id ||
      filename
        .replace(/\.md$/, "")
        .replace(/^([0-9]+[-_])+/, "")
        .replace(/\//g, "-");
    docs.push({ id, url: `/docs/${id}/`, filename, body, attributes });
  }

  return docs;
}

async function navigatePath(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = path.split("/");
  let current = dir;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  return current.getFileHandle(parts[parts.length - 1]);
}
