<script setup lang="ts">
import BaseButton from './BaseButton.vue';

defineProps<{
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>();
</script>

<template>
  <BaseButton class="button--primary" :type="type" :disabled="disabled">
    <slot />
  </BaseButton>
</template>
