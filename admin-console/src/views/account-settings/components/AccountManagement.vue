<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "@/utils/message";
import {
  changeAdminPassword,
  createAdminUser,
  getAdminUsers,
  updateAdminUser
} from "@/api/user";
import { useUserStoreHook } from "@/store/modules/user";
import { deviceDetection } from "@pureadmin/utils";
import { errorText, formatTime } from "@/views/wanying/utils/format";

defineOptions({
  name: "AccountManagement"
});

const userStore = useUserStoreHook();
const loading = ref(false);
const saving = ref(false);
const dialogOpen = ref(false);
const passwordDialogOpen = ref(false);
const resetPasswordDialogOpen = ref(false);
const passwordSaving = ref(false);
const admins = ref<any[]>([]);
const resetTarget = ref<any>(null);
const passwordForm = ref({
  current_password: "",
  new_password: "",
  confirm_password: ""
});
const resetPasswordForm = ref({
  password: "",
  confirm_password: ""
});
const form = ref({
  username: "",
  phone: "",
  password: "",
  role: "admin",
  nickname: "",
  email: "",
  avatar: ""
});

const isSuperAdmin = computed(
  () =>
    userStore.roles?.includes("super_admin") ||
    userStore.permissions?.includes("*")
);

function roleLabel(role: string) {
  return role === "super_admin" ? "超级管理员" : "管理员";
}

function resetForm() {
  form.value = {
    username: "",
    phone: "",
    password: "",
    role: "admin",
    nickname: "",
    email: "",
    avatar: ""
  };
}

function resetPasswordForms() {
  passwordForm.value = {
    current_password: "",
    new_password: "",
    confirm_password: ""
  };
  resetPasswordForm.value = {
    password: "",
    confirm_password: ""
  };
}

async function onSearch() {
  if (!isSuperAdmin.value) return;
  loading.value = true;
  try {
    const result = await getAdminUsers();
    admins.value = Array.isArray(result.data)
      ? result.data
      : result.data?.list || [];
  } catch (error: any) {
    message(errorText(error) || "管理员列表加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  resetForm();
  dialogOpen.value = true;
}

function openPasswordDialog() {
  resetPasswordForms();
  passwordDialogOpen.value = true;
}

function openResetPassword(row: any) {
  resetPasswordForms();
  resetTarget.value = row;
  resetPasswordDialogOpen.value = true;
}

async function onChangePassword() {
  if (passwordForm.value.new_password !== passwordForm.value.confirm_password) {
    message("两次输入的新密码不一致", { type: "warning" });
    return;
  }
  passwordSaving.value = true;
  try {
    await changeAdminPassword({
      current_password: passwordForm.value.current_password,
      new_password: passwordForm.value.new_password
    });
    passwordDialogOpen.value = false;
    message("密码修改成功，请重新登录", { type: "success" });
    userStore.logOut();
  } catch (error: any) {
    message(errorText(error) || "密码修改失败", { type: "error" });
  } finally {
    passwordSaving.value = false;
  }
}

async function onResetPassword() {
  if (resetPasswordForm.value.password !== resetPasswordForm.value.confirm_password) {
    message("两次输入的新密码不一致", { type: "warning" });
    return;
  }
  passwordSaving.value = true;
  try {
    await updateAdminUser(resetTarget.value.id, {
      password: resetPasswordForm.value.password
    });
    resetPasswordDialogOpen.value = false;
    await onSearch();
    message("管理员密码已重置", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "密码重置失败", { type: "error" });
  } finally {
    passwordSaving.value = false;
  }
}

async function onCreate() {
  saving.value = true;
  try {
    await createAdminUser(form.value);
    dialogOpen.value = false;
    await onSearch();
    message("管理员账号已创建", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "管理员创建失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

async function onUpdate(row: any, patch: Record<string, unknown>) {
  try {
    await updateAdminUser(row.id, patch);
    await onSearch();
    message("管理员账号已更新", { type: "success" });
  } catch (error: any) {
    await onSearch();
    message(errorText(error) || "管理员更新失败", { type: "error" });
  }
}

onMounted(() => {
  onSearch();
});
</script>

<template>
  <div :class="['min-w-45', deviceDetection() ? 'max-w-full' : 'max-w-[90%]']">
    <h3 class="my-8!">账户管理</h3>

    <div class="account-section">
      <div>
        <p class="section-title">当前账号密码</p>
        <el-text type="info">修改后当前后台会话会退出，需要使用新密码重新登录。</el-text>
      </div>
      <el-button type="primary" text @click="openPasswordDialog">
        修改密码
      </el-button>
    </div>

    <el-divider />

    <div class="flex items-center justify-between my-8!">
      <h3 class="m-0!">账户管理</h3>
      <el-button v-if="isSuperAdmin" type="primary" @click="openCreate">
        新建管理员
      </el-button>
    </div>

    <el-alert
      v-if="!isSuperAdmin"
      title="当前账号不是超级管理员，不能管理其他后台账号。"
      type="info"
      show-icon
      :closable="false"
    />

    <el-table
      v-else
      row-key="id"
      table-layout="auto"
      stripe
      :loading="loading"
      :data="admins"
    >
      <el-table-column prop="username" label="账号" min-width="130" />
      <el-table-column prop="nickname" label="昵称" min-width="130" />
      <el-table-column prop="phone" label="手机号" min-width="130" />
      <el-table-column prop="email" label="邮箱" min-width="170" />
      <el-table-column label="角色" width="160">
        <template #default="{ row }">
          <el-select
            v-model="row.role"
            size="small"
            @change="role => onUpdate(row, { role })"
          >
            <el-option label="超级管理员" value="super_admin" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-switch
            :model-value="row.status === 'active'"
            inline-prompt
            active-text="正常"
            inactive-text="停用"
            @change="
              active =>
                onUpdate(row, { status: active ? 'active' : 'disabled' })
            "
          />
        </template>
      </el-table-column>
      <el-table-column label="权限" width="120">
        <template #default="{ row }">
          <el-tag :type="row.role === 'super_admin' ? 'danger' : 'info'">
            {{ roleLabel(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" text @click="openResetPassword(row)">
            重置密码
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogOpen" title="新建管理员" width="560px">
      <el-form label-position="top">
        <el-form-item label="后台账号">
          <el-input
            v-model="form.username"
            placeholder="3-32 位英文、数字、下划线或横线"
          />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="请输入 11 位手机号" />
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="至少 8 位"
          />
        </el-form-item>
        <el-form-item label="角色权限">
          <el-select v-model="form.role" class="w-full">
            <el-option label="管理员" value="admin" />
            <el-option label="超级管理员" value="super_admin" />
          </el-select>
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="默认使用后台账号" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="可选" />
        </el-form-item>
        <el-form-item label="头像 URL">
          <el-input v-model="form.avatar" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onCreate">
          创建
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordDialogOpen" title="修改密码" width="480px">
      <el-form label-position="top">
        <el-form-item label="当前密码">
          <el-input
            v-model="passwordForm.current_password"
            type="password"
            show-password
            placeholder="请输入当前密码"
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="passwordForm.new_password"
            type="password"
            show-password
            placeholder="至少 8 位"
          />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input
            v-model="passwordForm.confirm_password"
            type="password"
            show-password
            placeholder="请再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="onChangePassword">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="resetPasswordDialogOpen"
      title="重置管理员密码"
      width="480px"
    >
      <p class="reset-tip">
        正在重置 {{ resetTarget?.username }} 的登录密码，保存后该账号旧会话会失效。
      </p>
      <el-form label-position="top">
        <el-form-item label="新密码">
          <el-input
            v-model="resetPasswordForm.password"
            type="password"
            show-password
            placeholder="至少 8 位"
          />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input
            v-model="resetPasswordForm.confirm_password"
            type="password"
            show-password
            placeholder="请再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPasswordDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="onResetPassword">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.account-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}

.reset-tip {
  margin: 0 0 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
