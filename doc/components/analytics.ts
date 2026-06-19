/**
 * Analytics utility for reporting events to Aegis
 * Only reports when window.aegis is available
 */

// Type declaration for Aegis (support both lowercase and uppercase)
declare global {
  interface Window {
    aegis?: {
      reportEvent: (event: { name: string; ext1?: string; ext2?: string }) => void;
    };
    Aegis?: {
      reportEvent: (event: { name: string; ext1?: string; ext2?: string }) => void;
    };
  }
}

interface ReportEventParams {
  name: string;
  ideId?: string;
  eventType?: string;
}

/**
 * Get Aegis instance (support both lowercase and uppercase)
 * Also checks if Aegis is a class that needs instantiation
 * @returns Aegis instance or null
 */
function getAegisInstance(): { reportEvent: (event: { name: string; ext1?: string; ext2?: string }) => void } | null {
  if (typeof window === 'undefined') {
    return null;
  }
  
  // Try lowercase first (window.aegis) - most common case
  if (window.aegis) {
    if (typeof window.aegis.reportEvent === 'function') {
      return window.aegis;
    }
  }
  
  // Try uppercase (window.Aegis)
  if (window.Aegis) {
    // Check if it's a class constructor
    if (typeof window.Aegis === 'function') {
      // It's a class, try to find an instance
      // Check if there's a singleton instance
      const instance = (window as any).aegisInstance || (window as any).AegisInstance;
      if (instance && typeof instance.reportEvent === 'function') {
        return instance;
      }
    }
    // Check if it's already an instance with reportEvent
    if (typeof window.Aegis.reportEvent === 'function') {
      return window.Aegis;
    }
  }
  
  // Check for other possible locations
  const possiblePaths = [
    (window as any).__AEGIS__,
    (window as any).__aegis__,
    (window as any).aegisInstance,
    (window as any).AegisInstance,
  ];
  
  for (const aegis of possiblePaths) {
    if (aegis && typeof aegis.reportEvent === 'function') {
      return aegis;
    }
  }
  
  return null;
}

// Queue for events that failed to report due to Aegis not being ready
const eventQueue: Array<{ name: string; ext1: string; ext2: string }> = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RETRY_DELAY = 5000; // 5 seconds max wait
const INITIAL_RETRY_DELAY = 100; // Start with 100ms
let currentRetryDelay = INITIAL_RETRY_DELAY;

/**
 * Process queued events when Aegis becomes available
 */
function processEventQueue(): void {
  const aegis = getAegisInstance();
  if (!aegis || eventQueue.length === 0) {
    return;
  }

  const events = [...eventQueue];
  eventQueue.length = 0; // Clear queue
  
  events.forEach(event => {
    try {
      aegis.reportEvent(event);
    } catch (error) {
      // Silently fail to avoid affecting main flow
    }
  });
}

/**
 * Retry mechanism to check for Aegis availability
 */
function retryCheckAegis(): void {
  const aegis = getAegisInstance();
  
  if (aegis) {
    currentRetryDelay = INITIAL_RETRY_DELAY; // Reset delay
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    processEventQueue();
    return;
  }

  if (currentRetryDelay < MAX_RETRY_DELAY) {
    retryTimer = setTimeout(() => {
      currentRetryDelay = Math.min(currentRetryDelay * 2, MAX_RETRY_DELAY); // Exponential backoff
      retryCheckAegis();
    }, currentRetryDelay);
  } else {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }
}

/**
 * Check if Aegis is available
 * @returns true if Aegis is available, false otherwise
 */
export function isAegisAvailable(): boolean {
  return getAegisInstance() !== null;
}

/**
 * Report event to Aegis if available
 * @param params Event parameters
 *   - name: Event name (required)
 *   - ideId: IDE identifier (optional, stored in ext1)
 *   - eventType: Event type and component info (optional, stored in ext2)
 */
export function reportEvent({ name, ideId, eventType }: ReportEventParams): void {
  try {
    const eventData = {
      name,
      ext1: ideId || '',
      ext2: eventType || '',
    };

    const aegis = getAegisInstance();
    
    if (!aegis) {
      // Queue the event for later reporting
      eventQueue.push(eventData);
      
      // Start retry mechanism if not already running
      if (!retryTimer) {
        retryCheckAegis();
      }
      return;
    }

    // Aegis is available, report immediately
    aegis.reportEvent(eventData);
    
    // Also process any queued events
    if (eventQueue.length > 0) {
      processEventQueue();
    }
  } catch (error) {
    // Silently fail to avoid affecting main flow
  }
}

