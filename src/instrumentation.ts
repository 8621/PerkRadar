export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { shouldStartScheduler, startScheduler } = await import("./lib/scheduler");
  if (!shouldStartScheduler()) return;
  startScheduler();
}
