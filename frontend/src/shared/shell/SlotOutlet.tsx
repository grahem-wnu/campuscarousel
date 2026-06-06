import { Suspense, lazy, useMemo, type ReactNode } from "react";
import { Spinner } from "../ui/Spinner";
import { getSlot, type SlotName } from "./slots";

/**
 * Renders a registered shell slot (e.g. the AI panel or quick-add form), or a
 * placeholder when no module has registered it yet. The slot component is code-split.
 */
export function SlotOutlet({ name, placeholder }: { name: SlotName; placeholder: ReactNode }) {
  const loader = getSlot(name);
  const Lazy = useMemo(() => (loader ? lazy(loader) : null), [loader]);

  if (!Lazy) return <>{placeholder}</>;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12 text-ink-400">
          <Spinner />
        </div>
      }
    >
      <Lazy />
    </Suspense>
  );
}
