<script setup lang="ts">
import { ref } from 'vue';

const inputRef = ref<HTMLInputElement | null>(null);
const model = defineModel<string>({ required: true });

defineProps<{
  label: string;
  name?: string;
  type?: string;
  placeholder?: string;
  autocomplete?: string;
  disabled?: boolean;
  required?: boolean;
  readonly?: boolean;
}>();

defineExpose({
  focus() {
    inputRef.value?.focus();
  },
});
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}</span>
    <input
      ref="inputRef"
      :name="name"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :disabled="disabled"
      :required="required"
      :readonly="readonly"
      :value="model"
      @input="model = ($event.target as HTMLInputElement).value"
    />
  </label>
</template>
