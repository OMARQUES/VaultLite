<script setup lang="ts">
defineProps<{
  tone?: 'warning' | 'danger' | 'neutral';
}>();
</script>

<template>
  <div class="inline-alert inline-alert--hidden" aria-hidden="true"></div>
</template>
