import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings as SettingsIcon, User, Shield, Server, Plus, Trash2, Edit, Key, RefreshCw, Info, Users, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

interface SystemSettings {
  server: {
    port: number;
    base_path: string;
    log_level: string;
  };
  security: {
    jwt_expire_hour: number;
    two_factor_name: string;
  };
}

interface SystemInfo {
  panel_name: string;
  panel_version: string;
  os: string;
  arch: string;
  go_version: string;
  cpu_cores: number;
  xray_enabled: boolean;
  gost_enabled: boolean;
  memory: {
    alloc: number;
    sys: number;
    total_alloc: number;
  };
}

interface UserInfo {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  enabled: boolean;
  is_admin: boolean;
  traffic_limit: number;
  traffic_used: number;
  two_factor_enabled: boolean;
  expire_time: string | null;
  created_at: string;
  updated_at: string;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);

  // 创建用户表单
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    role: 'user',
  });

  // 编辑用户表单
  const [editForm, setEditForm] = useState({
    email: '',
    role: 'user',
    enabled: true,
    traffic_limit: 0,
    password: '',
    expire_time: '' as string,
  });

  // 修改密码表单
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchSystemSettings(), fetchSystemInfo(), fetchUsers()]);
    setLoading(false);
  };

  const fetchSystemSettings = async () => {
    try {
      const response: any = await api.get('/api/v1/system/settings');
      const data = response?.data || response;
      if (data) setSystemSettings(data);
    } catch (error) {
      // settings might not be available
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const response: any = await api.get('/api/v1/system/info');
      const data = response?.data || response;
      if (data) setSystemInfo(data);
    } catch (error) {
      // info might not be available
    }
  };

  const fetchUsers = async () => {
    try {
      const response: any = await api.get('/api/v1/users?page=1&page_size=100');
      const data = response?.data || response;
      setUsers(data?.users || []);
      setUsersTotal(data?.total || 0);
    } catch (error) {
      toast.error(`获取用户列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await api.put('/api/v1/system/settings', systemSettings);
      toast.success('系统设置已保存');
    } catch (error) {
      toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.email) {
      toast.error('请填写完整信息');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('密码长度至少6位');
      return;
    }
    try {
      await api.post('/api/v1/users', newUser);
      toast.success('用户创建成功');
      setCreateUserDialogOpen(false);
      setNewUser({ username: '', password: '', email: '', role: 'user' });
      fetchUsers();
    } catch (error) {
      toast.error(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleEditUser = (user: UserInfo) => {
    setEditingUser(user);
    setEditForm({
      email: user.email,
      role: user.role,
      enabled: user.enabled,
      traffic_limit: user.traffic_limit,
      password: '',
      expire_time: user.expire_time ? new Date(user.expire_time).toISOString().slice(0, 16) : '',
    });
    setEditUserDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    try {
      const payload: any = {
        email: editForm.email,
        role: editForm.role,
        enabled: editForm.enabled,
        traffic_limit: editForm.traffic_limit,
      };
      if (editForm.password) {
        payload.password = editForm.password;
      }
      // 处理到期时间
      if (editForm.expire_time) {
        payload.expire_time = new Date(editForm.expire_time).toISOString();
      } else {
        payload.expire_time = ''; // 空字符串表示清除到期时间
      }
      await api.put(`/api/v1/users/${editingUser.id}`, payload);
      toast.success('用户更新成功');
      setEditUserDialogOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(`更新失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗?`)) return;
    try {
      await api.delete(`/api/v1/users/${id}`);
      toast.success('用户删除成功');
      fetchUsers();
    } catch (error) {
      toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleToggleUser = async (user: UserInfo) => {
    try {
      await api.put(`/api/v1/users/${user.id}`, { enabled: !user.enabled });
      toast.success(`用户已${user.enabled ? '禁用' : '启用'}`);
      fetchUsers();
    } catch (error) {
      toast.error(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.old_password || !passwordForm.new_password || !passwordForm.confirm_password) {
      toast.error('请填写完整信息');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('两次输入的密码不一致');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      toast.error('新密码长度至少6位');
      return;
    }
    try {
      await api.put('/api/v1/auth/profile', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      toast.success('密码修改成功,请重新登录');
      setChangePasswordDialogOpen(false);
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      localStorage.removeItem('token');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || '修改失败';
      toast.error(msg);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "无限制";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  };

  const getRoleBadge = (role: string) => {
    if (role === 'admin') return <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0">管理员</Badge>;
    return <Badge variant="secondary">普通用户</Badge>;
  };

  const getStatusBadge = (user: UserInfo) => {
    if (!user.enabled) return <Badge variant="destructive">已禁用</Badge>;
    // 检查是否已过期
    if (user.expire_time && new Date(user.expire_time) < new Date()) {
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">已过期</Badge>;
    }
    if (user.status === 'active') return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">活跃</Badge>;
    return <Badge variant="outline">{user.status}</Badge>;
  };

  const formatExpireTime = (expireTime: string | null) => {
    if (!expireTime) return '永不过期';
    const date = new Date(expireTime);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (diffDays < 0) return `${dateStr} (已过期 ${Math.abs(diffDays)} 天)`;
    if (diffDays <= 7) return `${dateStr} (${diffDays} 天后过期)`;
    return dateStr;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页头 */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              系统设置
            </h1>
            <p className="text-muted-foreground mt-1">管理系统配置、用户和安全设置</p>
          </div>
          <Dialog open={changePasswordDialogOpen} onOpenChange={setChangePasswordDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Key className="h-4 w-4" />
                修改密码
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>修改密码</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>当前密码</Label>
                  <Input
                    type="password"
                    value={passwordForm.old_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                    placeholder="请输入当前密码"
                  />
                </div>
                <div>
                  <Label>新密码</Label>
                  <Input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                    placeholder="至少6位"
                  />
                </div>
                <div>
                  <Label>确认新密码</Label>
                  <Input
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                    placeholder="再次输入新密码"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setChangePasswordDialogOpen(false)}>取消</Button>
                  <Button onClick={handleChangePassword}>确认修改</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* 设置标签页 */}
        <Tabs defaultValue="system" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="system" className="gap-2">
              <Server className="h-4 w-4" />
              系统配置
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <User className="h-4 w-4" />
              用户管理
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              安全设置
            </TabsTrigger>
          </TabsList>

          {/* 系统配置 */}
          <TabsContent value="system" className="space-y-4">
            {/* 系统信息卡片 */}
            {systemInfo && (
              <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Info className="h-5 w-5 text-cyan-400" />
                  系统信息
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">面板版本</p>
                    <p className="font-medium">{systemInfo.panel_version}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">操作系统</p>
                    <p className="font-medium">{systemInfo.os}/{systemInfo.arch}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Go 版本</p>
                    <p className="font-medium">{systemInfo.go_version}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">CPU 核心</p>
                    <p className="font-medium">{systemInfo.cpu_cores} 核</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">内存使用</p>
                    <p className="font-medium">{(systemInfo.memory.alloc / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">系统内存</p>
                    <p className="font-medium">{(systemInfo.memory.sys / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Xray 引擎</p>
                    <p className="font-medium">{systemInfo.xray_enabled ? "✅ 已启用" : "❌ 未启用"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Gost 引擎</p>
                    <p className="font-medium">{systemInfo.gost_enabled ? "✅ 已启用" : "❌ 未启用"}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* 服务器设置 */}
            {systemSettings && (
              <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
                <h3 className="text-lg font-semibold mb-4">服务器设置</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>监听端口</Label>
                      <Input
                        type="number"
                        value={systemSettings.server.port}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          server: { ...systemSettings.server, port: parseInt(e.target.value) || 8080 }
                        })}
                        placeholder="8080"
                      />
                    </div>
                    <div>
                      <Label>基础路径</Label>
                      <Input
                        value={systemSettings.server.base_path}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          server: { ...systemSettings.server, base_path: e.target.value }
                        })}
                        placeholder="/"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>日志级别</Label>
                    <Select
                      value={systemSettings.server.log_level}
                      onValueChange={(v) => setSystemSettings({
                        ...systemSettings,
                        server: { ...systemSettings.server, log_level: v }
                      })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debug">Debug</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warn">Warn</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSaveSettings} className="gap-2">
                保存配置
              </Button>
            </div>
          </TabsContent>

          {/* 用户管理 */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                共 {usersTotal} 个用户
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchUsers} className="gap-1">
                  <RefreshCw className="h-3.5 w-3.5" />
                  刷新
                </Button>
                <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      创建用户
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>创建新用户</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>用户名</Label>
                        <Input
                          value={newUser.username}
                          onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                          placeholder="请输入用户名"
                        />
                      </div>
                      <div>
                        <Label>邮箱</Label>
                        <Input
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          placeholder="user@example.com"
                        />
                      </div>
                      <div>
                        <Label>密码</Label>
                        <Input
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="至少6位"
                        />
                      </div>
                      <div>
                        <Label>角色</Label>
                        <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">普通用户</SelectItem>
                            <SelectItem value="admin">管理员</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setCreateUserDialogOpen(false)}>取消</Button>
                        <Button onClick={handleCreateUser}>创建</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* 编辑用户对话框 */}
            <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>编辑用户: {editingUser?.username}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>邮箱</Label>
                    <Input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>角色</Label>
                    <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">普通用户</SelectItem>
                        <SelectItem value="admin">管理员</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>流量限制 (字节，0 = 无限制)</Label>
                    <Input
                      type="number"
                      value={editForm.traffic_limit}
                      onChange={(e) => setEditForm({ ...editForm, traffic_limit: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      常用: 10GB = 10737418240, 100GB = 107374182400
                    </p>
                  </div>
                  <div>
                    <Label>重置密码 (留空则不修改)</Label>
                    <Input
                      type="password"
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      placeholder="输入新密码"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" />到期时间</Label>
                    <Input
                      type="datetime-local"
                      value={editForm.expire_time}
                      onChange={(e) => setEditForm({ ...editForm, expire_time: e.target.value })}
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground flex-1">留空表示永不过期</p>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => {
                            const d = new Date();
                            d.setMonth(d.getMonth() + 1);
                            setEditForm({ ...editForm, expire_time: d.toISOString().slice(0, 16) });
                          }}
                        >+1月</Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => {
                            const d = new Date();
                            d.setMonth(d.getMonth() + 3);
                            setEditForm({ ...editForm, expire_time: d.toISOString().slice(0, 16) });
                          }}
                        >+3月</Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => {
                            const d = new Date();
                            d.setFullYear(d.getFullYear() + 1);
                            setEditForm({ ...editForm, expire_time: d.toISOString().slice(0, 16) });
                          }}
                        >+1年</Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2 text-red-400"
                          onClick={() => setEditForm({ ...editForm, expire_time: '' })}
                        >清除</Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>启用状态</Label>
                    <Switch
                      checked={editForm.enabled}
                      onCheckedChange={(checked) => setEditForm({ ...editForm, enabled: checked })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>取消</Button>
                    <Button onClick={handleSaveUser}>保存</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
              </div>
            ) : users.length === 0 ? (
              <Card className="p-12 text-center border-dashed bg-card/40 backdrop-blur-xl border-white/10">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">暂无用户</h3>
                <p className="text-muted-foreground mb-4">创建第一个用户</p>
                <Button onClick={() => setCreateUserDialogOpen(true)}>创建用户</Button>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">用户</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">角色</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">状态</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">流量</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">到期时间</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">创建时间</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{user.username}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">{getRoleBadge(user.role)}</td>
                        <td className="py-3 px-4">{getStatusBadge(user)}</td>
                        <td className="py-3 px-4">
                          <div className="text-sm">
                            <span className="font-medium">{formatBytes(user.traffic_used)}</span>
                            {user.traffic_limit > 0 && (
                              <span className="text-muted-foreground"> / {formatBytes(user.traffic_limit)}</span>
                            )}
                          </div>
                          {user.traffic_limit > 0 && (
                            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full"
                                style={{ width: `${Math.min((user.traffic_used / user.traffic_limit) * 100, 100)}%` }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm">
                            <span className={user.expire_time && new Date(user.expire_time) < new Date() ? 'text-orange-400' : 'text-muted-foreground'}>
                              {formatExpireTime(user.expire_time)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditUser(user)}
                              title="编辑"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleUser(user)}
                              title={user.enabled ? '禁用' : '启用'}
                            >
                              <Shield className={`h-3.5 w-3.5 ${user.enabled ? 'text-green-400' : 'text-red-400'}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => handleDeleteUser(user.id, user.username)}
                              title="删除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* 安全设置 */}
          <TabsContent value="security" className="space-y-4">
            <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
              <h3 className="text-lg font-semibold mb-4">JWT 认证设置</h3>
              <div className="space-y-4">
                <div>
                  <Label>Token 有效期 (小时)</Label>
                  <Input
                    type="number"
                    value={systemSettings?.security?.jwt_expire_hour || 24}
                    onChange={(e) => systemSettings && setSystemSettings({
                      ...systemSettings,
                      security: { ...systemSettings.security, jwt_expire_hour: parseInt(e.target.value) || 24 }
                    })}
                    placeholder="24"
                  />
                  <p className="text-sm text-muted-foreground mt-1">JWT Token 的有效时间，过期后需要重新登录</p>
                </div>
                <div>
                  <Label>两步验证名称</Label>
                  <Input
                    value={systemSettings?.security?.two_factor_name || 'UniProxy Panel'}
                    onChange={(e) => systemSettings && setSystemSettings({
                      ...systemSettings,
                      security: { ...systemSettings.security, two_factor_name: e.target.value }
                    })}
                    placeholder="UniProxy Panel"
                  />
                  <p className="text-sm text-muted-foreground mt-1">在 TOTP 验证器中显示的名称</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
              <h3 className="text-lg font-semibold mb-4">密码安全</h3>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  密码使用 bcrypt 算法加密存储，支持两步验证 (TOTP)。
                </p>
                <Button variant="outline" onClick={() => setChangePasswordDialogOpen(true)} className="gap-2">
                  <Key className="h-4 w-4" />
                  修改当前账户密码
                </Button>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSaveSettings}>保存安全设置</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
