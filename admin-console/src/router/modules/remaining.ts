import { $t } from "@/plugins/i18n";
const Layout = () => import("@/layout/index.vue");

export default [
  // 兼容旧版短路径，重定向到 /wanying/* 下
  ...["overview", "analytics", "services", "payments", "pricing", "styles", "agents", "skills", "visual-presets", "agent-settings", "skill-settings", "users", "tasks", "orders", "logs"].map(path => ({ path: `/${path}`, redirect: `/wanying/${path === "styles" ? "visual-presets" : path === "agents" || path === "skills" || path === "skill-settings" ? "agent-settings" : path}`, meta: { title: "", showLink: false } })),
  {
    path: "/account-settings",
    name: "AccountSettings",
    component: () => import("@/views/account-settings/index.vue"),
    meta: {
      title: $t("buttons.pureAccountSettings"),
      showLink: false
    }
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/login/index.vue"),
    meta: {
      title: $t("menus.pureLogin"),
      showLink: false
    }
  },
  // 全屏403（无权访问）页面
  {
    path: "/access-denied",
    name: "AccessDenied",
    component: () => import("@/views/error/403.vue"),
    meta: {
      title: $t("menus.pureAccessDenied"),
      showLink: false
    }
  },
  // 全屏500（服务器出错）页面
  {
    path: "/server-error",
    name: "ServerError",
    component: () => import("@/views/error/500.vue"),
    meta: {
      title: $t("menus.pureServerError"),
      showLink: false
    }
  },
  {
    path: "/redirect",
    component: Layout,
    meta: {
      title: $t("status.pureLoad"),
      showLink: false
    },
    children: [
      {
        path: "/redirect/:path(.*)",
        name: "Redirect",
        component: () => import("@/layout/redirect.vue")
      }
    ]
  },
] satisfies Array<RouteConfigsTable>;
