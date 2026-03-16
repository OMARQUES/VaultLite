<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
}>();
</script>

<template>
  <div v-if="open" class="dialog-backdrop" role="presentation">
    <div class="dialog-modal" role="dialog" aria-modal="true" :aria-label="title">
      <div class="dialog-modal__header">
        <h2>{{ title }}</h2>
      </div>
      <div class="dialog-modal__body">
        <slot />
      </div>
      <div v-if="$slots.actions" class="dialog-modal__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
