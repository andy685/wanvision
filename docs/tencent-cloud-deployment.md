# 万影工坊腾讯云部署说明

## 推荐拓扑

首版建议使用腾讯云 CVM + 云数据库 MySQL + 腾讯云 COS：

```text
用户
  -> HTTPS / 域名
  -> 腾讯云 CVM（Docker Compose）
       -> 万影工坊前后端
       -> MySQL / Redis
       -> 腾讯云 COS（图片、视频、上传素材）
```

用户量和异步任务量增加后，再将应用和 Worker 迁移到 TKE；业务代码不依赖具体计算产品。

## 必要环境变量

```env
NODE_ENV=production
PORT=5679
DATABASE_URL=mysql://user:password@cdb-host:3306/huobao_drama
FRONTEND_ORIGIN=https://wanying.example.com
ADMIN_ORIGIN=https://admin.wanying.example.com
NUXT_PUBLIC_APP_ORIGIN=https://wanying.example.com
NUXT_PUBLIC_ADMIN_ORIGIN=https://admin.wanying.example.com
NUXT_PUBLIC_API_BASE=https://api.wanying.example.com/api/v1

COS_SECRET_ID=腾讯云密钥 ID
COS_SECRET_KEY=腾讯云密钥 Key
COS_BUCKET=bucket-name-1250000000
COS_REGION=ap-guangzhou
COS_PREFIX=wanying
API_KEY_ENCRYPTION_SECRET=随机生成的高强度密钥

ADMIN_PHONE=管理员手机号
WECHAT_MCH_ID=微信商户号
WECHAT_APP_ID=微信支付应用 AppID
WECHAT_API_V3_KEY=微信 API v3 密钥
WECHAT_SERIAL_NO=微信商户证书序列号
WECHAT_PRIVATE_KEY=微信商户 API 证书私钥
WECHAT_PLATFORM_PUBLIC_KEY=微信支付平台证书公钥
WECHAT_WEBHOOK_SECRET=微信回调签名密钥
ALIPAY_APP_ID=支付宝应用 ID
ALIPAY_PRIVATE_KEY=支付宝应用私钥
ALIPAY_PUBLIC_KEY=支付宝公钥
ALIPAY_RETURN_URL=https://your-domain.com/credits
PAYMENT_NOTIFY_URL=https://your-domain.com/api/v1/recharge/webhooks
ADMIN_PHONE=平台超管手机号
ADMIN_PASSWORD=平台超管密码
ALIPAY_WEBHOOK_SECRET=支付宝回调签名密钥
```

## COS 权限

建议创建专用子账号，只授予目标存储桶权限：

- `PutObject`
- `GetObject`
- `DeleteObject`
- `HeadObject`

COS 存储桶默认不公开读，应用通过临时签名链接提供预览和下载。

## 部署步骤

1. 创建腾讯云 CDB MySQL 实例和数据库。
2. 创建 COS 存储桶，记录桶名称和地域。
3. 创建腾讯云密钥，并限制到该 COS 存储桶。
4. 准备生产环境变量文件，不将密钥提交到 Git。
5. 在 CVM 安装 Docker 和 Docker Compose。
6. 拉取代码并执行 `docker compose up -d --build`。
7. 配置用户端域名、管理后台域名、HTTPS 和安全组，只开放 80/443；管理后台域名不要和用户端域名混用。
8. 配置支付平台回调地址：`/api/v1/recharge/webhooks/wechat` 和 `/api/v1/recharge/webhooks/alipay`。
9. 使用 `GET /api/v1/health` 检查服务状态。
10. 打开独立管理后台域名，使用 `ADMIN_PHONE` / `ADMIN_PASSWORD` 登录并配置 AI 服务、价格和支付渠道。

## 上线检查

- 数据库只允许应用服务器访问。
- COS 不开放公共写权限。
- API Key、支付密钥和数据库密码只存在环境变量或密钥管理服务中。
- 定期备份 CDB 数据库。
- 配置 CVM 磁盘、CPU、内存和应用日志告警。
- 配置 Worker 并发上限，避免 AI 调用超过供应商配额。
- 支付回调必须使用 HTTPS，并验证签名和订单状态。
- 发布前完成注册、积分、充值订单、AI 失败退款和文件下载测试。
