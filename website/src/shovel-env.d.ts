// Ambient types for the shovel ServiceWorker globals used during SSR / static
// generation. shovel provides these at runtime (the build is esbuild, not tsc);
// this just keeps the editor honest.
export {};

interface ShovelDirectory {
  open(name: string): Promise<FileSystemDirectoryHandle>;
}

interface ShovelLogger {
  info(message: string, ...args: Array<unknown>): void;
  error(message: string, ...args: Array<unknown>): void;
  warn(message: string, ...args: Array<unknown>): void;
}

declare global {
  interface Window {
    directories: ShovelDirectory;
    loggers: { get(category: Array<string>): ShovelLogger };
  }

  interface ImportMeta {
    env: { MODE: string; [key: string]: string | undefined };
  }
}
