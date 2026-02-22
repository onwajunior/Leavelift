type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track: (event: string, props?: Props) => void;
    };
  }
}

export function track(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  if (!window.umami) return;
  window.umami.track(event, props);
}
