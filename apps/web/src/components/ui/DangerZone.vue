<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<template>
  <section class="danger-zone">
    <div v-if="title" class="danger-zone__header">
      <h2>{{ title ?? 'DangerZone' }}</h2>
    </div>
    <div class="danger-zone__body">
      <slot />
    </div>
  </section>
</template>
