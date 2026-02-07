/**
 * 流量统计汇总组件
 * 显示所有节点的流量统计汇总信息
 */

import { Card } from "@/components/ui/card";
import { Activity, ArrowDown, ArrowUp, Globe, Server } from "lucide-react";

interface TrafficSummaryProps {
  nodes: Array<{
    id: number;
    name: string;
    traffic_up: number;
    traffic_down: number;
    status: string;
  }>;
}

export default function TrafficSummary({ nodes }: TrafficSummaryProps) {
  // 计算总流量
  const totalTrafficUp = nodes.reduce((sum, node) => sum + node.traffic_up, 0);
  const totalTrafficDown = nodes.reduce((sum, node) => sum + node.traffic_down, 0);
  const totalTraffic = totalTrafficUp + totalTrafficDown;
  
  // 在线节点数
  const onlineNodes = nodes.filter(node => node.status === "online").length;
  
  // 格式化字节
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  return (
    <div className="grid gap-4 md:grid-cols-4 mb-6">
      <Card className="glass-card border-white/20 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">总节点数</p>
            <p className="text-3xl font-bold text-white mt-2">{nodes.length}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Server className="w-6 h-6 text-cyan-400" />
          </div>
        </div>
      </Card>

      <Card className="glass-card border-white/20 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">在线节点</p>
            <p className="text-3xl font-bold text-white mt-2">{onlineNodes}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Globe className="w-6 h-6 text-green-400" />
          </div>
        </div>
      </Card>

      <Card className="glass-card border-white/20 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">总上传流量</p>
            <p className="text-2xl font-bold text-white mt-2">{formatBytes(totalTrafficUp)}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
            <ArrowUp className="w-6 h-6 text-blue-400" />
          </div>
        </div>
      </Card>

      <Card className="glass-card border-white/20 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">总下载流量</p>
            <p className="text-2xl font-bold text-white mt-2">{formatBytes(totalTrafficDown)}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
            <ArrowDown className="w-6 h-6 text-purple-400" />
          </div>
        </div>
      </Card>
    </div>
  );
}
