import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  TestTube,
  Star,
  StarOff,
  Loader2,
  Server,
  Key,
  Lock,
  CheckCircle,
  XCircle,
  Edit,
  Save,
  X,
} from "lucide-react";

interface SSHConfigItem {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  isDefault: boolean;
  isActive: boolean;
  connectTimeout: number;
  createdAt: string;
  updatedAt: string;
}

export default function SSHSettings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SSHConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string; info?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单状态
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: 22,
    username: "root",
    authType: "password" as "password" | "privateKey",
    password: "",
    privateKey: "",
    passphrase: "",
    connectTimeout: 10,
  });

  const fetchConfigs = async () => {
    try {
      const res = await fetch("/api/ssh/configs", { credentials: "include" });
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch (err) {
      toast({ title: "加载失败", description: "无法获取 SSH 配置列表", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      host: "",
      port: 22,
      username: "root",
      authType: "password",
      password: "",
      privateKey: "",
      passphrase: "",
      connectTimeout: 10,
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.host || !form.username) {
      toast({ title: "请填写必填项", description: "名称、主机地址和用户名不能为空", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/ssh/configs/${editingId}` : "/api/ssh/configs";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: editingId ? "更新成功" : "创建成功" });
      resetForm();
      fetchConfigs();
    } catch (err: any) {
      toast({ title: "保存失败", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此 SSH 配置吗？")) return;
    try {
      await fetch(`/api/ssh/configs/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "已删除" });
      fetchConfigs();
    } catch (err: any) {
      toast({ title: "删除失败", description: err.message, variant: "destructive" });
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/ssh/configs/${id}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setTestResult({ id, ...data });
    } catch (err: any) {
      setTestResult({ id, success: false, message: err.message });
    } finally {
      setTestingId(null);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await fetch(`/api/ssh/configs/${id}/set-default`, {
        method: "POST",
        credentials: "include",
      });
      toast({ title: "已设为默认配置" });
      fetchConfigs();
    } catch (err: any) {
      toast({ title: "设置失败", description: err.message, variant: "destructive" });
    }
  };

  const handleEdit = (config: SSHConfigItem) => {
    setForm({
      name: config.name,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      password: "",
      privateKey: "",
      passphrase: "",
      connectTimeout: config.connectTimeout,
    });
    setEditingId(config.id);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/system-settings")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SSH / VPS 配置</h1>
            <p className="text-sm text-gray-500 mt-1">管理远程服务器连接，供 Agent 执行命令和编辑文件</p>
          </div>
        </div>

        {/* 添加按钮 */}
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="mb-4">
            <Plus className="h-4 w-4 mr-2" /> 添加 SSH 配置
          </Button>
        )}

        {/* 表单 */}
        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">{editingId ? "编辑 SSH 配置" : "新增 SSH 配置"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>配置名称 *</Label>
                  <Input
                    placeholder="如：生产服务器"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>主机地址 *</Label>
                  <Input
                    placeholder="如：192.168.1.100"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                  />
                </div>
                <div>
                  <Label>端口</Label>
                  <Input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })}
                  />
                </div>
                <div>
                  <Label>用户名 *</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </div>
                <div>
                  <Label>连接超时（秒）</Label>
                  <Input
                    type="number"
                    value={form.connectTimeout}
                    onChange={(e) => setForm({ ...form, connectTimeout: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>

              {/* 认证方式 */}
              <div>
                <Label className="mb-2 block">认证方式</Label>
                <div className="flex gap-4">
                  <Button
                    variant={form.authType === "password" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm({ ...form, authType: "password" })}
                  >
                    <Lock className="h-4 w-4 mr-1" /> 密码
                  </Button>
                  <Button
                    variant={form.authType === "privateKey" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm({ ...form, authType: "privateKey" })}
                  >
                    <Key className="h-4 w-4 mr-1" /> 密钥
                  </Button>
                </div>
              </div>

              {form.authType === "password" ? (
                <div>
                  <Label>登录密码</Label>
                  <Input
                    type="password"
                    placeholder="输入 SSH 密码"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  {editingId && <p className="text-xs text-gray-400 mt-1">留空表示不修改密码</p>}
                </div>
              ) : (
                <>
                  <div>
                    <Label>私钥内容</Label>
                    <Textarea
                      placeholder="粘贴 SSH 私钥内容（-----BEGIN OPENSSH PRIVATE KEY-----...）"
                      rows={5}
                      value={form.privateKey}
                      onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label>私钥密码短语（可选）</Label>
                    <Input
                      type="password"
                      placeholder="如果私钥有密码保护，请输入"
                      value={form.passphrase}
                      onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {editingId ? "更新" : "保存"}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" /> 取消
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 配置列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : configs.length === 0 && !showForm ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-400">
              <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>暂无 SSH 配置</p>
              <p className="text-sm mt-1">点击上方按钮添加远程服务器连接</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <Card key={config.id} className={`${!config.isActive ? "opacity-60" : ""}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config.isDefault ? "bg-blue-100" : "bg-gray-100"}`}>
                        <Server className={`h-5 w-5 ${config.isDefault ? "text-blue-600" : "text-gray-500"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{config.name}</span>
                          {config.isDefault && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">默认</span>
                          )}
                          {!config.isActive && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">已禁用</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {config.username}@{config.host}:{config.port}
                          <span className="ml-2 text-xs">
                            {config.authType === "password" ? "🔑 密码" : "🔐 密钥"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* 测试结果 */}
                      {testResult?.id === config.id && (
                        <div className={`flex items-center gap-1 mr-2 text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                          {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                          <span className="max-w-[200px] truncate">{testResult.message}</span>
                        </div>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTest(config.id)}
                        disabled={testingId === config.id}
                      >
                        {testingId === config.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(config.id)}
                        title={config.isDefault ? "当前为默认" : "设为默认"}
                      >
                        {config.isDefault ? (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        ) : (
                          <StarOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(config)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(config.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {/* 测试详情 */}
                  {testResult?.id === config.id && testResult.info && (
                    <div className="mt-3 p-2 bg-gray-50 rounded text-xs font-mono text-gray-600 whitespace-pre-wrap">
                      {testResult.info}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
