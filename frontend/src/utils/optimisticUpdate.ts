export async function persistOptimisticUpdate<T>(
  previous: T,
  optimistic: T,
  apply: (value: T) => void,
  persist: () => Promise<T>,
): Promise<T> {
  apply(optimistic)
  try {
    const saved = await persist()
    apply(saved)
    return saved
  } catch (error) {
    apply(previous)
    throw error
  }
}
