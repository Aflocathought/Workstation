// src/components/Utils/debounce.ts
export type Debounced<TArgs extends unknown[]> = ((...args: TArgs) => void) & { cancel: () => void };

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): Debounced<Parameters<T>> {
  type TArgs = Parameters<T>;
  let timer: number | undefined;
  const debounced = ((...args: TArgs) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, wait) as unknown as number;
  }) as Debounced<TArgs>;

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}
