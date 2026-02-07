import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Settings as SettingsIcon, User, Shield, Server, Plus, Trash2, Edit, Key } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

interface SystemConfig {
  panel_name: string;
  panel_url: string;
  allow_registration: boolean;
  require_email_verification: boolean;
  session_timeout: number;
  max_login_attempts: number;
}

interface UserInfo {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login: string;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    panel_name: 'UniProxy Panel',
    panel_url: '',
    allow_registration: false,
    require_email_verification: false,
    session_timeout: 3600,
    max_login_attempts: 5,
  });
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);

  // 创建用户表单
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    role: 'user',
  });

  // 修改密码表单
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    fetchSystemConfig();
    fetchUsers();
  }, []);

  const fetchSystemConfig = async () => {
    try {
      const response = await api.get('/system/config');
      if (response.data.config) {
        setSystemConfig(response.data.config);
      }
    } catch (error) {
      toast.error(`获取系统配置失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data.users || []);
    } catch (error) {
      toast.error(`获取用户列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleSaveSystemConfig = async () => {
    try {
      await api.post('/system/config', systemConfig);
      toast.success('系统配置保存成功');
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
      await api.post('/users', newUser);
      toast.success('用户创建成功');
      setCreateUserDialogOpen(false);
      setNewUser({ username: '', password: '', email: '', role: 'user' });
      fetchUsers();
    } catch (error) {
      toast.error(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('确定要删除此用户吗?')) return;

    try {
      await api.delete(`/users/${id}`);
      toast.success('用户删除成功');
      fetchUsers();
    } catch (error) {
      toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleToggleUserStatus = async (id: number, isActive: boolean) => {
    try {
      await api.patch(`/users/${id}`, { is_active: !isActive });
      toast.success(`用户已${isActive ? '禁用' : '启用'}`);
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
      await api.post('/auth/change-password', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      toast.success('密码修改成功,请重新登录');
      setChangePasswordDialogOpen(false);
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      // 清除token并跳转到登录页
      localStorage.removeItem('token');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (error) {
      toast.error(`修改失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const getRoleBadge = (role: string) => {
    const roleMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      admin: { label: '管理员', variant: 'default' },
      user: { label: '普通用户', variant: 'secondary' },
    };
    const roleInfo = roleMap[role] || { label: role, variant: 'outline' };
    return <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
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
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">基本设置</h3>
            <div className="space-y-4">
              <div>
                <Label>面板名称</Label>
                <Input
                  value={systemConfig.panel_name}
                  onChange={(e) => setSystemConfig({ ...systemConfig, panel_name: e.target.value })}
                  placeholder="UniProxy Panel"
                />
              </div>
              <div>
                <Label>面板URL</Label>
                <Input
                  value={systemConfig.panel_url}
                  onChange={(e) => setSystemConfig({ ...systemConfig, panel_url: e.target.value })}
                  placeholder="https://panel.example.com"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>允许用户注册</Label>
                  <p className="text-sm text-muted-foreground">开启后,新用户可以自行注册账号</p>
                </div>
                <Switch
                  checked={systemConfig.allow_registration}
                  onCheckedChange={(checked) => setSystemConfig({ ...systemConfig, allow_registration: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>邮箱验证</Label>
                  <p className="text-sm text-muted-foreground">要求新用户验证邮箱后才能使用</p>
                </div>
                <Switch
                  checked={systemConfig.require_email_verification}
                  onCheckedChange={(checked) => setSystemConfig({ ...systemConfig, require_email_verification: checked })}
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveSystemConfig}>保存配置</Button>
          </div>
        </TabsContent>

        {/* 用户管理 */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
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
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="user">普通用户</option>
                      <option value="admin">管理员</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setCreateUserDialogOpen(false)}>取消</Button>
                    <Button onClick={handleCreateUser}>创建</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {users.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无用户</h3>
              <p className="text-muted-foreground mb-4">创建第一个用户</p>
              <Button onClick={() => setCreateUserDialogOpen(true)}>创建用户</Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {users.map((user) => (
                <Card key={user.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-lg">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{user.username}</h3>
                          {getRoleBadge(user.role)}
                          {!user.is_active && <Badge variant="destructive">已禁用</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          创建于: {new Date(user.created_at).toLocaleString()} | 
                          最后登录: {user.last_login ? new Date(user.last_login).toLocaleString() : '从未登录'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                      >
                        {user.is_active ? '禁用' : '启用'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 安全设置 */}
        <TabsContent value="security" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">安全策略</h3>
            <div className="space-y-4">
              <div>
                <Label>会话超时时间 (秒)</Label>
                <Input
                  type="number"
                  value={systemConfig.session_timeout}
                  onChange={(e) => setSystemConfig({ ...systemConfig, session_timeout: parseInt(e.target.value) || 3600 })}
                  placeholder="3600"
                />
                <p className="text-sm text-muted-foreground mt-1">用户无操作后自动退出的时间</p>
              </div>
              <div>
                <Label>最大登录尝试次数</Label>
                <Input
                  type="number"
                  value={systemConfig.max_login_attempts}
                  onChange={(e) => setSystemConfig({ ...systemConfig, max_login_attempts: parseInt(e.target.value) || 5 })}
                  placeholder="5"
                />
                <p className="text-sm text-muted-foreground mt-1">超过此次数后将锁定账户</p>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveSystemConfig}>保存配置</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
