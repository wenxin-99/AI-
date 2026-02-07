import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Upload, Plus, Trash2, Shield, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

interface Certificate {
  id: number;
  name: string;
  domain: string;
  cert_path: string;
  key_path: string;
  issuer: string;
  not_before: string;
  not_after: string;
  days_left: number;
  auto_renew: boolean;
  type: string;
  status: string;
  created_at: string;
}

export default function Certificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);


  // 上传表单
  const [uploadForm, setUploadForm] = useState({
    name: '',
    cert_data: '',
    key_data: '',
  });

  // 生成表单
  const [generateForm, setGenerateForm] = useState({
    name: '',
    domain: '',
  });

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      const response = await api.get('/certificates');
      setCertificates(response.data.certificates || []);
    } catch (error) {
      toast({
        title: '获取证书列表失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.name || !uploadForm.cert_data || !uploadForm.key_data) {
      toast({
        title: '请填写完整信息',
        variant: 'destructive',
      });
      return;
    }

    try {
      await api.post('/certificates/upload', uploadForm);
      toast({
        title: '证书上传成功',
      });
      setUploadDialogOpen(false);
      setUploadForm({ name: '', cert_data: '', key_data: '' });
      fetchCertificates();
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  const handleGenerate = async () => {
    if (!generateForm.name || !generateForm.domain) {
      toast({
        title: '请填写完整信息',
        variant: 'destructive',
      });
      return;
    }

    try {
      await api.post('/certificates/generate', generateForm);
      toast({
        title: '自签名证书生成成功',
      });
      setGenerateDialogOpen(false);
      setGenerateForm({ name: '', domain: '' });
      fetchCertificates();
    } catch (error) {
      toast({
        title: '生成失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此证书吗?')) return;

    try {
      await api.delete(`/certificates/${id}`);
      toast({
        title: '证书删除成功',
      });
      fetchCertificates();
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string, daysLeft: number) => {
    if (status === 'expired') {
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />已过期</Badge>;
    }
    if (status === 'expiring') {
      return <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600"><AlertCircle className="h-3 w-3" />{daysLeft}天后过期</Badge>;
    }
    return <Badge variant="outline" className="gap-1 border-green-500 text-green-600"><CheckCircle className="h-3 w-3" />正常</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, string> = {
      uploaded: '已上传',
      self_signed: '自签名',
      letsencrypt: "Let's Encrypt",
    };
    return <Badge variant="secondary">{typeMap[type] || type}</Badge>;
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
            证书管理
          </h1>
          <p className="text-muted-foreground mt-1">管理TLS/SSL证书,用于Xray和Gost的加密传输</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                上传证书
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>上传TLS证书</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>证书名称</Label>
                  <Input
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    placeholder="例如: example.com"
                  />
                </div>
                <div>
                  <Label>证书内容 (PEM格式)</Label>
                  <Textarea
                    value={uploadForm.cert_data}
                    onChange={(e) => setUploadForm({ ...uploadForm, cert_data: e.target.value })}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label>私钥内容 (PEM格式)</Label>
                  <Textarea
                    value={uploadForm.key_data}
                    onChange={(e) => setUploadForm({ ...uploadForm, key_data: e.target.value })}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>取消</Button>
                  <Button onClick={handleUpload}>上传</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                生成自签名证书
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>生成自签名证书</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>证书名称</Label>
                  <Input
                    value={generateForm.name}
                    onChange={(e) => setGenerateForm({ ...generateForm, name: e.target.value })}
                    placeholder="例如: test-cert"
                  />
                </div>
                <div>
                  <Label>域名</Label>
                  <Input
                    value={generateForm.domain}
                    onChange={(e) => setGenerateForm({ ...generateForm, domain: e.target.value })}
                    placeholder="例如: example.com"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  自签名证书有效期为1年,仅用于测试环境。生产环境请使用正式证书。
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>取消</Button>
                  <Button onClick={handleGenerate}>生成</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 证书列表 */}
      {certificates.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">暂无证书</h3>
          <p className="text-muted-foreground mb-4">上传或生成证书以启用TLS加密</p>
          <Button onClick={() => setUploadDialogOpen(true)}>上传证书</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {certificates.map((cert) => (
            <Card key={cert.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <Shield className="h-5 w-5 text-blue-500" />
                    <h3 className="text-lg font-semibold">{cert.name}</h3>
                    {getTypeBadge(cert.type)}
                    {getStatusBadge(cert.status, cert.days_left)}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">域名:</span>
                      <span className="ml-2 font-medium">{cert.domain}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">颁发者:</span>
                      <span className="ml-2 font-medium">{cert.issuer}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">生效时间:</span>
                      <span className="ml-2">{new Date(cert.not_before).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">过期时间:</span>
                      <span className="ml-2">{new Date(cert.not_after).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">证书文件:</span>
                      <span className="ml-2 text-xs font-mono">{cert.cert_path}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">私钥文件:</span>
                      <span className="ml-2 text-xs font-mono">{cert.key_path}</span>
                    </div>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(cert.id)}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
