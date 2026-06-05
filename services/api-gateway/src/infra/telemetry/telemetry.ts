import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

/**
 * Initialize OpenTelemetry tracing
 * Must be called BEFORE any other imports in main.ts so the auto-instrumentations can patch libraries(pg, http, express, etc) as they load
 * If OTEL_EXPORTER_OTLP_ENDPOINT is unset , the sdk starts but doesn't export anywhere - traes are collected but discarded
 */

export function initTelemetry(serviceName: string, endpoint?: string): NodeSDK {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: endpoint ? new OTLPTraceExporter({ url: endpoint }) : undefined,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.warn('OpenTelemetry shut down'))
      .catch((err) => console.error('Opentelemetry shutdown failed', err))
      .finally(() => process.exit(0));
  });
  return sdk;
}
