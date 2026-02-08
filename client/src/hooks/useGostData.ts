import { useState, useEffect } from "react";
import { gostService, GostTunnel } from "@/services/gost";
import { toast } from "sonner";

export function useGostTunnels() {
  const [tunnels, setTunnels] = useState<GostTunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTunnels = async () => {
    try {
      setLoading(true);
      const data = await gostService.getTunnels();
      setTunnels(Array.isArray(data) ? data : (data as any)?.tunnels || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
      toast.error("获取 Gost 隧道列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTunnels();
  }, []);

  return { tunnels, loading, error, refetch: fetchTunnels };
}

export function useGostStats() {
  const [stats, setStats] = useState<{ running: boolean; version: string; enabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await gostService.getStatus();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      toast.error("获取 Gost 统计信息失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return { stats, loading, error, refetch: fetchStats };
}
