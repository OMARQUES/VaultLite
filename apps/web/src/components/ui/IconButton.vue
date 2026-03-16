<script setup lang="ts">
import BaseButton from './BaseButton.vue';

defineProps<{
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  label: string;
}>();
</script>

<template>
  <BaseButton class="button--icon" :type="type" :disabled="disabled" :aria-label="label" :title="label">
    <slot />
  </BaseButton>
</template>
