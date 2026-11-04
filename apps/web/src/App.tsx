import { useEffect, useState } from 'react';
import { APP_NAME, APP_VERSION } from '@vexora/shared';
import { fetchHealth, type HealthData } from './api/health';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; data: HealthData }
  | { status: 'error'; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchHealth();
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setHealth({ status: 'error', message: response.error.message });
          return;
        }
        setHealth({ status: 'ok', data: response.data });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setHealth({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <header className="shell__header">
        <h1>{APP_NAME}</h1>
        <p>Engineering bootstrap · v{APP_VERSION}</p>
      </header>

      <section className="panel">
        <h2>Backend Health</h2>
        {health.status === 'loading' && <p>Checking API…</p>}
        {health.status === 'ok' && (
          <p className="ok">
            Connected · {health.data.status} · server {health.data.version}
          </p>
        )}
        {health.status === 'error' && <p className="error">{health.message}</p>}
      </section>
    </main>
  );
}
