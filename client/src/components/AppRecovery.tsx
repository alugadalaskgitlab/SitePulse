import { Component, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

type AppErrorBoundaryState = { hasError: boolean; chunkLoadFailure: boolean };

let preloadFailureDetected = false;
const preloadFailureSubscribers = new Set<() => void>();
const CHUNK_RELOAD_GUARD_KEY = "sp_chunk_reload_at";
const CHUNK_RELOAD_GUARD_MS = 60_000;

function isChunkLoadFailure(error: unknown) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk .+ failed|failed to load module script/i.test(detail);
}

function flagPreloadFailure() {
  preloadFailureDetected = true;
  preloadFailureSubscribers.forEach(subscriber => subscriber());
}

function reloadAfterChunkFailure(reload = () => window.location.reload()) {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  let lastReload: number;
  try {
    lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || "0");
    if (lastReload > 0 && now - lastReload < CHUNK_RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now));
  } catch {
    // Without a persistent per-tab guard, avoid a reload loop and leave the manual
    // refresh notice visible instead.
    return false;
  }
  reload();
  return true;
}

export function handleVitePreloadError(event: Event, reload?: () => void) {
  event.preventDefault();
  flagPreloadFailure();
  return reloadAfterChunkFailure(reload);
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", event => handleVitePreloadError(event));
}

export class AppErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, chunkLoadFailure: false };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { hasError: true, chunkLoadFailure: isChunkLoadFailure(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application route failed to render", error, info);
    if (isChunkLoadFailure(error) && !reloadAfterChunkFailure()) flagPreloadFailure();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;
    if (this.state.chunkLoadFailure) {
      return (
        <main className="flex min-h-[50vh] items-center justify-center p-6">
          <section
            role="status"
            data-testid="chunk-load-recovery"
            className="w-full max-w-md rounded-lg border bg-background p-6 text-center shadow-sm"
          >
            <h1 className="text-lg font-semibold">Refreshing the app</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A new version is available. If the app does not refresh automatically, reload it to continue.
            </p>
            <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </section>
        </main>
      );
    }
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6">
        <section
          role="alert"
          data-testid="app-error-fallback"
          className="w-full max-w-md rounded-lg border bg-background p-6 text-center shadow-sm"
        >
          <h1 className="text-lg font-semibold">This screen couldn’t be loaded</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reload the app to try again.
          </p>
          <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </section>
      </main>
    );
  }
}

export function AppUpdateNotice() {
  const [updateReady, setUpdateReady] = useState(preloadFailureDetected);

  useEffect(() => {
    let mounted = true;
    let updateInProgress = false;
    let registration: ServiceWorkerRegistration | undefined;
    const cleanups: Array<() => void> = [];
    const showUpdate = () => {
      if (mounted) setUpdateReady(true);
    };
    preloadFailureSubscribers.add(showUpdate);

    const serviceWorker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!serviceWorker) {
      return () => {
        mounted = false;
        preloadFailureSubscribers.delete(showUpdate);
      };
    }

    const onControllerChange = () => {
      if (updateInProgress) showUpdate();
    };
    serviceWorker.addEventListener("controllerchange", onControllerChange);

    const attachRegistration = (nextRegistration: ServiceWorkerRegistration | undefined) => {
      if (!mounted || !nextRegistration || registration === nextRegistration) return;
      registration = nextRegistration;

      if (registration.waiting && registration.active) {
        updateInProgress = true;
        showUpdate();
      }

      const watchInstallingWorker = () => {
        const worker = registration?.installing;
        if (!worker || !(registration?.active || serviceWorker.controller)) return;
        updateInProgress = true;
        const onStateChange = () => {
          if (worker.state === "installed") showUpdate();
        };
        worker.addEventListener("statechange", onStateChange);
        cleanups.push(() => worker.removeEventListener("statechange", onStateChange));
        if (worker.state === "installed") showUpdate();
      };

      registration.addEventListener("updatefound", watchInstallingWorker);
      cleanups.push(() => registration?.removeEventListener("updatefound", watchInstallingWorker));
      watchInstallingWorker();
    };

    void serviceWorker.getRegistration().then(attachRegistration).catch(() => {});
    void serviceWorker.ready.then(attachRegistration).catch(() => {});

    return () => {
      mounted = false;
      preloadFailureSubscribers.delete(showUpdate);
      serviceWorker.removeEventListener("controllerchange", onControllerChange);
      cleanups.forEach(cleanup => cleanup());
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="app-update-notice"
      className="fixed left-1/2 top-3 z-[100] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 rounded-md border bg-background/95 p-2 shadow-md backdrop-blur"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full whitespace-normal text-center"
        onClick={() => window.location.reload()}
      >
        A new version is ready — tap to refresh
      </Button>
    </div>
  );
}
