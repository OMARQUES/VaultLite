<script setup lang="ts" generic="T extends string">
defineProps<{
  options: ReadonlyArray<{ label: string; value: T }>;
}>();

const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="segmented-control" role="tablist">
    <button
      v-for="option in options"
      :key="option.value"
      class="segmented-control__button"
      :class="{ 'is-active': option.value === model }"
      type="button"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
