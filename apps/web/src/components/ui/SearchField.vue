<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from './AppIcon.vue';

const inputRef = ref<HTMLInputElement | null>(null);
const model = defineModel<string>({ required: true });

defineProps<{
  label: string;
  placeholder?: string;
  name?: string;
  testId?: string;
}>();

defineExpose({
  focus() {
    inputRef.value?.focus();
  },
});
</script>

<template>
  <label class="field field--search">
    <span class="sr-only">{{ label }}</span>
    <AppIcon class="field__search-icon" name="search" :size="18" />
    <input
      ref="inputRef"
      :data-testid="testId"
      :name="name"
      :placeholder="placeholder"
      :value="model"
      type="search"
      @input="model = ($event.target as HTMLInputElement).value"
    />
  </label>
</template>
