/** Lets every queued microtask and timer callback run, which is how a frame reaches the far end here. */
export const settle = async (times = 8): Promise<void> => {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
