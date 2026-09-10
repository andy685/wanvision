<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElTable,
  ElTableColumn
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import WanyingPage from "./components/WanyingPage.vue";
import { data, errorText } from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.styles;
const loading = ref(false);
const rows = ref<any[]>([]);
const dialogOpen = ref(false);
const saving = ref(false);
const editing = ref<any>(null);
const form = ref<any>({});

async function load() {
  loading.value = true;
  try {
    rows.value = data(await http.get("/style-presets?all=1"));
  } catch (error: any) {
    message(errorText(error) || "数据加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function open(row?: any) {
  editing.value = row;
  form.value = row
    ? { ...row }
    : { name: "", value: "", prompt: "", description: "" };
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    await http.request(
      editing.value ? "put" : "post",
      editing.value ? `/style-presets/${editing.value.id}` : "/style-presets",
      { data: form.value }
    );
    dialogOpen.value = false;
    await load();
    message("保存成功", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <template #extra>
      <ElButton type="primary" @click="open()">新增风格</ElButton>
    </template>
    <ElCard shadow="never" v-loading="loading">
      <ElTable :data="rows" stripe>
        <ElTableColumn prop="name" label="风格名称" />
        <ElTableColumn prop="value" label="标识" />
        <ElTableColumn prop="description" label="说明" min-width="280" />
        <ElTableColumn label="操作">
          <template #default="{ row }">
            <ElButton link type="primary" @click="open(row)">编辑</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog v-model="dialogOpen" title="风格预设" width="560px">
      <ElForm label-position="top">
        <ElFormItem label="风格名称"><ElInput v-model="form.name" /></ElFormItem>
        <ElFormItem label="风格标识"><ElInput v-model="form.value" :disabled="!!editing" /></ElFormItem>
        <ElFormItem label="提示词">
          <ElInput v-model="form.prompt" type="textarea" :rows="5" />
        </ElFormItem>
        <ElFormItem label="说明"><ElInput v-model="form.description" /></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDialog>
  </WanyingPage>
</template>
