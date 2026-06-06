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
    title: string;
    description?: string;
    publish?: boolean;
  };
  url: string;
  filename: string;
  body: string;
}

export async function collectDocuments(
  dir: FileSystemDirectoryHandle,
  prefix?: string,
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

    const urlBase = prefix ? `/${prefix}` : "";
    const url =
      `${urlBase}/${filename}`
        .replace(/\.md$/, "")
        .replace(/([0-9]+-)+/, "")
        .replace(/\/index$/, "") + "/";
    const docsRelativeFilename = prefix ? `${prefix}/${filename}` : filename;
    docs.push({ url, filename: docsRelativeFilename, body, attributes });
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
