// Non-urgent work: starts when the JS thread is free, with a setTimeout fallback if requestIdleCallback is missing.
// Returns the function to cancel it. Do not use InteractionManager (removed in React Native 0.88).
export function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task);
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(task, 0);
  return () => clearTimeout(timer);
}
