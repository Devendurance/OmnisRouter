interface Pendo {
  track(eventName: string, properties?: Record<string, unknown>): void;
}

// eslint-disable-next-line no-var
declare var pendo: Pendo | undefined;
