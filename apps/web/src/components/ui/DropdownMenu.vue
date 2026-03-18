<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  label: string;
  items: ReadonlyArray<{ label: string; value: string; icon?: 'login' | 'document' | 'card' | 'secure_note' }>;
  iconOnly?: boolean;
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
      :class="{ 'dropdown-menu__trigger--icon-only': props.iconOnly }"
      type="button"
      :aria-label="props.label"
      :aria-expanded="open ? 'true' : 'false'"
      @click="open = !open"
    >
      <AppIcon class="dropdown-menu__trigger-icon" name="plus" :size="16" />
      <span v-if="!props.iconOnly">{{ props.label }}</span>
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
        <span class="dropdown-menu__item-content">
          <AppIcon v-if="item.icon" class="dropdown-menu__item-icon" :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
