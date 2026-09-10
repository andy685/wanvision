import { http } from "@/utils/http";

export type UserResult = {
  code: number;
  message: string;
  data: {
    admin: {
      id: number;
      username: string;
      phone: string;
      nickname?: string;
      avatar?: string;
      role: string;
      status: string;
    };
    token: string;
    expiresAt: string;
    /** 头像 */
    avatar: string;
    /** 用户名 */
    username: string;
    /** 昵称 */
    nickname: string;
    /** 当前登录用户的角色 */
    roles: Array<string>;
    /** 按钮级别权限 */
    permissions: Array<string>;
    /** `token` */
    accessToken: string;
    /** 用于调用刷新`accessToken`的接口时所需的`token` */
    refreshToken: string;
    /** `accessToken`的过期时间（格式'xxxx/xx/xx xx:xx:xx'） */
    expires: Date;
  };
};

export type RefreshTokenResult = {
  code: number;
  message: string;
  data: {
    /** `token` */
    accessToken: string;
    /** 用于调用刷新`accessToken`的接口时所需的`token` */
    refreshToken: string;
    /** `accessToken`的过期时间（格式'xxxx/xx/xx xx:xx:xx'） */
    expires: Date;
  };
};

export type UserInfo = {
  /** 头像 */
  avatar: string;
  /** 用户名 */
  username: string;
  /** 昵称 */
  nickname: string;
  /** 邮箱 */
  email: string;
  /** 联系电话 */
  phone: string;
  /** 简介 */
  description: string;
};

export type UserInfoResult = {
  code: number;
  message: string;
  data: UserInfo;
};

type ResultTable = {
  code: number;
  message: string;
  data?: {
    /** 列表数据 */
    list: Array<any>;
    /** 总条目数 */
    total?: number;
    /** 每页显示条目个数 */
    pageSize?: number;
    /** 当前页数 */
    currentPage?: number;
  };
};

/** 登录 */
export const getLogin = (data?: object) => {
  const payload = data as { username?: string; password?: string };
  return http.request<UserResult>("post", "/auth/admin-login", {
    data: { username: payload?.username || "", password: payload?.password || "" }
  });
};

/** 刷新`token` */
export const refreshTokenApi = (data?: object) => {
  return http.request<RefreshTokenResult>("post", "/refresh-token", { data });
};

/** 账户设置-个人信息 */
export const getMine = (data?: object) => {
  return http.request<UserInfoResult>("get", "/admin/mine", { data });
};

/** 账户设置-个人安全日志 */
export const getMineLogs = (data?: object) => {
  return http.request<ResultTable>("get", "/admin/mine-logs", { data });
};

export const updateMine = (data?: object) => {
  return http.request<UserInfoResult>("put", "/admin/mine", { data });
};

export const uploadAdminAvatar = (data?: object) => {
  return http.request<UserInfoResult>("post", "/admin/avatar", { data });
};

export const changeAdminPassword = (data?: object) => {
  return http.request<UserInfoResult>("post", "/admin/password", { data });
};

export const getAdminUsers = (data?: object) => {
  return http.request<ResultTable>("get", "/admin/admins", { data });
};

export const createAdminUser = (data?: object) => {
  return http.request<UserInfoResult>("post", "/admin/admins", { data });
};

export const updateAdminUser = (id: number, data?: object) => {
  return http.request<UserInfoResult>("patch", `/admin/admins/${id}`, { data });
};
