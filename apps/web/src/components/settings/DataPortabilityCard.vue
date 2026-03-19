<script setup lang="ts">
import PrimaryButton from '../ui/PrimaryButton.vue';

defineProps<{
  title: string;
  description: string;
  ctaLabel: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'action'): void;
}>();
</script>

<template>
  <article class="data-portability-card">
    <div class="data-portability-card__content">
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
    </div>
    <div class="data-portability-card__actions">
      <PrimaryButton type="button" :disabled="disabled" @click="emit('action')">
        {{ ctaLabel }}
      </PrimaryButton>
    </div>
  </article>
</template>
