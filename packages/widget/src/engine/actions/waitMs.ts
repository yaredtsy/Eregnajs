export async function waitMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
