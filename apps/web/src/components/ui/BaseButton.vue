<script setup lang="ts">
defineProps<{
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>();
</script>

<template>
  <button class="button" :type="type ?? 'button'" :disabled="disabled">
    <slot />
  </button>
</template>
