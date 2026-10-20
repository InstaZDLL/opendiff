import { useQuery } from "@tanstack/react-query";

export const STATUS_PAGE_URL = "https://status.opendiff.dev";

/** Aggregate states reported by the Better Stack status page */
type AggregateState = "operational" | "degraded" | "downtime" | "maintenance";

interface SystemStatus {
  label: string;
  dotClassName: string;
}

const STATUS_BY_STATE: Record<AggregateState, SystemStatus> = {
  operational: { label: "All systems operational", dotClassName: "bg-green-500" },
  degraded: { label: "Degraded performance", dotClassName: "bg-amber-500" },
  downtime: { label: "Service disruption", dotClassName: "bg-red-500" },
  maintenance: { label: "Scheduled maintenance", dotClassName: "bg-blue-500" },
};

const UNKNOWN_STATUS: SystemStatus = { label: "System status", dotClassName: "bg-muted-foreground" };

async function fetchAggregateState(): Promise<AggregateState | null> {
  const response = await fetch(`${STATUS_PAGE_URL}/index.json`);
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { attributes?: { aggregate_state?: string } } };
  const state = body.data?.attributes?.aggregate_state;
  return state && state in STATUS_BY_STATE ? (state as AggregateState) : null;
}

/** Live status from the public status page, falling back to a neutral label */
export function useSystemStatus(): SystemStatus {
  const { data } = useQuery({
    queryKey: ["system-status"],
    queryFn: fetchAggregateState,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });

  return data ? STATUS_BY_STATE[data] : UNKNOWN_STATUS;
}
