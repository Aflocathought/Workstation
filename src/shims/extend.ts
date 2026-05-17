type ExtendInput = Record<string, unknown> | unknown[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneContainer(value: unknown) {
  if (Array.isArray(value)) {
    return [...value];
  }

  if (isPlainObject(value)) {
    return { ...value };
  }

  return value;
}

function mergeInto(
  target: ExtendInput,
  source: ExtendInput,
  deep: boolean,
): ExtendInput {
  if (Array.isArray(source)) {
    return source.map((item) => {
      if (!deep) {
        return item;
      }

      if (Array.isArray(item) || isPlainObject(item)) {
        return mergeInto(cloneContainer(item) as ExtendInput, item as ExtendInput, true);
      }

      return item;
    });
  }

  for (const [key, value] of Object.entries(source)) {
    if (!deep || (!Array.isArray(value) && !isPlainObject(value))) {
      target[key] = value;
      continue;
    }

    const currentValue = target[key];
    const nextTarget = Array.isArray(value)
      ? (Array.isArray(currentValue) ? currentValue : [])
      : (isPlainObject(currentValue) ? currentValue : {});

    target[key] = mergeInto(nextTarget as ExtendInput, value as ExtendInput, true);
  }

  return target;
}

function extend(...args: unknown[]) {
  let deep = false;
  let startIndex = 0;

  if (typeof args[0] === "boolean") {
    deep = args[0];
    startIndex = 1;
  }

  const initialTarget = args[startIndex];
  const target =
    Array.isArray(initialTarget) || isPlainObject(initialTarget)
      ? (initialTarget as ExtendInput)
      : {};

  for (let index = startIndex + 1; index < args.length; index += 1) {
    const source = args[index];

    if (!Array.isArray(source) && !isPlainObject(source)) {
      continue;
    }

    mergeInto(target, source, deep);
  }

  return target;
}

export default extend;