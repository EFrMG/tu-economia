/** Settle even when an upstream fetch ignores its abort signal during DNS or body reads. */
export async function withUpstreamTimeout<T>(
  milliseconds: number,
  load: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("La fuente agotó el tiempo de espera."));
      controller.abort();
    }, milliseconds);
  });

  try {
    return await Promise.race([load(controller.signal), deadline]);
  } finally {
    clearTimeout(timer!);
  }
}
