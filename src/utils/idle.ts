// Lavoro non urgente: parte quando il thread JS è libero, con fallback a setTimeout se requestIdleCallback non c'è.
// Restituisce la funzione per annullarlo. Non usare InteractionManager (rimosso in React Native 0.88).
export function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task);
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(task, 0);
  return () => clearTimeout(timer);
}
