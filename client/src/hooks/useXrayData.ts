import { useState, useEffect } from "react";
import { xrayService, XrayInbound, XrayStats } from "@/services/xray";
import { toast } from "sonner";

export function useXrayInbounds() {
  const [inbounds, setInbounds] = useState<XrayInbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInbounds = async () => {
    try {
      setLoading(true);
      const data = await xrayService.getInbounds();
      setInbounds(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      toast.error("获取 Xray 入站列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbounds();
  }, []);

  return { inbounds, loading, error, refetch: fetchInbounds };
}

export function useXrayStats() {
  const [stats, setStats] = useState<XrayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await xrayService.getStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      toast.error("获取 Xray 统计信息失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return { stats, loading, error, refetch: fetchStats };
}
