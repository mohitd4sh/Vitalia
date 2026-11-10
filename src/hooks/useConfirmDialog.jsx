import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";

export default function useConfirmDialog() {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  const close = useCallback((confirmed) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((dialogOptions) => new Promise((resolve) => {
    resolver.current = resolve;
    setOptions(dialogOptions);
  }), []);

  useEffect(() => {
    if (!options) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") close(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [options, close]);

  return {
    confirm,
    dialog: <ConfirmDialog
      options={options}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />,
  };
}
