import { useRef, useState } from 'react';

// Native bottom-sheet feel: pull the sheet down by its grab handle to dismiss. Spread
// `handleProps` onto the grab-zone element (the row wrapping the little pill) and fold
// `sheetStyle` into the sheet container's inline style string. Pointer events cover both
// touch and mouse; touch-action:none on the handle stops the page scrolling mid-drag.
// (Extracted from the CoursePicker / LivePages sheets so every sheet dismisses the same way.)
export default function useSheetDrag(onClose, { threshold = 90 } = {}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);
  const down = (e) => {
    startRef.current = e.clientY;
    setDragging(true);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const move = (e) => { if (startRef.current != null) setDragY(Math.max(0, e.clientY - startRef.current)); };
  const up = () => {
    if (startRef.current == null) return;
    const shouldClose = dragY > threshold; // dragged far enough → dismiss
    startRef.current = null;
    setDragging(false);
    if (shouldClose) onClose?.(); else setDragY(0);
  };
  return {
    dragY,
    dragging,
    handleProps: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up },
    // Append to the sheet container's style string (it follows the finger, then springs back).
    sheetStyle: `transform:translateY(${dragY}px);transition:transform ${dragging ? '0s' : '.25s'} ease`,
  };
}
