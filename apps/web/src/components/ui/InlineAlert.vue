<script setup lang="ts">
defineProps<{
  tone?: 'warning' | 'danger' | 'neutral';
}>();
</script>

<template>
  <div class="inline-alert" :class="`inline-alert--${tone ?? 'neutral'}`" role="alert">
    <slot />
  </div>
</template>
