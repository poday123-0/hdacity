import { useRef, useEffect, useState, useCallback } from "react";

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  disabled?: boolean;
}

export const usePullToRefresh = ({ onRefresh, threshold = 80, disabled = false }: PullToRefreshOptions) => {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const touchValid = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isMapElement = (el: EventTarget | null): boolean => {
    if (!el || !(el instanceof HTMLElement)) return false;
    let node: HTMLElement | null = el;
    while (node) {
      if (node.tagName === "CANVAS") return true;
      if (node.getAttribute?.("role") === "presentation") return true;
      // Google Maps map div
      if (node.classList?.contains("gm-style")) return true;
      if (node.dataset?.mapContainer !== undefined) return true;
      node = node.parentElement;
    }
    return false;
  };

  const findScrollableParent = (el: HTMLElement | null): HTMLElement | null => {
    let node = el;
    while (node && node !== containerRef.current) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || refreshing) return;
    if (isMapElement(e.target)) {
      touchValid.current = false;
      return;
    }
    // If touch starts inside a scrollable element that isn't at top, don't activate
    const scrollable = findScrollableParent(e.target as HTMLElement);
    if (scrollable && scrollable.scrollTop > 0) {
      touchValid.current = false;
      return;
    }
    touchValid.current = true;
    startY.current = e.touches[0].clientY;
    setPulling(true);
  }, [disabled, refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || !touchValid.current || disabled || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
    }
  }, [pulling, disabled, refreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling || !touchValid.current || disabled) return;
    setPulling(false);
    touchValid.current = false;
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(threshold * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pulling, pullDistance, threshold, refreshing, onRefresh, disabled]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, pullDistance, refreshing, progress: Math.min(pullDistance / threshold, 1) };
};
