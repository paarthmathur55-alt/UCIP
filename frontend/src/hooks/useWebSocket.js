import { useEffect, useRef, useState, useCallback } from "react";
import { wsUrl } from "../api";

/**
 * Connects to the backend's /ws endpoint and calls onMessage(type, payload)
 * for every push (event.created, alert.created, alert.updated,
 * camera.status_changed). Auto-reconnects with a short backoff if the
 * connection drops.
 */
export function useWebSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let cancelled = false;

    function connect() {
      socket = new WebSocket(wsUrl());

      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) reconnectTimer = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          handlerRef.current?.(msg.type, msg.payload);
        } catch (_) {
          /* ignore malformed frame */
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { connected };
}
