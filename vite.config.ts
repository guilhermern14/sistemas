import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const backendPlugin = () => ({
  name: "backend-api",
  configureServer(server: any) {
    let appPromise: Promise<any> | null = null;
    server.middlewares.use(async (req: any, res: any, next: any) => {
      const url = req.url || "";
      if (
        url.startsWith("/auth/v1") ||
        url.startsWith("/rest/v1") ||
        url.startsWith("/storage/v1") ||
        url.startsWith("/health")
      ) {
        try {
          if (!appPromise) {
            appPromise = import("./server/src/app.js").then((m) => m.default || m);
          }
          const backendApp = await appPromise;
          return backendApp(req, res, next);
        } catch (err) {
          console.error("Backend middleware error:", err);
          return next(err);
        }
      }
      next();
    });
  },
});

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts
    server: { entry: "server", preset: "node-server" },
  },
  vite: {
    plugins: [backendPlugin()],
    server: {
      port: 3000,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  },
});
