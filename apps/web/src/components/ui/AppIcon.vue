<script setup lang="ts">
import { computed } from 'vue';

type IconName =
  | 'vault'
  | 'settings'
  | 'filter'
  | 'user'
  | 'more'
  | 'all'
  | 'favorites'
  | 'trash'
  | 'login'
  | 'document'
  | 'card'
  | 'secure_note'
  | 'folder'
  | 'lock'
  | 'plus'
  | 'eye'
  | 'copy'
  | 'globe'
  | 'search'
  | 'attachment'
  | 'download'
  | 'edit'
  | 'chevron_left'
  | 'close';

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number;
  }>(),
  {
    size: 18,
  },
);

const iconNameMap: Record<IconName, string> = {
  vault: 'shield',
  settings: 'settings',
  filter: 'filter_list',
  user: 'person',
  more: 'more_horiz',
  all: 'deployed_code',
  favorites: 'star',
  trash: 'delete',
  login: 'key',
  document: 'description',
  card: 'credit_card',
  secure_note: 'sticky_note_2',
  folder: 'folder',
  lock: 'lock',
  plus: 'add',
  eye: 'visibility',
  copy: 'content_copy',
  globe: 'language',
  search: 'search',
  attachment: 'attach_file',
  download: 'download',
  edit: 'edit',
  chevron_left: 'chevron_left',
  close: 'close',
};

const glyph = computed(() => iconNameMap[props.name] ?? 'help');
const iconStyle = computed(() => ({
  fontSize: `${props.size + 2}px`,
}));
</script>

<template>
  <span class="material-symbols-rounded app-icon" aria-hidden="true" focusable="false" :style="iconStyle">
    {{ glyph }}
  </span>
</template>
