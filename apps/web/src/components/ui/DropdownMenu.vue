<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  label: string;
  items: ReadonlyArray<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  select: [value: string];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function handleDocumentClick(event: MouseEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    open.value = false;
  }
}

function select(value: string) {
  open.value = false;
  emit('select', value);
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<template>
  <div ref="rootRef" class="dropdown-menu">
    <button
      class="button button--primary dropdown-menu__trigger"
      type="button"
      :aria-expanded="open ? 'true' : 'false'"
      @click="open = !open"
    >
      <span class="dropdown-menu__trigger-icon" aria-hidden="true">+</span>
      <span>{{ props.label }}</span>
    </button>
    <div v-if="open" class="dropdown-menu__surface" role="menu">
      <button
        v-for="item in props.items"
        :key="item.value"
        class="dropdown-menu__item"
        type="button"
        role="menuitem"
        @click="select(item.value)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
