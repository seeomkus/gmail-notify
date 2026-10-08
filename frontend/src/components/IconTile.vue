<script setup lang="ts">
import Icon from "./Icon.vue";

withDefaults(defineProps<{ path: string; color: string; size?: number }>(), { size: 40 });
</script>

<template>
  <span class="tile" :style="{ '--c': color, width: size + 'px', height: size + 'px' }">
    <Icon :path="path" :size="Math.round(size * 0.56)" />
  </span>
</template>
