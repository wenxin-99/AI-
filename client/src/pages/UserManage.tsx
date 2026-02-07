/*
 * Design: Glassmorphism dark theme with cyan-purple gradient accents.
 * Layout: Flat structure - stats row → toolbar → table → pagination.
 * Typography: Outfit headings, Inter body, Fira Code mono.
 */
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Users,
  UserPlus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Clock,
  Activity,
  Download,
  ArrowUpDown,
} from "lucide-react";
import {
  userService,
  User,
  UserStats,
  CreateUserRequest,
  UpdateUserRequest,
} from "@/services/user";
import { toast } from "sonner";

// 格式化流量
function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
}

// 格式化日期
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "永不过期";
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// 判断是否已过期
function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function UserManage() {
  // 用户列表
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  // 过滤和搜索
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // 统计
  const [stats, setStats] = useState<UserStats | null>(null);

  // 选中项
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 对话框
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // 表单
  const [formData, setFormData] = useState<CreateUserRequest>({
    username: "",
    password: "",
    email: "",
    role: "user",
    traffic_limit: 0,
    expire_time: "",
  });
  const [editFormData, setEditFormData] = useState<UpdateUserRequest>({});

  // 加载用户列表
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter !== "all") params.status = statusFilter;
      if (roleFilter !== "all") params.role = roleFilter;

      const res = await userService.getUsers(params);
      setUsers(res.users || []);
      setTotal(res.total || 0);
    } catch {
      toast.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, roleFilter, sortBy, sortOrder]);

  // 加载统计
  const fetchStats = useCallback(async () => {
    try {
      const s = await userService.getStats();
      setStats(s);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 搜索防抖
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 创建用户
  const handleCreate = async () => {
    if (!formData.username || !formData.password) {
      toast.error("用户名和密码不能为空");
      return;
    }
    try {
      const data: any = { ...formData };
      // 转换流量限制为字节 (输入为GB)
      if (data.traffic_limit) {
        data.traffic_limit = data.traffic_limit * 1024 * 1024 * 1024;
      }
      if (data.expire_time) {
        data.expire_time = new Date(data.expire_time).toISOString();
      } else {
        delete data.expire_time;
      }
      await userService.createUser(data);
      toast.success("用户创建成功");
      setCreateOpen(false);
      setFormData({
        username: "",
        password: "",
        email: "",
        role: "user",
        traffic_limit: 0,
        expire_time: "",
      });
      fetchUsers();
      fetchStats();
    } catch {
      toast.error("创建失败");
    }
  };

  // 编辑用户
  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      email: user.email,
      role: user.role,
      traffic_limit: user.traffic_limit,
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    try {
      const data: any = { ...editFormData };
      if (data.traffic_limit !== undefined && data.traffic_limit !== editingUser.traffic_limit) {
        // 如果用户输入的是GB，转换
        if (data.traffic_limit < 1024 * 1024) {
          data.traffic_limit = data.traffic_limit * 1024 * 1024 * 1024;
        }
      }
      if (data.expire_time) {
        data.expire_time = new Date(data.expire_time).toISOString();
      }
      if (!data.password) delete data.password;
      await userService.updateUser(editingUser.id, data);
      toast.success("更新成功");
      setEditOpen(false);
      fetchUsers();
      fetchStats();
    } catch {
      toast.error("更新失败");
    }
  };

  // 删除用户
  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      await userService.deleteUser(deletingUser.id);
      toast.success("删除成功");
      setDeleteOpen(false);
      setDeletingUser(null);
      fetchUsers();
      fetchStats();
    } catch {
      toast.error("删除失败");
    }
  };

  // 切换启用/禁用
  const handleToggle = async (user: User) => {
    try {
      await userService.toggleUser(user.id);
      toast.success(user.enabled ? "已禁用" : "已启用");
      fetchUsers();
      fetchStats();
    } catch {
      toast.error("操作失败");
    }
  };

  // 重置流量
  const handleResetTraffic = async (user: User) => {
    try {
      await userService.resetTraffic(user.id);
      toast.success(`${user.username} 流量已重置`);
      fetchUsers();
    } catch {
      toast.error("重置失败");
    }
  };

  // 批量操作
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await userService.batchDelete(selectedIds);
      toast.success(`已删除 ${selectedIds.length} 个用户`);
      setSelectedIds([]);
      fetchUsers();
      fetchStats();
    } catch {
      toast.error("批量删除失败");
    }
  };

  const handleBatchResetTraffic = async () => {
    if (selectedIds.length === 0) return;
    try {
      await userService.batchResetTraffic(selectedIds);
      toast.success(`已重置 ${selectedIds.length} 个用户的流量`);
      setSelectedIds([]);
      fetchUsers();
    } catch {
      toast.error("批量重置失败");
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.length === users.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(users.map((u) => u.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // 排序切换
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);

  // 状态 badge
  const statusBadge = (user: User) => {
    if (!user.enabled) {
      return <Badge variant="destructive" className="text-xs">已禁用</Badge>;
    }
    if (isExpired(user.expire_time)) {
      return <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">已过期</Badge>;
    }
    return <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">活跃</Badge>;
  };

  // 流量进度
  const trafficProgress = (user: User) => {
    if (!user.traffic_limit || user.traffic_limit === 0) {
      return (
        <div className="text-sm">
          <span className="text-white/80">{formatBytes(user.traffic_used)}</span>
          <span className="text-white/40 ml-1">/ 无限制</span>
        </div>
      );
    }
    const pct = Math.min((user.traffic_used / user.traffic_limit) * 100, 100);
    return (
      <div className="space-y-1.5 min-w-[140px]">
        <div className="flex justify-between text-xs">
          <span className="text-white/70">{formatBytes(user.traffic_used)}</span>
          <span className="text-white/40">{formatBytes(user.traffic_limit)}</span>
        </div>
        <Progress
          value={pct}
          className="h-1.5 bg-white/10"
        />
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              用户管理
            </h1>
            <p className="text-muted-foreground mt-1">管理面板用户、流量配额和访问权限</p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            新建用户
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400/20 to-cyan-600/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_users ?? "—"}</p>
                <p className="text-xs text-muted-foreground">总用户</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.active_users ?? "—"}</p>
                <p className="text-xs text-muted-foreground">活跃用户</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-400/20 to-red-600/20 flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.disabled_users ?? "—"}</p>
                <p className="text-xs text-muted-foreground">已禁用</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400/20 to-amber-600/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.expired_users ?? "—"}</p>
                <p className="text-xs text-muted-foreground">已过期</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索用户名或邮箱..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 bg-white/5 border-white/10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-28 bg-white/5 border-white/10">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">活跃</SelectItem>
              <SelectItem value="disabled">禁用</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
            <SelectTrigger className="w-28 bg-white/5 border-white/10">
              <SelectValue placeholder="角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              <SelectItem value="admin">管理员</SelectItem>
              <SelectItem value="user">用户</SelectItem>
            </SelectContent>
          </Select>

          {/* Batch actions */}
          {selectedIds.length > 0 && (
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchResetTraffic}
                className="border-white/10 text-white/70 hover:text-white"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                重置流量 ({selectedIds.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchDelete}
                className="border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                删除 ({selectedIds.length})
              </Button>
            </div>
          )}
        </div>

        {/* User table */}
        <Card className="bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={users.length > 0 && selectedIds.length === users.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort("username")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      用户名
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort("traffic_used")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      流量使用
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>到期时间</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead className="w-10">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Activity className="w-4 h-4 animate-spin" />
                        加载中...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      暂无用户数据
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow
                      key={user.id}
                      className="border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(user.id)}
                          onCheckedChange={() => toggleSelect(user.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400/30 to-purple-500/30 flex items-center justify-center text-xs font-bold text-white/80 shrink-0">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-white">{user.username}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-white/60 text-sm">
                        {user.email || "—"}
                      </TableCell>
                      <TableCell>
                        {user.role === "admin" ? (
                          <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                            管理员
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                            用户
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(user)}</TableCell>
                      <TableCell>{trafficProgress(user)}</TableCell>
                      <TableCell className="text-sm">
                        <span className={isExpired(user.expire_time) ? "text-amber-400" : "text-white/60"}>
                          {formatDate(user.expire_time)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={user.enabled}
                          onCheckedChange={() => handleToggle(user)}
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openEdit(user)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetTraffic(user)}>
                              <RotateCcw className="w-3.5 h-3.5 mr-2" />
                              重置流量
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggle(user)}>
                              {user.enabled ? (
                                <>
                                  <ShieldOff className="w-3.5 h-3.5 mr-2" />
                                  禁用
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="w-3.5 h-3.5 mr-2" />
                                  启用
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400 focus:text-red-300"
                              onClick={() => {
                                setDeletingUser(user);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
              <p className="text-sm text-muted-foreground">
                共 {total} 个用户，第 {page}/{totalPages} 页
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= totalPages - 2) {
                    p = totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(p)}
                      className={
                        p === page
                          ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
                          : "border-white/10"
                      }
                    >
                      {p}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="border-white/10"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Create user dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新建用户</DialogTitle>
              <DialogDescription>创建一个新的面板用户</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>用户名 *</Label>
                <Input
                  placeholder="输入用户名"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>密码 *</Label>
                <Input
                  type="password"
                  placeholder="输入密码"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>角色</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData({ ...formData, role: v })}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">用户</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>流量限制 (GB)</Label>
                  <Input
                    type="number"
                    placeholder="0 = 无限制"
                    value={formData.traffic_limit || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, traffic_limit: parseFloat(e.target.value) || 0 })
                    }
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>到期时间</Label>
                <Input
                  type="date"
                  value={formData.expire_time}
                  onChange={(e) => setFormData({ ...formData, expire_time: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-white/10">
                取消
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
              >
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit user dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>编辑用户 - {editingUser?.username}</DialogTitle>
              <DialogDescription>修改用户信息，留空的密码字段不会更改</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input
                  type="email"
                  value={editFormData.email || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>新密码（留空不修改）</Label>
                <Input
                  type="password"
                  placeholder="留空不修改"
                  value={editFormData.password || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>角色</Label>
                  <Select
                    value={editFormData.role || "user"}
                    onValueChange={(v) => setEditFormData({ ...editFormData, role: v })}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">用户</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>流量限制 (GB)</Label>
                  <Input
                    type="number"
                    placeholder="0 = 无限制"
                    value={
                      editFormData.traffic_limit
                        ? Math.round(editFormData.traffic_limit / 1024 / 1024 / 1024 * 10) / 10
                        : ""
                    }
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        traffic_limit: (parseFloat(e.target.value) || 0) * 1024 * 1024 * 1024,
                      })
                    }
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>到期时间</Label>
                <Input
                  type="date"
                  value={editFormData.expire_time || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, expire_time: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)} className="border-white/10">
                取消
              </Button>
              <Button
                onClick={handleUpdate}
                className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
              >
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm dialog */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除用户 <strong>{deletingUser?.username}</strong> 吗？此操作不可撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} className="border-white/10">
                取消
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
