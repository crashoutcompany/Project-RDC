"use client";

const useViewTransition = () => {
  const startTransition = (fn: void) => {
     
    if (!document.startViewTransition) fn;
    else document.startViewTransition(() => fn);
  };

  return { startTransition };
};
export default useViewTransition;
