# 万影工坊 · 管理后台 & 前端业务中台审计报告

> 审计时间：2026-09-09
> 审计范围：`/admin-console`（Vue 3 管理后台）、`/frontend`（Nuxt 3 用户前台）
> 结论先行：admin-console 存在较重的模板遗产与依赖冗余，frontend 体量小但 API 层和路由组织有优化空间。

---

## 一、项目概况

| 维度 | admin-console | frontend |
|---|---|---|
| 技术栈 | Vue 3 + Vite + TypeScript + Element Plus + Pinia | Nuxt 3 + Vue 3 + TypeScript + Element Plus |
| 模板来源 | vue-pure-admin 7.0.0 模板 | 自建 |
| 业务代码 | 集中在 `src/views/wanying/` | 集中在 `app/views/`、`app/composables/`、`app/pages/admin/` |
| node_modules | 1.2 GB | 345 MB |
| 打包产物 | dist 约 27 MB（已有 gzip/brotli） | 未构建 |
| 源码 Vue 行数 | views 约 24,135 行 | views 约 8,000 行 |
| 视图文件 | `wanying/index.vue` 3,869 行，`wanying/analytics.vue` 1,302 行 | 仅 `drama/detail.vue`、`drama/episode.vue` 2 个手动路由视图 |
| 源文件数 | src 共 543 个文件，其中 views 295 个、components 110 个 | app 下组件 4 个、composables 5 个、pages 7 个 |
| 入口 chunk | `static/js/index-*.js` 约 2.8 MB | `.output/public/_nuxt/index.CA59961K.css` 359 KB |

---

## 二、admin-console 优化点

### 2.1 高优先级：巨型业务组件

- `src/views/wanying/index.vue` **3,869 行**，承担平台概览、服务、支付、价格、风格、Agent、技能、用户、任务、订单、日志等 12 个页面的职责。
- `src/views/wanying/analytics.vue` **1,302 行**，嵌套在 index.vue 中作为分析看板。

**风险**：单文件维护难度高、编译热更新慢、复用率低、代码审查困难。

**建议**：
1. 按 `key`（overview/services/payments/pricing/styles/agents/skills/users/tasks/orders/logs）拆分为独立视图组件。
2. 将 index.vue 改造为 `Layout + RouterView` 的容器，仅负责导航和公共状态。
3. 提取通用表单、表格、对话框为 `wanying/components/` 下的业务组件。

### 2.2 高优先级：模板自带大量未使用依赖

`package.json`  dependencies 约 50 项，但业务实际只用到 Element Plus、ECharts、axios、pinia、vue-router 等。以下依赖大概率属于模板冗余：

| 依赖 | 用途 | 建议 |
|---|---|---|
| `@amap/amap-jsapi-loader` | 高德地图 | 未在 wanying 业务中出现，移除 |
| `@howdyjs/mouse-menu` | 鼠标右键菜单 | 模板功能，如无需求移除 |
| `@infectoone/vue-ganttastic` | 甘特图 | 未使用，移除 |
| `@logicflow/core` / `extension` | 流程图 | 未使用，移除 |
| `@vue-flow/*` | 节点流图 | 未使用，移除 |
| `@vueuse/motion` | 动画 | 未使用，移除 |
| `@wangeditor/editor*` | 富文本 | 未使用，移除 |
| `codemirror*` | 代码编辑器 | 未使用，移除 |
| `cropperjs` | 图片裁剪 | 未使用，移除 |
| `deep-chat` | AI 聊天组件 | 未使用，移除 |
| `el-table-infinite-scroll` | 表格无限滚动 | 未使用，移除 |
| `highlight.js` | 代码高亮 | 未使用，移除 |
| `intro.js` | 引导 | 未使用，移除 |
| `jsbarcode` | 条形码 | 未使用，移除 |
| `mint-filter` | 敏感词过滤 | 未使用，移除 |
| `mqtt` | 物联网消息 | 未使用，移除 |
| `pinyin-pro` | 拼音 | 未使用，移除 |
| `plus-pro-components` | 扩展组件 | 与 Element Plus 重复，移除 |
| `sortablejs` / `vuedraggable` | 拖拽 | 未使用，移除 |
| `swiper` | 轮播 | 未使用，移除 |
| `typeit` | 打字效果 | 未使用，移除 |
| `v-contextmenu` | 右键菜单 | 未使用，移除 |
| `vditor` | Markdown 编辑器 | 未使用，移除 |
| `vue-json-pretty` | JSON 展示 | 未使用，移除 |
| `vue-pdf-embed` | PDF 预览 | 未使用，移除 |
| `vue-tippy` | Tooltip | Element Plus 自带，移除 |
| `vue-virtual-scroller` | 虚拟滚动 | 未使用，移除 |
| `vue-waterfall-plugin-next` | 瀑布流 | 未使用，移除 |
| `vue3-danmaku` | 弹幕 | 未使用，移除 |
| `vue3-puzzle-vcode` | 验证码 | 未使用，移除 |
| `vxe-table` | 增强表格 | 与 Element Plus Table 重复，移除 |
| `wavesurfer.js` | 音频波形 | 未使用，移除 |
| `xgplayer` | 视频播放 | 未使用，移除 |
| `xlsx` | Excel | 未使用，移除 |

**预期收益**：依赖减少 30+ 项，node_modules 从 1.2 GB 降到 600 MB 以下，构建速度提升 20%–40%，产物体积减小。

**执行方式**：
1. 使用 `depcheck` 或 `npm-check` 扫描实际引用。
2. 逐批移除，每批 5–10 个，跑 `pnpm build` 验证。
3. 保留 `echarts`、`axios`、`dayjs`、`js-cookie`、`nprogress`、`qs` 等确实被业务使用的依赖。

### 2.3 高优先级：构建目标过旧

`vite.config.ts` 中 `build.target: "es2015"`，会引入更多 polyfill，增加产物体积。

**建议**：根据用户群体调整为 `"es2020"` 或 `"esnext"`，配合浏览器兼容性要求。

### 2.4 中优先级：chunk 大小警告阈值过高

`chunkSizeWarningLimit: 4000`（4 MB）关闭了 Vite 的 chunk 过大警告。当前 dist 27 MB，说明产物体积已经很大。

**建议**：
1. 恢复到默认值 500 KB。
2. 启用 `manualChunks` 按路由分包，参考：

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules')) {
          if (id.includes('element-plus')) return 'element-plus'
          if (id.includes('echarts')) return 'echarts'
          if (id.includes('vue') || id.includes('vue-router') || id.includes('pinia')) return 'vue-vendor'
        }
      }
    }
  }
}
```

### 2.5 中优先级：Mock 服务在生产环境启用

`vite-plugin-fake-server` 配置 `enableProd: true`，会带上 mock 代码到生产包。

**建议**：关闭 `enableProd`，或仅在开发环境启用，避免打包多余数据文件。

### 2.6 中优先级：开发调试插件进入生产

`code-inspector-plugin` 在开发有用，但默认会被打包进生产（无环境判断）。

**建议**：仅在 `mode === 'development'` 时启用。

### 2.7 高优先级：`main.ts` 全局注册大量重型插件

`src/main.ts` 全局注册 Element Plus、VxeTable、ECharts、VueTippy、MotionPlugin 等，导致入口 chunk 约 2.8 MB，且无法 tree-shake。

**建议**：
1. 改用 `unplugin-vue-components` + `unplugin-auto-import` 实现 Element Plus 按需自动导入。
2. 删除 `src/plugins/elementPlus.ts` 的全局注册。
3. 移除视图中手写的 `import { ElButton, ElTable, ... }`，统一走自动导入。
4. ECharts、VxeTable、Tippy 等插件改为仅在需要的页面/组件中注册，或延迟到首次使用时加载。

### 2.8 高优先级：`optimizeDeps.include` 包含大量未使用库

`build/optimize.ts` 中列出 55 个依赖进行预构建，包含 codemirror、vditor、wavesurfer.js、deep-chat、xlsx、mqtt、xgplayer、vue-ganttastic 等演示页面才用得到的库，拖慢 dev 启动并占用内存。

**建议**：
1. 删除不可达的 demo 视图（`src/views/{able,table,monitor,components,...}`）。
2. 同步精简 `build/optimize.ts` 的 `include` 列表，仅保留业务实际依赖。

### 2.9 中优先级：CDN 与压缩在生产环境未启用

`.env.production` 中 `VITE_COMPRESSION = "none"`、`VITE_CDN = false`，导致生产包 27 MB 且未压缩，传输体积大。

**建议**：
1. 将 `VITE_COMPRESSION` 改为 `"gzip"` 或 `"both"`。
2. 如需进一步减小 vendor chunk，开启 `VITE_CDN` 将 Vue/Vue Router/Element Plus/Axios/Dayjs/ECharts 走 CDN。

### 2.10 中优先级：TypeScript 严格模式关闭

`tsconfig.json` 中 `strict: false`、`strictFunctionTypes: false`，ESLint 也关闭 `@typescript-eslint/no-explicit-any`，代码中 `any` 泛滥。

**建议**：
1. 优先在 `wanying` 模块开启 `strict: true`。
2. 启用 `@typescript-eslint/no-explicit-any: "warn"`，逐步替换 `any`。

### 2.11 中优先级：RePureTableBar 与 ReVxeTableBar 重复

`src/components/RePureTableBar/index.vue`（469 行）与 `src/components/ReVxeTableBar/index.vue`（458 行）高度重复，仅在 `tableRef` / `vxeTableRef` 和展开/刷新方法上有差异。

**建议**：合并为一个可配置的 `ReTableBar`，通过 props 区分底层表格组件。

### 2.12 中优先级：CRUD hook 重复

`src/views/system/user/utils/hook.tsx`、role/menu/dept 等 hook 中 `onSearch`、`resetForm`、`openDialog`、`handleDelete`、分页逻辑大量重复。

**建议**：封装 `useCrudTable(tableRef, api, columns)` 通用 composable，统一搜索、分页、新增/编辑弹窗、删除、状态切换逻辑。

### 2.13 中优先级：万影业务直接调用 `http` 而非 `src/api/`

`wanying/index.vue` 中直接调用 `http.get/http.request`，未走 `src/api/` 层，缺少统一类型和错误处理。

**建议**：建立 `src/api/wanying.ts`，将接口调用和 DTO 类型集中管理。

### 2.14 低优先级：两个明显 Bug

1. **`src/router/index.ts` 的 `scrollBehavior`**：Promise 中直接 `return savedPosition` 而未调用 `resolve(savedPosition)`，导致滚动恢复不生效。
2. **`src/plugins/i18n.ts` 的 `getObjectKeys`**：将 `key` 而非 `newKey` 加入 keys 集合，嵌套国际化 key 的 flat 缓存会缺失。

**建议**：修复上述两处代码。

### 2.15 低优先级：移除 console 插件的例外配置

`removeConsole` 排除了 `src/assets/iconfont/iconfont.js`，该文件若存在，可能引入外部字体脚本。

**建议**：确认 iconfont 是否仍在使用，如无需求移除该例外。

### 2.16 低优先级：格式化工具版本激进

`eslint: ^10.9.0`、`typescript: ^6.0.3`、`prettier: ^3.9.6` 等版本领先于社区稳定版，可能遇到插件兼容性问题。

**建议**：将核心工具链降级到 LTS 兼容版本（TypeScript 5.5、ESLint 8/9 稳定配置）。

---

## 三、frontend 优化点

### 3.1 高优先级：API 层职责过重且类型不安全

`app/composables/useApi.ts` 包含：
- 基础请求 `req`
- token/ workspace 头处理
- 上传逻辑 `uploadReq`
- 10+ 个 API 模块（auth、workspace、pricing、episode、character、scene、prop、task、merge、aiConfig、prompt、skills、stylePreset、admin）

所有 API 方法返回 `any`，没有 DTO 类型，类型检查等于失效。

**建议**：
1. 拆分 API 模块到 `app/api/*.ts`。
2. 与 backend 共享 TypeScript DTO，或根据 OpenAPI/Drizzle 生成类型。
3. 将 `req` 中的 admin 判断逻辑（`isAdminRequest`）提取到拦截器或独立的 `useAdminApi`。
4. `console.log` 控制台输出应仅在开发环境开启。

### 3.2 高优先级：硬编码 localStorage key

多处直接写 `localStorage.getItem('wanying:session')`、`wanying:admin-session`、`wanying:workspace`。

**风险**：拼写错误、替换困难。

**建议**：集中到 `app/constants/storage.ts`：

```ts
export const STORAGE_KEYS = {
  session: 'wanying:session',
  adminSession: 'wanying:admin-session',
  workspace: 'wanying:workspace'
} as const
```

### 3.3 中优先级：手动注册动态路由

`nuxt.config.ts` 通过 `pages:extend` 手动注册 `/drama/:id` 和 `/drama/:id/episode/:episodeNumber`。注释说明是为了避免方括号路径在 shell/git 中的转义问题。

**建议**：这是可接受的做法，但建议将动态页面统一放到 `app/pages/drama/[id].vue` 并使用 Nuxt 文件路由，或保持当前方案并补充文档说明。

### 3.4 中优先级：`ssr: false` 但未做 SPA 优化

已关闭 SSR，相当于纯客户端渲染。如果未来要做 SEO/首屏，需改回 SSR。

**建议**：
1. 确认短剧详情页是否需要 SEO；如需，对 `/drama/:id` 启用 SSR。
2. 当前纯 SPA 下，可移除 Nuxt SSR 相关依赖，改用 Vite + Vue Router 进一步轻量化。

### 3.5 中优先级：Element Plus 全量引入

`frontend` 依赖 `element-plus`，但未看到自动导入或按需引入配置。

**建议**：配置 `nuxt.config.ts` 中的 Element Plus 自动导入（或改用更轻量的 UI 库），避免打包全部组件。

### 3.6 中优先级：缺少错误边界与状态管理

目前无全局错误处理、加载状态、请求缓存。在 AI 生成任务长轮询等场景下，容易出现重复请求和状态不一致。

**建议**：
1. 引入 `@tanstack/vue-query` 或 `useFetch` + `useAsyncData` 做请求缓存与去重。
2. 建立 `useErrorHandler` 统一处理网络/业务错误。

### 3.7 中优先级：组件数量极少、大量内联 SVG/样式

`app/components/` 仅有 4 个组件（BaseSelect、ConfirmDialog、MentionTextarea、ModelSelect）。业务页面大量使用内联 SVG、内联按钮/弹窗/表格/表单，可复用性低。

**建议**：
1. 提取通用组件：`AppButton`、`AppInput`、`AppDialog`、`AppEmpty`、`AppSkeleton`、`AppTable`、`PageHeader`。
2. 将手写 SVG 替换为 `lucide-vue-next` 图标组件。
3. `ConfirmDialog` 当前图标硬编码为 `Trash2`，应改为可配置。

### 3.8 中优先级：认证逻辑重复

- `useAuth.ts` 管理 session cookie + localStorage。
- `auth.global.ts` 又单独读取 localStorage/cookie 并验证。
- `admin/login.vue`、`admin/index.vue` 再次手动读写 `wanying:admin-session`。
- `login.vue:68` 的 `if (user.value) navigateTo('/')` 缺少 `await`。

**建议**：
1. 统一认证逻辑到 `useAuth`，中间件和页面只调用 `useAuth`。
2. 给 `navigateTo` 加 `await`。

### 3.9 中优先级：两个明显 Bug / 死代码

1. **`app/pages/workspaces.vue`**：直接 `definePageMeta({ middleware: () => navigateTo('/') })`，页面无实际功能，是死路由。
2. **`app/pages/settings.vue`**：`showBrandImage`、`brandLogo` 导入后未使用。
3. **`app/pages/index.vue`**：存在两个 `onMounted`，可合并。
4. **`app/pages/admin/index.vue`**：把 `ElMessage` 重新赋值给 `toast`，与全局 `vue-sonner` 冲突，造成同项目两套 toast。

**建议**：修复或移除死代码，统一使用 `vue-sonner`。

### 3.10 低优先级：`tests/` 目录无运行脚本

`frontend/tests/` 存在 14 个结构测试文件，但 `package.json` 没有 `test` script，无法直接运行。

**建议**：在 `package.json` 增加 `"test": "vitest run"` 或相应测试脚本，让现有测试可执行。

---

## 四、跨项目优化点

### 4.1 API 定义重复

admin-console 与 frontend 分别维护自己的 HTTP 请求层和接口定义，后端修改时两端都要同步。

**建议**：
1. 在 backend 生成 OpenAPI/Swagger 文档。
2. 通过 `openapi-typescript` 生成共享类型到 `shared/api-types/`。
3. 两端统一 API 客户端生成方案（如 `orval`、`openapi-generator`）。

### 4.2 UI 组件库不统一

admin-console 用 Element Plus + 大量模板自定义组件；frontend 也用 Element Plus，但体量更小。

**建议**：
1. 统一 Element Plus 主题变量与基础组件封装。
2. 将通用组件下沉到 `packages/ui`（monorepo 方案）或统一 copy。

### 4.3 缺少端到端测试

两个项目均无 E2E 测试配置。

**建议**：在 frontend 增加 Playwright（已有 `.playwright-mcp` 目录，说明有相关工具），在 admin-console 增加关键流程测试。

### 4.4 构建产物未监控

admin-console 有 `rollup-plugin-visualizer`，但只在 `npm run report` 时启用；frontend 无分析工具。

**建议**：
1. admin-console 将报告产物纳入 CI 或定期运行。
2. frontend 使用 `nuxt-bundle-stats` 或 `vite-bundle-analyzer` 监控产物。

---

## 五、可执行优化路线图

| 阶段 | 目标 | 涉及项目 | 预计工时 |
|---|---|---|---|
| 1 | 移除 admin-console 未使用依赖，跑通构建 | admin-console | 1–2 天 |
| 2 | 拆分 wanying/index.vue 为独立页面 | admin-console | 2–3 天 |
| 3 | API 类型化 + 模块拆分，前端引入 Pinia/Vue Query | frontend | 2–3 天 |
| 4 | 产物分包、构建目标升级、关闭生产 mock | admin-console | 1 天 |
| 5 | 共享 API 类型与组件库沉淀 | 两端 | 3–5 天 |
| 6 | 增加 E2E/产物监控 | 两端 | 2–3 天 |

---

## 六、立即可以执行的最小改动

1. admin-console 关闭 `vite-plugin-fake-server` 的生产启用（`enableProd: false`）。
2. admin-console `build.target` 改为 `"es2020"`，恢复 `chunkSizeWarningLimit` 默认值。
3. admin-console 修复 `scrollBehavior` 与 `i18n flat key` 两个 bug。
4. admin-console 在 `.env.production` 开启 `VITE_COMPRESSION`。
5. frontend 将 `useApi.ts` 中所有 `localStorage` key 抽到 `app/constants/storage.ts`。
6. frontend 关闭 `useApi.ts` 中的 `console.log` 或改为开发环境判断。
7. frontend 给 `login.vue:68` 的 `navigateTo('/')` 加 `await`。
8. 两端统一 `BASE_URL` 与代理配置，避免硬编码 `localhost:5679`。

---

## 七、结论

admin-console 的主要问题是 **模板遗产重、依赖冗余、业务组件巨型化、全局注册导致入口包过大**；frontend 的主要问题是 **API 层类型缺失、状态管理薄弱、组件复用率低、认证逻辑重复**。优先解决 admin-console 的依赖清理、Element Plus 自动导入和组件拆分，能在短期内显著降低构建与维护成本；frontend 则应优先做 API 类型化和状态管理，避免业务复杂后失控。
