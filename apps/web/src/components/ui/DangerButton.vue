<script setup lang="ts">
import BaseButton from './BaseButton.vue';

defineProps<{
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>();
</script>

<template>
  <BaseButton class="button--danger" :type="type" :disabled="disabled">
    <slot />
  </BaseButton>
</template>
