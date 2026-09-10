<script setup lang="ts">
import { message } from "@/utils/message";
import { onMounted, reactive, ref } from "vue";
import {
  type UserInfo,
  getMine,
  updateMine,
  uploadAdminAvatar
} from "@/api/user";
import type { FormInstance, FormRules } from "element-plus";
import ReCropperPreview from "@/components/ReCropperPreview";
import { deviceDetection, storageLocal } from "@pureadmin/utils";
import { useUserStoreHook } from "@/store/modules/user";
import { userKey, type DataInfo } from "@/utils/auth";
import uploadLine from "~icons/ri/upload-line";

defineOptions({
  name: "Profile"
});

const emit = defineEmits<{
  (event: "profile-updated", data: UserInfo): void;
}>();

const imgSrc = ref("");
const cropperBase64 = ref("");
const cropperBlob = ref();
const cropRef = ref();
const uploadRef = ref();
const isShow = ref(false);
const userInfoFormRef = ref<FormInstance>();
const userStore = useUserStoreHook();

const userInfos = reactive({
  avatar: "",
  username: "",
  nickname: "",
  email: "",
  phone: "",
  description: ""
});

const rules = reactive<FormRules<UserInfo>>({
  nickname: [{ required: true, message: "昵称必填", trigger: "blur" }]
});

function queryEmail(queryString, callback) {
  const emailList = [
    { value: "@qq.com" },
    { value: "@126.com" },
    { value: "@163.com" }
  ];
  let results = [];
  let queryList = [];
  emailList.map(item =>
    queryList.push({ value: queryString.split("@")[0] + item.value })
  );
  results = queryString
    ? queryList.filter(
        item =>
          item.value.toLowerCase().indexOf(queryString.toLowerCase()) === 0
      )
    : queryList;
  callback(results);
}

const onChange = uploadFile => {
  const reader = new FileReader();
  reader.onload = e => {
    imgSrc.value = e.target.result as string;
    isShow.value = true;
  };
  reader.readAsDataURL(uploadFile.raw);
};

const handleClose = () => {
  cropRef.value.hidePopover();
  uploadRef.value.clearFiles();
  isShow.value = false;
};

function syncProfileCache(data: Partial<UserInfo>) {
  userStore.SET_AVATAR(data.avatar || "");
  userStore.SET_NICKNAME(data.nickname || userInfos.nickname || "");
  const cached = storageLocal().getItem<DataInfo<number>>(userKey);
  if (cached) {
    storageLocal().setItem(userKey, {
      ...cached,
      avatar: data.avatar || "",
      nickname: data.nickname || userInfos.nickname || "",
      username: cached.username || userInfos.username
    });
  }
}

const onCropper = ({ base64, blob }) => {
  cropperBase64.value = base64;
  cropperBlob.value = blob;
};

const handleSubmitImage = async () => {
  if (!cropperBase64.value) {
    message("请先裁剪头像", { type: "warning" });
    return;
  }
  try {
    const { code, data } = await uploadAdminAvatar({
      avatar: cropperBase64.value,
      nickname: userInfos.nickname,
      email: userInfos.email
    });
    if ([0, 200].includes(code)) {
      Object.assign(userInfos, data);
      syncProfileCache(data);
      emit("profile-updated", data);
      message("更新头像成功", { type: "success" });
      handleClose();
    }
  } catch (error) {
    message(`提交异常 ${error}`, { type: "error" });
  }
};

// 更新信息
const onSubmit = async (formEl: FormInstance) => {
  await formEl.validate(async (valid, fields) => {
    if (valid) {
      const { code, data } = await updateMine({
        nickname: userInfos.nickname,
        email: userInfos.email,
        phone: userInfos.phone,
        avatar: userInfos.avatar
      });
      if ([0, 200].includes(code)) {
        Object.assign(userInfos, data);
        syncProfileCache(data);
        emit("profile-updated", data);
        message("更新信息成功", { type: "success" });
      }
    } else {
      console.log("error submit!", fields);
    }
  });
};

onMounted(async () => {
  const { code, data } = await getMine();
  if ([0, 200].includes(code)) {
    Object.assign(userInfos, data);
    syncProfileCache(data);
    emit("profile-updated", data);
  }
});
</script>

<template>
  <div :class="['min-w-45', deviceDetection() ? 'max-w-full' : 'max-w-[70%]']">
    <h3 class="my-8!">个人信息</h3>
    <el-form
      ref="userInfoFormRef"
      label-position="top"
      :rules="rules"
      :model="userInfos"
    >
      <el-form-item label="头像">
        <el-avatar :size="80" :src="userInfos.avatar" />
        <el-upload
          ref="uploadRef"
          accept="image/*"
          action="#"
          :limit="1"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="onChange"
        >
          <el-button plain class="ml-4!">
            <IconifyIconOffline :icon="uploadLine" />
            <span class="ml-2">更新头像</span>
          </el-button>
        </el-upload>
      </el-form-item>
      <el-form-item label="昵称" prop="nickname">
        <el-input v-model="userInfos.nickname" placeholder="请输入昵称" />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-autocomplete
          v-model="userInfos.email"
          :fetch-suggestions="queryEmail"
          :trigger-on-focus="false"
          placeholder="请输入邮箱"
          clearable
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="联系电话">
        <el-input
          v-model="userInfos.phone"
          placeholder="请输入联系电话"
          clearable
        />
      </el-form-item>
      <el-form-item label="简介">
        <el-input
          v-model="userInfos.description"
          placeholder="请输入简介"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 8 }"
          maxlength="56"
          show-word-limit
        />
      </el-form-item>
      <el-button type="primary" @click="onSubmit(userInfoFormRef)">
        更新信息
      </el-button>
    </el-form>
    <el-dialog
      v-model="isShow"
      width="40%"
      title="编辑头像"
      destroy-on-close
      :closeOnClickModal="false"
      :before-close="handleClose"
      :fullscreen="deviceDetection()"
    >
      <ReCropperPreview ref="cropRef" :imgSrc="imgSrc" @cropper="onCropper" />
      <template #footer>
        <div class="dialog-footer">
          <el-button bg text @click="handleClose">取消</el-button>
          <el-button bg text type="primary" @click="handleSubmitImage">
            确定
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
