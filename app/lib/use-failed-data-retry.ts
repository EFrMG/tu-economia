import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigation, useRevalidator } from "react-router";

import { isUnavailablePreview } from "~/lib/data-preview";

/** Retry only pages with an unavailable source, while the tab is visible and idle. */
export function useFailedDataRetry(failure: Promise<boolean>) {
  const [hasFailure, setHasFailure] = useState(false);
  const retryCount = useRef(0);

  const location = useLocation();
  const navigation = useNavigation();
  const { state: revalidationState, revalidate } = useRevalidator();

  useEffect(() => {
    let active = true;
    setHasFailure(false);

    failure.then(
      (failed) => {
        if (active) {
          if (!failed) retryCount.current = 0;

          setHasFailure(failed);
        }
      },
      () => {
        if (active) setHasFailure(true);
      },
    );

    return () => {
      active = false;
    };
  }, [failure]);

  useEffect(() => {
    if (
      !hasFailure ||
      navigation.state !== "idle" ||
      revalidationState !== "idle" ||
      isUnavailablePreview(new URLSearchParams(location.search))
    )
      return;

    let attempted = false;

    const retry = () => {
      if (attempted || document.visibilityState !== "visible") return;

      attempted = true;
      retryCount.current += 1;
      revalidate();
    };

    // Give a failed source time to recover, and leave navigation idle between attempts.
    const delay = Math.min(30_000 * 2 ** retryCount.current, 300_000);
    const timeout = window.setTimeout(retry, delay);

    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retry();
    };

    document.addEventListener("visibilitychange", retryWhenVisible);
    window.addEventListener("online", retry);

    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", retryWhenVisible);
      window.removeEventListener("online", retry);
    };
  }, [
    hasFailure,
    location.search,
    navigation.state,
    revalidationState,
    revalidate,
  ]);
}
