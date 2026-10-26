import { Component, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

type AppErrorBoundaryState = { hasError: boolean };

let preloadFailureDetected = false;
const preloadFailureSubscribers = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    preloadFailureDetected = true;
    preloadFailureSubscribers.forEach(subscriber => subscriber());
  });
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application route failed to render", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

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
