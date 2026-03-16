<script setup lang="ts">
const model = defineModel<string>({ required: true });

defineProps<{
  label: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  rows?: number;
}>();
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}</span>
    <textarea
      :name="name"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :rows="rows ?? 5"
      :value="model"
      @input="model = ($event.target as HTMLTextAreaElement).value"
    />
  </label>
</template>
