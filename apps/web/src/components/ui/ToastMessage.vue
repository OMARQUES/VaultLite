<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <div class="toast-message toast-message--hidden" aria-hidden="true"></div>
</template>
